import {
	Grid,
	MeshReflectorMaterial,
	OrbitControls,
	Outlines,
	RoundedBox,
} from "@react-three/drei";
import {
	Canvas,
	type ThreeEvent,
	useFrame,
	useThree,
} from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from "react";
import * as THREE from "three";
import {
	type Axle,
	type AxleZone,
	isAxleZone,
	statusColor,
	statusOf,
	type Zone,
	type ZoneSummary,
} from "@/lib/parts-map";
import {
	type BodyType,
	type PinId,
	pinViews,
	plans,
	type Station,
	type Vec3,
	type VehiclePlan,
	widthAt,
} from "@/lib/vehicle-plans";

/*
 * Vehículo procedural: la carrocería se arma con secciones superelípticas
 * (loft) a partir del plano de cada tipo, con un material holográfico de
 * borde brillante. Las piezas se ubican con las medidas del plano.
 */

const BG = "#07101f";
// Paleta de marca (azul Kilora) para el holograma; los estados usan statusColor.
const BRAND = "#7aa7e0";
const BRAND_SOFT = "#a9c7f0";
const BRAND_DEEP = "#1e4f8f";

/** Lo que usamos de OrbitControls (evita depender de los tipos de three-stdlib). */
type Controls = THREE.EventDispatcher<{ start: object }> & {
	target: THREE.Vector3;
	update: () => void;
};

export type SceneMode = "zonas" | "salud";

type SceneState = {
	summary: Record<Zone, ZoneSummary>;
	selected: Zone;
	hover: Zone | null;
	onHover: (zone: Zone | null) => void;
	onSelect: (zone: Zone, pin?: PinId) => void;
	/** Atenúa todo menos la zona elegida (después de que el usuario elige). */
	isolate: boolean;
	mode: SceneMode;
	/** Color de la carrocería en modo salud. */
	healthTint: string;
};

/** Animaciones compartidas: 0–1 de la vista explotada y frente del escaneo. */
type Fx = {
	explode: RefObject<number>;
	revealX: RefObject<number>;
	scale: number;
};

const SceneContext = createContext<
	(SceneState & { plan: VehiclePlan; fx: Fx }) | null
>(null);
const useScene = () => {
	const ctx = useContext(SceneContext);
	if (!ctx) throw new Error("useScene fuera de la escena");
	return ctx;
};

export type CarSceneProps = SceneState & {
	bodyType: BodyType;
	/** Cambia cada vez que se pide enfocar algo (null = vista general). */
	focus: { pin: PinId | null; key: number };
	autoRotate: boolean;
	exploded: boolean;
	onInteract: () => void;
	/** Pines (DOM, fuera del canvas) que la escena posiciona en cada cuadro. */
	pins: RefObject<Partial<Record<PinId, HTMLElement | null>>>;
};

/* ------------------------------ Vista explotada ----------------------------- */

const EXPLODE: Record<Exclude<Zone, AxleZone>, Vec3> = {
	aceite: [0, -0.5, 0],
	motor: [0, 0.85, 0],
	refrigeracion: [0.7, 0.3, 0],
	aire_acondicionado: [1.05, 0, 0],
	bateria: [0.2, 0.95, 0.55],
	electrico: [0.45, 0, 0],
	transmision: [0, -0.55, 0],
	direccion: [0, 0.5, 0],
	escape: [0, -0.6, 0],
	carroceria: [0, 1.25, 0],
};

function cornerExplode(zone: AxleZone, side: number): Vec3 {
	if (zone === "llantas") return [0, 0, side * 0.85];
	if (zone === "frenos") return [0, 0, side * 0.45];
	return [0, 0.55, side * 0.3];
}

/** Desplazamiento de un pin en la vista explotada (los de eje van del lado derecho). */
function pinExplode(id: PinId): Vec3 {
	const [zone] = id.split(":") as [Zone];
	return isAxleZone(zone) ? cornerExplode(zone, 1) : EXPLODE[zone];
}

function Explode({ offset, children }: { offset: Vec3; children: ReactNode }) {
	const { fx } = useScene();
	const ref = useRef<THREE.Group>(null);
	useFrame(() => {
		const k = (fx.explode.current ?? 0) * fx.scale;
		ref.current?.position.set(offset[0] * k, offset[1] * k, offset[2] * k);
	});
	return <group ref={ref}>{children}</group>;
}

/* ---------------------------------- Escena ---------------------------------- */

export default function CarScene({
	bodyType,
	focus,
	autoRotate,
	exploded,
	onInteract,
	pins,
	summary,
	selected,
	hover,
	onHover,
	onSelect,
	isolate,
	mode,
	healthTint,
}: CarSceneProps) {
	const plan = plans[bodyType];
	const explode = useRef(0);
	const revealX = useRef(Number.NEGATIVE_INFINITY);
	const ctx = useMemo(
		() => ({
			summary,
			selected,
			hover,
			onHover,
			onSelect,
			isolate,
			mode,
			healthTint,
			plan,
			fx: { explode, revealX, scale: plan.length / 4.65 },
		}),
		[
			summary,
			selected,
			hover,
			onHover,
			onSelect,
			isolate,
			mode,
			healthTint,
			plan,
		],
	);
	return (
		<Canvas
			dpr={[1, 1.75]}
			camera={{ position: plan.camera.home, fov: 35, near: 0.1, far: 80 }}
			gl={{ antialias: true, powerPreference: "high-performance" }}
			onPointerMissed={() => onHover(null)}
		>
			<color attach="background" args={[BG]} />
			<fog attach="fog" args={[BG, plan.length * 2, plan.length * 4.2]} />
			<SceneContext.Provider value={ctx}>
				<hemisphereLight args={[BRAND, BG, 0.75]} />
				<ambientLight intensity={0.3} />
				<directionalLight position={[5, 8, 5]} intensity={1.2} />
				<directionalLight
					position={[-6, 4, -4]}
					intensity={0.5}
					color={BRAND_SOFT}
				/>

				<Effects exploded={exploded} />
				<Vehicle key={bodyType} />
				<Floor />
				<PinProjector pins={pins} />

				<OrbitControls
					makeDefault
					target={plan.camera.target}
					enablePan={false}
					enableDamping
					minDistance={plan.length * 0.32}
					maxDistance={plan.length * 2.6}
					maxPolarAngle={Math.PI * 0.53}
					autoRotate={autoRotate}
					autoRotateSpeed={0.6}
				/>
				<CameraRig focus={focus} onInteract={onInteract} exploded={exploded} />
			</SceneContext.Provider>
			<EffectComposer multisampling={0}>
				<Bloom
					mipmapBlur
					intensity={0.75}
					luminanceThreshold={0.42}
					luminanceSmoothing={0.25}
				/>
				<Vignette offset={0.3} darkness={0.55} />
			</EffectComposer>
		</Canvas>
	);
}

/** Anima la vista explotada y el escaneo de entrada (se repite al cambiar de tipo). */
function Effects({ exploded }: { exploded: boolean }) {
	const { plan, fx } = useScene();
	const start = useRef<number | null>(null);
	const reduce = useMemo(
		() =>
			typeof window !== "undefined" &&
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		[],
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: reinicia el escaneo al cambiar de vehículo.
	useEffect(() => {
		start.current = null;
	}, [plan]);
	useFrame(({ clock }, dt) => {
		const target = exploded ? 1 : 0;
		const k = reduce ? 1 : 1 - Math.exp(-dt * 4);
		fx.explode.current += (target - fx.explode.current) * k;
		if (reduce) {
			fx.revealX.current = Number.POSITIVE_INFINITY;
			return;
		}
		if (start.current === null) start.current = clock.elapsedTime;
		const t = Math.min(1, (clock.elapsedTime - start.current) / 2.4);
		const half = plan.length / 2 + 0.4;
		fx.revealX.current =
			t >= 1 ? Number.POSITIVE_INFINITY : -half + (1 - (1 - t) ** 3) * 2 * half;
	});
	return null;
}

/* ------------------------------- Cámara y pines ------------------------------ */

function CameraRig({
	focus,
	onInteract,
	exploded,
}: Pick<CarSceneProps, "focus" | "onInteract" | "exploded">) {
	const { plan } = useScene();
	const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
	const aspect = useThree((s) => s.size.width / s.size.height);
	const controls = useThree((s) => s.controls) as unknown as Controls | null;
	const views = useMemo(() => pinViews(plan), [plan]);
	const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(
		null,
	);

	// En celular (vertical) la cámara se acerca para que el vehículo llene la vista.
	const zoom = aspect < 1 ? 0.9 : 1;
	useEffect(() => {
		camera.fov = aspect < 1 ? 46 : aspect < 1.4 ? 42 : 35;
		camera.updateProjectionMatrix();
	}, [aspect, camera]);
	useEffect(() => {
		if (zoom === 1) return;
		const target = new THREE.Vector3(...plan.camera.target);
		camera.position.sub(target).multiplyScalar(zoom).add(target);
	}, [zoom, camera, plan]);

	useEffect(() => {
		if (!focus.key) return;
		if (!focus.pin) {
			// Explotado, las piezas ocupan más: la cámara se aleja y sube un poco.
			const lift = exploded ? 0.45 * (plan.length / 4.65) : 0;
			goal.current = {
				pos: new THREE.Vector3(...plan.camera.home).multiplyScalar(
					(exploded ? 1.35 : 1) * zoom,
				),
				target: new THREE.Vector3(...plan.camera.target).add(
					new THREE.Vector3(0, lift, 0),
				),
			};
			return;
		}
		const { anchor, dir, dist } = views[focus.pin];
		const target = new THREE.Vector3(...anchor);
		const pos = target
			.clone()
			.add(new THREE.Vector3(...dir).normalize().multiplyScalar(dist));
		pos.y = Math.max(pos.y, 0.3);
		goal.current = { pos, target };
	}, [focus, views, plan, exploded, zoom]);

	useEffect(() => {
		if (!controls) return;
		const stop = () => {
			goal.current = null;
			onInteract();
		};
		controls.addEventListener("start", stop);
		return () => controls.removeEventListener("start", stop);
	}, [controls, onInteract]);

	useFrame((_, dt) => {
		const g = goal.current;
		if (!g || !controls) return;
		const k = 1 - Math.exp(-dt * 3.5);
		camera.position.lerp(g.pos, k);
		controls.target.lerp(g.target, k);
		controls.update();
		if (
			camera.position.distanceTo(g.pos) < 0.005 &&
			controls.target.distanceTo(g.target) < 0.005
		)
			goal.current = null;
	});
	return null;
}

const CLUSTER_PX = 30;
/** Zona que ocupa la etiqueta elevada del pin activo (px). */
const CALLOUT_W = 70;
const CALLOUT_H = 72;

/**
 * Proyecta cada pin a la pantalla. Los que quedan encimados se agrupan: queda
 * visible uno (el activo o el de más servicios) con un "+N" de los ocultos.
 */
function PinProjector({ pins }: { pins: CarSceneProps["pins"] }) {
	const { plan, fx } = useScene();
	const camera = useThree((s) => s.camera);
	const size = useThree((s) => s.size);
	const anchors = useMemo(
		() =>
			Object.entries(pinViews(plan)).map(([id, view]) => ({
				id: id as PinId,
				anchor: new THREE.Vector3(...view.anchor),
				offset: new THREE.Vector3(...pinExplode(id as PinId)),
			})),
		[plan],
	);
	const v = useMemo(() => new THREE.Vector3(), []);
	useFrame(() => {
		const k = (fx.explode.current ?? 0) * fx.scale;
		const shown: { el: HTMLElement; x: number; y: number; rank: number }[] = [];
		for (const { id, anchor, offset } of anchors) {
			const el = pins.current[id];
			if (!el) continue;
			v.copy(anchor).addScaledVector(offset, k);
			const revealed = anchor.x <= (fx.revealX.current ?? 0);
			v.project(camera);
			const x = ((v.x + 1) / 2) * size.width;
			const y = ((1 - v.y) / 2) * size.height;
			el.style.transform = `translate(${x}px, ${y}px)`;
			if (v.z > 1 || !revealed || el.dataset.enabled !== "1") {
				el.style.visibility = "hidden";
				continue;
			}
			const rank =
				(el.dataset.active === "1" ? 1000 : 0) + Number(el.dataset.count ?? 0);
			shown.push({ el, x, y, rank });
		}
		shown.sort((a, b) => b.rank - a.rank);
		const leaders: {
			el: HTMLElement;
			x: number;
			y: number;
			extra: number;
			callout: boolean;
		}[] = [];
		for (const p of shown) {
			// El pin activo muestra su etiqueta elevada: también ocupa ese lugar.
			const near = leaders.find(
				(l) =>
					Math.hypot(l.x - p.x, l.y - p.y) < CLUSTER_PX ||
					(l.callout &&
						Math.abs(l.x - p.x) < CALLOUT_W &&
						p.y < l.y + 8 &&
						p.y > l.y - CALLOUT_H),
			);
			if (near) {
				p.el.style.visibility = "hidden";
				near.extra += 1;
			} else
				leaders.push({
					el: p.el,
					x: p.x,
					y: p.y,
					extra: 0,
					callout: p.rank >= 1000,
				});
		}
		for (const l of leaders) {
			l.el.style.visibility = "visible";
			const text = l.extra ? `+${l.extra}` : "";
			const badge = l.el.querySelector<HTMLElement>("[data-extra]");
			if (badge && badge.textContent !== text) {
				badge.textContent = text;
				badge.hidden = !text;
			}
		}
	});
	return null;
}

/* --------------------------------- Ambiente --------------------------------- */

function Floor() {
	const { plan } = useScene();
	const narrow = useThree((s) => s.size.width < 640);
	const glow = useMemo(
		() =>
			new THREE.ShaderMaterial({
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				uniforms: { uColor: { value: new THREE.Color("#3b74c4") } },
				vertexShader:
					"varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
				fragmentShader:
					"uniform vec3 uColor; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d) * 0.18 + smoothstep(0.025, 0.0, abs(d - 0.92)) * 0.55; gl_FragColor = vec4(uColor, a); }",
			}),
		[],
	);
	useEffect(() => () => glow.dispose(), [glow]);
	const r = plan.length * 0.78;
	return (
		<group>
			{/* Piso con reflejo suave: el holograma se refleja como en un showroom. */}
			<mesh
				rotation={[-Math.PI / 2, 0, 0]}
				position={[0, -0.004, 0]}
				raycast={noRay}
			>
				<planeGeometry args={[60, 60]} />
				<MeshReflectorMaterial
					resolution={narrow ? 256 : 512}
					blur={[260, 80]}
					mixBlur={1}
					mixStrength={14}
					mixContrast={1}
					mirror={0.35}
					depthScale={1}
					minDepthThreshold={0.4}
					maxDepthThreshold={1.4}
					color="#08142a"
					metalness={0.6}
					roughness={1}
				/>
			</mesh>
			<mesh
				rotation={[-Math.PI / 2, 0, 0]}
				position={[0, 0.003, 0]}
				material={glow}
				raycast={noRay}
			>
				<planeGeometry args={[r * 2, r * 2]} />
			</mesh>
			<Grid
				args={[30, 30]}
				position={[0, 0.001, 0]}
				cellSize={0.25}
				cellThickness={0.4}
				cellColor="#0d2340"
				sectionSize={1}
				sectionThickness={0.8}
				sectionColor={BRAND_DEEP}
				fadeDistance={plan.length * 3}
				fadeStrength={2}
				infiniteGrid
			/>
		</group>
	);
}

/* ----------------------------- Carrocería holográfica ----------------------------- */

const holoVertex = `
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
varying vec3 vWN;
void main() {
	vec4 wp = modelMatrix * vec4(position, 1.0);
	vW = wp.xyz;
	vWN = normalize(mat3(modelMatrix) * normal);
	vec4 mv = viewMatrix * wp;
	vN = normalize(normalMatrix * normal);
	vV = normalize(-mv.xyz);
	gl_Position = projectionMatrix * mv;
}`;
// Recorta los pasos de rueda (uArch: x, y, radio) en los costados y dibuja el
// frente del escaneo de entrada (uReveal).
const holoFragment = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uReveal;
uniform vec3 uArch[2];
uniform vec3 uLift;
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
varying vec3 vWN;
void main() {
	vec3 p = vW - uLift;
	for (int i = 0; i < 2; i++) {
		if (uArch[i].z > 0.0 && abs(vWN.z) > 0.3 && distance(p.xy, uArch[i].xy) < uArch[i].z) discard;
	}
	if (p.x > uReveal) discard;
	float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
	float scan = smoothstep(0.92, 1.0, sin(p.y * 70.0 - uTime * 1.6));
	float edge = smoothstep(0.4, 0.0, uReveal - p.x);
	float a = (f * 0.9 + 0.025 + scan * 0.035) * uOpacity + edge * 0.55;
	gl_FragColor = vec4(uColor * (0.55 + f * 1.6) + edge * vec3(0.7, 0.85, 1.0), a);
}`;

function useHolo(color: string, opacity: number, arches: Vec3[] = []) {
	const { fx } = useScene();
	const material = useMemo(
		() =>
			new THREE.ShaderMaterial({
				transparent: true,
				depthWrite: false,
				side: THREE.DoubleSide,
				blending: THREE.AdditiveBlending,
				uniforms: {
					uColor: { value: new THREE.Color() },
					uOpacity: { value: 1 },
					uTime: { value: 0 },
					uReveal: { value: 1e5 },
					uArch: {
						value: [new THREE.Vector3(), new THREE.Vector3()],
					},
					uLift: { value: new THREE.Vector3() },
				},
				vertexShader: holoVertex,
				fragmentShader: holoFragment,
			}),
		[],
	);
	useEffect(() => {
		material.uniforms.uColor.value.set(color);
		material.uniforms.uOpacity.value = opacity;
		const slots = material.uniforms.uArch.value as THREE.Vector3[];
		for (let i = 0; i < 2; i++) slots[i].set(...(arches[i] ?? [0, 0, 0]));
	}, [material, color, opacity, arches]);
	useFrame(({ clock }) => {
		const u = material.uniforms;
		u.uTime.value = clock.elapsedTime;
		const reveal = fx.revealX.current ?? 0;
		u.uReveal.value = Number.isFinite(reveal) ? reveal : 1e5;
		// En la vista explotada la carrocería sube: los recortes la acompañan.
		u.uLift.value.set(
			0,
			EXPLODE.carroceria[1] * (fx.explode.current ?? 0) * fx.scale,
			0,
		);
	});
	useEffect(() => () => material.dispose(), [material]);
	return material;
}

/** Sección interpolada (lineal) del plano en una posición X. */
function stationAt(stations: Station[], x: number): Station {
	if (x <= stations[0][0]) return stations[0];
	for (let i = 1; i < stations.length; i++) {
		const [x1] = stations[i];
		if (x <= x1) {
			const a = stations[i - 1];
			const b = stations[i];
			const t = (x - a[0]) / (x1 - a[0]);
			return [
				x,
				a[1] + (b[1] - a[1]) * t,
				a[2] + (b[2] - a[2]) * t,
				a[3] + (b[3] - a[3]) * t,
			];
		}
	}
	return stations[stations.length - 1];
}

/** Ancho de la superelipse a una altura dada: sirve para pegar líneas al costado. */
function sideZ([, yb, yt, w]: Station, y: number, round: number) {
	const yc = (yb + yt) / 2;
	const h = (yt - yb) / 2;
	const u = Math.min(0.999, Math.abs((y - yc) / h));
	return w * (1 - u ** round) ** (1 / round);
}

/** Loft de secciones superelípticas: da la forma suave de la carrocería. */
function loft(stations: Station[], round: number, taper = 0) {
	const samples = 72;
	const ring = 56;
	const a = new THREE.CatmullRomCurve3(
		stations.map(([x, yb, yt]) => new THREE.Vector3(x, yb, yt)),
	);
	const b = new THREE.CatmullRomCurve3(
		stations.map(([x, , , w]) => new THREE.Vector3(x, w, 0)),
	);
	const pos: number[] = [];
	const e = 2 / round;
	const sp = (v: number) => Math.sign(v) * Math.abs(v) ** e;
	for (let i = 0; i <= samples; i++) {
		const t = i / samples;
		const { x, y: yb, z: yt } = a.getPoint(t);
		const w = b.getPoint(t).y;
		const yc = (yb + yt) / 2;
		const h = Math.max((yt - yb) / 2, 0.001);
		for (let j = 0; j < ring; j++) {
			const th = (j / ring) * Math.PI * 2;
			const sy = sp(Math.sin(th));
			// Tumblehome: la parte alta se angosta un poco.
			const narrow = 1 - taper * Math.max(0, sy);
			pos.push(x, yc + h * sy, w * narrow * sp(Math.cos(th)));
		}
	}
	const index: number[] = [];
	for (let i = 0; i < samples; i++) {
		for (let j = 0; j < ring; j++) {
			const a0 = i * ring + j;
			const a1 = i * ring + ((j + 1) % ring);
			const b0 = a0 + ring;
			const b1 = a1 + ring;
			index.push(a0, b0, a1, a1, b0, b1);
		}
	}
	// Tapas en ambos extremos.
	for (const [i, flip] of [
		[0, true],
		[samples, false],
	] as const) {
		let cx = 0;
		let cy = 0;
		for (let j = 0; j < ring; j++) {
			cx += pos[(i * ring + j) * 3];
			cy += pos[(i * ring + j) * 3 + 1];
		}
		const c = pos.length / 3;
		pos.push(cx / ring, cy / ring, 0);
		for (let j = 0; j < ring; j++) {
			const p0 = i * ring + j;
			const p1 = i * ring + ((j + 1) % ring);
			if (flip) index.push(c, p1, p0);
			else index.push(c, p0, p1);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	g.setIndex(index);
	g.computeVertexNormals();
	return g;
}

const noRay = () => null;

function Shell() {
	const { plan, summary, selected, hover, isolate, mode, healthTint } =
		useScene();
	const focused = selected === "carroceria" || hover === "carroceria";
	const status = summary.carroceria.status;
	const tint = focused
		? statusColor[status === "sin-registro" ? "registrado" : status]
		: mode === "salud"
			? healthTint
			: BRAND;
	// Aislando otra zona, la carrocería casi desaparece para dejar ver la pieza.
	const dim = isolate && !focused && mode === "zonas";
	const arches = useMemo(() => {
		const { wheels: w, lower } = plan;
		const first = lower[0][0];
		const last = lower[lower.length - 1][0];
		return [w.front, w.rear]
			.filter((x) => x > first && x < last)
			.map((x): Vec3 => [x, w.r, w.r + 0.07]);
	}, [plan]);
	const body = useHolo(tint, focused ? 1.1 : dim ? 0.22 : 0.6, arches);
	const glass = useHolo(
		focused ? tint : mode === "salud" ? healthTint : BRAND_SOFT,
		focused ? 1 : dim ? 0.18 : 0.5,
	);
	const lower = useMemo(() => loft(plan.lower, plan.lowerRound), [plan]);
	const cabin = useMemo(() => loft(plan.cabin, plan.cabinRound, 0.12), [plan]);
	useEffect(
		() => () => {
			lower.dispose();
			cabin.dispose();
		},
		[lower, cabin],
	);
	const cargo = plan.cargo;
	return (
		<group>
			{/* La carrocería no intercepta clics: así se tocan las piezas de adentro. */}
			<mesh geometry={lower} material={body} raycast={noRay} />
			<mesh geometry={cabin} material={glass} raycast={noRay} />
			{plan.bed && <Bed material={glass} />}
			{cargo && (
				<RoundedBox
					args={[cargo.x1 - cargo.x0, cargo.top - cargo.bottom, cargo.w * 2]}
					radius={0.06}
					position={[
						(cargo.x0 + cargo.x1) / 2,
						(cargo.top + cargo.bottom) / 2,
						0,
					]}
					material={body}
					raycast={noRay}
				/>
			)}
			<AfterReveal>
				<Lines color={focused ? tint : BRAND_SOFT} faint={dim} />
			</AfterReveal>
		</group>
	);
}

/** Palangana de la pickup: piso, laterales, frente y compuerta. */
function Bed({ material }: { material: THREE.Material }) {
	const { plan } = useScene();
	if (!plan.bed) return null;
	const { x0, x1, floor, top, w } = plan.bed;
	const len = x1 - x0;
	const h = top - floor;
	const cx = (x0 + x1) / 2;
	const panels: { p: Vec3; s: Vec3 }[] = [
		{ p: [cx, floor, 0], s: [len, 0.05, w * 2] },
		{ p: [cx, floor + h / 2, w], s: [len, h, 0.05] },
		{ p: [cx, floor + h / 2, -w], s: [len, h, 0.05] },
		{ p: [x1, floor + h / 2, 0], s: [0.05, h, w * 2] },
		{ p: [x0, floor + h / 2, 0], s: [0.05, h, w * 2] },
	];
	return (
		<group>
			{panels.map(({ p, s }) => (
				<RoundedBox
					key={p.join()}
					args={s}
					radius={0.02}
					position={p}
					material={material}
					raycast={noRay}
				/>
			))}
		</group>
	);
}

/**
 * Líneas de carácter: cintura, estribo, arcos de rueda, cortes de puertas y
 * pilares de las ventanas. Se calculan del plano, así valen para cada tipo.
 */
function Lines({ color, faint }: { color: string; faint: boolean }) {
	const { plan } = useScene();
	const { wheels: w, lower, cabin, lowerRound, cabinRound } = plan;
	const curves = useMemo(() => {
		const out: THREE.Curve<THREE.Vector3>[] = [];
		const inner = lower.slice(1, -1);
		// Cintura (base de las ventanas) y estribo.
		out.push(
			new THREE.CatmullRomCurve3(
				inner.map(
					([x, , yt, wd]) => new THREE.Vector3(x, yt - 0.03, wd * 0.98),
				),
			),
		);
		out.push(
			new THREE.CatmullRomCurve3(
				inner.map((s) => {
					const y = s[1] + 0.09;
					return new THREE.Vector3(s[0], y, sideZ(s, y, lowerRound) * 0.995);
				}),
			),
		);
		// Pilares: A (adelante), C (atrás) y B (entre puertas).
		const roof = Math.max(...cabin.map((s) => s[2]));
		const high = cabin.filter((s) => s[2] >= roof * 0.96);
		const base = cabin[0][1];
		const front = cabin[cabin.length - 1][0];
		const rear = cabin[0][0];
		const aTop = high[high.length - 1][0];
		const cTop = high[0][0];
		const oneRow = Boolean(plan.bed || plan.cargo);
		const bX = oneRow ? cTop + 0.05 : (aTop + cTop) / 2;
		const pillarZ = (x: number, y: number) =>
			sideZ(stationAt(cabin, x), y, cabinRound) * (1 - 0.12 * 0.85) * 0.995;
		const pillar = (x0: number, x1: number) =>
			new THREE.LineCurve3(
				new THREE.Vector3(x0, base + 0.02, pillarZ(x0, base + 0.02)),
				new THREE.Vector3(x1, roof - 0.04, pillarZ(x1, roof - 0.04)),
			);
		out.push(pillar(front - 0.02, aTop), pillar(rear + 0.02, cTop));
		if (!oneRow || !plan.cargo) out.push(pillar(bX, bX));
		// Cortes de puertas en la carrocería baja.
		const doorXs = oneRow
			? [front - 0.04, bX]
			: [front - 0.04, bX, rear + 0.08];
		for (const x of doorXs) {
			const s = stationAt(lower, x);
			const y0 = s[1] + 0.1;
			const y1 = s[2] - 0.05;
			out.push(
				new THREE.LineCurve3(
					new THREE.Vector3(x, y0, sideZ(s, y0, lowerRound) * 0.995),
					new THREE.Vector3(x, y1, sideZ(s, y1, lowerRound) * 0.995),
				),
			);
		}
		return out;
	}, [plan, lower, cabin, lowerRound, cabinRound]);
	const first = lower[0][0];
	const last = lower[lower.length - 1][0];
	const arches = [w.front, w.rear].filter((x) => x > first && x < last);
	const opacity = faint ? 0.25 : 0.9;
	return (
		<group>
			{[1, -1].map((side) => (
				<group key={side} scale={[1, 1, side]}>
					{curves.map((curve, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: las curvas son fijas para cada plano.
						<mesh key={i} raycast={noRay}>
							<tubeGeometry args={[curve, 64, 0.0055, 5, false]} />
							<meshBasicMaterial
								color={color}
								transparent
								opacity={opacity}
								toneMapped={false}
							/>
						</mesh>
					))}
					{arches.map((x) => (
						<mesh
							key={x}
							position={[x, w.r, widthAt(plan, x) * 0.97]}
							raycast={noRay}
						>
							<torusGeometry args={[w.r + 0.07, 0.009, 6, 48, Math.PI]} />
							<meshBasicMaterial
								color={color}
								transparent
								opacity={opacity}
								toneMapped={false}
							/>
						</mesh>
					))}
				</group>
			))}
		</group>
	);
}

/* ---------------------------------- Piezas --------------------------------- */

type PartProps = {
	zone: Zone;
	axle?: Axle;
	children: ReactNode;
	position?: Vec3;
	rotation?: Vec3 | THREE.Euler;
	/** Color propio (llantas, luces): solo se tiñe al enfocar la zona. */
	base?: string;
	solid?: boolean;
};

function Part({
	zone,
	axle,
	children,
	position,
	rotation,
	base = "#64748b",
	solid = false,
}: PartProps) {
	const { summary, selected, hover, onHover, onSelect, isolate, mode, fx } =
		useScene();
	const clock = useThree((s) => s.clock);
	const mesh = useRef<THREE.Mesh>(null);
	const material = useRef<THREE.MeshStandardMaterial>(null);
	const worldX = useRef<number | null>(null);
	const flashAt = useRef(Number.NEGATIVE_INFINITY);
	const shownAt = useRef<number | null>(null);
	const status = statusOf(summary[zone], axle);
	const count =
		(axle ? summary[zone].axles?.[axle].events.length : undefined) ??
		summary[zone].events.length;
	const serviced = status !== "sin-registro";
	const active = selected === zone;
	const hovered = hover === zone;
	const health = mode === "salud";
	const muted = isolate && !health && !active && !hovered;
	const glow = serviced ? statusColor[status] : "#cbd5e1";
	const color =
		active || hovered || (serviced && (!solid || health)) ? glow : base;
	const opacity = muted
		? 0.06
		: active || hovered
			? 1
			: health
				? serviced
					? 0.9
					: 0.25
				: serviced
					? 0.55
					: solid
						? 0.5
						: 0.22;
	const intensity = muted
		? 0
		: active
			? serviced
				? 1.6
				: 0.5
			: hovered
				? 0.9
				: serviced
					? health
						? 0.75
						: solid
							? 0.05
							: 0.3
					: 0;

	// Un servicio nuevo (p. ej. al avanzar la línea de tiempo) hace destellar la pieza.
	const prev = useRef(count);
	useEffect(() => {
		if (count > prev.current) flashAt.current = clock.elapsedTime;
		prev.current = count;
	}, [count, clock]);

	useFrame(({ clock: c }) => {
		const m = mesh.current;
		if (!m || !material.current) return;
		// Escaneo de entrada: la pieza aparece cuando el frente la alcanza.
		const reveal = fx.revealX.current ?? 0;
		if (worldX.current === null) {
			worldX.current = m.getWorldPosition(new THREE.Vector3()).x;
		}
		const visible = worldX.current <= reveal;
		m.visible = visible;
		if (visible && shownAt.current === null) {
			shownAt.current = c.elapsedTime;
			if (serviced && Number.isFinite(reveal)) flashAt.current = c.elapsedTime;
		}
		const flash = Math.max(0, 1 - (c.elapsedTime - flashAt.current) / 1.2);
		material.current.emissiveIntensity =
			(active && serviced
				? intensity + Math.sin(c.elapsedTime * 3.5) * 0.45
				: intensity) +
			flash * 2.2;
	});

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: es un objeto three.js, no DOM; el teclado usa las pestañas de zonas.
		<mesh
			ref={mesh}
			position={position}
			rotation={rotation}
			onPointerOver={(e: ThreeEvent<PointerEvent>) => {
				if (muted) return;
				e.stopPropagation();
				onHover(zone);
				document.body.style.cursor = "pointer";
			}}
			onPointerOut={() => {
				onHover(null);
				document.body.style.cursor = "";
			}}
			onClick={(e: ThreeEvent<MouseEvent>) => {
				if (e.delta > 6) return; // fue un arrastre para girar, no un clic
				e.stopPropagation();
				onSelect(zone, axle ? (`${zone}:${axle}` as PinId) : undefined);
			}}
		>
			{children}
			<meshStandardMaterial
				ref={material}
				color={color}
				emissive={glow}
				emissiveIntensity={intensity}
				metalness={0.45}
				roughness={0.38}
				transparent
				opacity={opacity}
				depthWrite={opacity > 0.9}
			/>
			{active && isolate && (
				<Outlines thickness={0.012} color={glow} transparent opacity={0.9} />
			)}
		</mesh>
	);
}

/** Estructura sin zona (asientos, chasis): da contexto, no se selecciona. */
function Neutral({
	children,
	position,
	rotation,
}: {
	children: ReactNode;
	position?: Vec3;
	rotation?: Vec3;
}) {
	const { isolate, mode } = useScene();
	return (
		<mesh position={position} rotation={rotation} raycast={noRay}>
			{children}
			<meshStandardMaterial
				color="#1e3a5f"
				transparent
				opacity={isolate && mode === "zonas" ? 0.08 : 0.35}
				depthWrite={false}
			/>
		</mesh>
	);
}

const AXIS_Z: Vec3 = [Math.PI / 2, 0, 0];
const AXIS_X: Vec3 = [0, 0, Math.PI / 2];
const UP = new THREE.Vector3(0, 1, 0);

/** Cilindro entre dos puntos (ejes, cardán, columna de dirección). */
function Rod({
	from,
	to,
	r,
	zone,
	axle,
}: {
	from: Vec3;
	to: Vec3;
	r: number;
	zone: Zone;
	axle?: Axle;
}) {
	const [fx, fy, fz] = from;
	const [tx, ty, tz] = to;
	const { mid, len, rot } = useMemo(() => {
		const a = new THREE.Vector3(fx, fy, fz);
		const b = new THREE.Vector3(tx, ty, tz);
		const d = b.clone().sub(a);
		const q = new THREE.Quaternion().setFromUnitVectors(
			UP,
			d.clone().normalize(),
		);
		return {
			mid: a.add(b).multiplyScalar(0.5).toArray() as Vec3,
			len: d.length(),
			rot: new THREE.Euler().setFromQuaternion(q),
		};
	}, [fx, fy, fz, tx, ty, tz]);
	return (
		<Part zone={zone} axle={axle} position={mid} rotation={rot}>
			<cylinderGeometry args={[r, r, len, 12]} />
		</Part>
	);
}

/** Muestra su contenido solo cuando terminó el escaneo de entrada. */
function AfterReveal({ children }: { children: ReactNode }) {
	const { fx } = useScene();
	const ref = useRef<THREE.Group>(null);
	useFrame(() => {
		if (ref.current)
			ref.current.visible = !Number.isFinite(fx.revealX.current ?? 0);
	});
	return <group ref={ref}>{children}</group>;
}

function Vehicle() {
	return (
		<group>
			<Explode offset={EXPLODE.carroceria}>
				<Shell />
				<Mirrors />
			</Explode>
			<AfterReveal>
				<Structure />
			</AfterReveal>
			<Explode offset={EXPLODE.motor}>
				<Engine />
			</Explode>
			<Explode offset={EXPLODE.aceite}>
				<Oil />
			</Explode>
			<Explode offset={EXPLODE.bateria}>
				<Battery />
			</Explode>
			<Explode offset={EXPLODE.refrigeracion}>
				<Cooling />
			</Explode>
			<Explode offset={EXPLODE.aire_acondicionado}>
				<AirConditioning />
			</Explode>
			<Electrical />
			<Explode offset={EXPLODE.transmision}>
				<Transmission />
			</Explode>
			<Explode offset={EXPLODE.direccion}>
				<Steering />
			</Explode>
			<Running />
			<Explode offset={EXPLODE.escape}>
				<Exhaust />
			</Explode>
		</group>
	);
}

function Structure() {
	const { plan } = useScene();
	const seatY = plan.dash.y - 0.42;
	// Pickup y camión: una fila; el resto, dos.
	const rowOffsets = plan.cargo || plan.bed ? [0] : [0, 0.85];
	const frame = plan.frame;
	return (
		<group>
			{frame &&
				[1, -1].map((s) => (
					<Neutral
						key={s}
						position={[(frame.x0 + frame.x1) / 2, frame.y, s * frame.z]}
					>
						<boxGeometry args={[frame.x1 - frame.x0, 0.12, 0.08]} />
					</Neutral>
				))}
			{rowOffsets.map((offset) => {
				const x = plan.dash.x - 0.7 - offset;
				return [1, -1].map((s) => (
					<group key={`${offset}${s}`}>
						<Neutral position={[x, seatY, s * 0.38]}>
							<boxGeometry args={[0.5, 0.1, 0.46]} />
						</Neutral>
						<Neutral
							position={[x - 0.24, seatY + 0.3, s * 0.38]}
							rotation={[0, 0, 0.18]}
						>
							<boxGeometry args={[0.1, 0.56, 0.46]} />
						</Neutral>
					</group>
				));
			})}
		</group>
	);
}

function Engine() {
	const { plan } = useScene();
	const e = plan.engine;
	const top = e.y + e.h / 2;
	const ribs = [-0.32, -0.16, 0, 0.16, 0.32];
	const runners = [-0.21, -0.07, 0.07, 0.21];
	const plenumX = e.x - e.l / 2 - 0.08;
	return (
		<group>
			{/* Bloque y culata */}
			<Part zone="motor" position={[e.x, e.y, 0]}>
				<boxGeometry args={[e.l, e.h, e.w]} />
			</Part>
			<Part zone="motor" position={[e.x, top + 0.05, 0]}>
				<boxGeometry args={[e.l * 0.92, 0.1, e.w * 0.9]} />
			</Part>
			{/* Tapa de válvulas con nervaduras */}
			{ribs.map((dz) => (
				<Part key={dz} zone="motor" position={[e.x, top + 0.115, dz * e.w]}>
					<boxGeometry args={[e.l * 0.78, 0.03, 0.02]} />
				</Part>
			))}
			{/* Múltiple de admisión: plenum y cuatro runners hacia la culata */}
			<Part zone="motor" position={[plenumX, top + 0.02, 0]} rotation={AXIS_Z}>
				<capsuleGeometry args={[0.055, e.w * 0.62, 6, 14]} />
			</Part>
			{runners.map((z) => (
				<Rod
					key={z}
					zone="motor"
					r={0.022}
					from={[plenumX, top + 0.02, z]}
					to={[e.x - e.l * 0.3, top + 0.06, z]}
				/>
			))}
			{/* Filtro de aire */}
			<Part
				zone="motor"
				position={[e.x - e.l / 2 - 0.08, top + 0.1, e.w / 2 + 0.06]}
			>
				<capsuleGeometry args={[0.09, 0.12, 6, 16]} />
			</Part>
			{/* Bujías */}
			{runners.map((z) => (
				<Part key={z} zone="motor" position={[e.x + 0.06, top + 0.15, z]}>
					<cylinderGeometry args={[0.016, 0.016, 0.07, 8]} />
				</Part>
			))}
			{/* Correa de accesorios con poleas */}
			<Part
				zone="motor"
				position={[e.x + e.l / 2 + 0.03, e.y, -e.w / 2 + 0.05]}
				rotation={[0, Math.PI / 2, 0]}
			>
				<torusGeometry args={[0.13, 0.012, 8, 32]} />
			</Part>
			{[0.09, -0.08].map((dy) => (
				<Part
					key={dy}
					zone="motor"
					position={[e.x + e.l / 2 + 0.03, e.y + dy, -e.w / 2 + 0.05]}
					rotation={AXIS_X}
				>
					<cylinderGeometry args={[0.05, 0.05, 0.03, 20]} />
				</Part>
			))}
		</group>
	);
}

function Oil() {
	const { plan } = useScene();
	const e = plan.engine;
	return (
		<group>
			<Part zone="aceite" position={[e.x, e.y - e.h / 2 - 0.05, 0]}>
				<boxGeometry args={[e.l * 0.9, 0.09, e.w * 0.85]} />
			</Part>
			<Part
				zone="aceite"
				position={[e.x + e.l / 2 - 0.02, e.y - 0.12, e.w / 2 + 0.04]}
			>
				<cylinderGeometry args={[0.05, 0.05, 0.12, 16]} />
			</Part>
			<Part zone="aceite" position={[e.x + 0.07, e.y + e.h / 2 + 0.12, 0.18]}>
				<cylinderGeometry args={[0.035, 0.035, 0.04, 16]} />
			</Part>
			{/* Varilla medidora */}
			<Rod
				zone="aceite"
				r={0.008}
				from={[e.x - 0.12, e.y - e.h / 2, -e.w / 2 + 0.05]}
				to={[e.x - 0.16, e.y + e.h / 2 + 0.12, -e.w / 2 + 0.05]}
			/>
		</group>
	);
}

function Battery() {
	const { plan } = useScene();
	const [x, y, z] = plan.battery;
	return (
		<group>
			<Part zone="bateria" position={[x, y, z]}>
				<boxGeometry args={[0.24, 0.18, 0.17]} />
			</Part>
			<Part zone="bateria" position={[x, y + 0.095, z]}>
				<boxGeometry args={[0.25, 0.015, 0.18]} />
			</Part>
			{[-0.07, 0.07].map((dx) => (
				<Part key={dx} zone="bateria" position={[x + dx, y + 0.12, z]}>
					<cylinderGeometry args={[0.018, 0.018, 0.04, 10]} />
				</Part>
			))}
		</group>
	);
}

function Cooling() {
	const { plan } = useScene();
	const e = plan.engine;
	const x = plan.radiatorX;
	const half = widthAt(plan, x) - 0.18;
	const h = e.h + 0.1;
	const fan = useRef<THREE.Group>(null);
	useFrame((_, dt) => {
		if (fan.current) fan.current.rotation.x += dt * 6;
	});
	return (
		<group>
			{/* Núcleo con aletas y tanques laterales */}
			<Part zone="refrigeracion" position={[x, e.y, 0]}>
				<boxGeometry args={[0.035, h, half * 2]} />
			</Part>
			{[-1, -0.5, 0, 0.5, 1].map((t) => (
				<Part
					key={t}
					zone="refrigeracion"
					position={[x + 0.02, e.y + (t * h) / 2.3, 0]}
				>
					<boxGeometry args={[0.01, 0.008, half * 2]} />
				</Part>
			))}
			{[1, -1].map((s) => (
				<Part
					key={s}
					zone="refrigeracion"
					position={[x, e.y, s * (half + 0.03)]}
				>
					<boxGeometry args={[0.06, h + 0.02, 0.06]} />
				</Part>
			))}
			{/* Ventilador: aspas girando */}
			<group ref={fan} position={[x - 0.07, e.y, half * 0.35]}>
				{[0, 1, 2, 3, 4].map((i) => (
					<Part
						key={i}
						zone="refrigeracion"
						rotation={[(i * Math.PI * 2) / 5, 0, 0]}
					>
						<boxGeometry args={[0.012, e.h * 0.42, 0.05]} />
					</Part>
				))}
				<Part zone="refrigeracion" rotation={AXIS_X}>
					<cylinderGeometry args={[0.035, 0.035, 0.04, 16]} />
				</Part>
			</group>
			<Part
				zone="refrigeracion"
				position={[x - 0.16, e.y + e.h / 2 + 0.06, -(half - 0.1)]}
			>
				<capsuleGeometry args={[0.05, 0.06, 6, 14]} />
			</Part>
		</group>
	);
}

function AirConditioning() {
	const { plan } = useScene();
	const e = plan.engine;
	const x = plan.radiatorX + 0.07;
	const half = widthAt(plan, x) - 0.2;
	return (
		<group>
			<Part zone="aire_acondicionado" position={[x, e.y - 0.02, 0]}>
				<boxGeometry args={[0.025, e.h, half * 2]} />
			</Part>
			<Part
				zone="aire_acondicionado"
				position={[e.x + e.l / 2 - 0.08, e.y - e.h / 2 + 0.04, -e.w / 2 - 0.08]}
				rotation={AXIS_Z}
			>
				<cylinderGeometry args={[0.06, 0.06, 0.14, 16]} />
			</Part>
			<Rod
				zone="aire_acondicionado"
				r={0.01}
				from={[x - 0.02, e.y - e.h / 2 + 0.05, -half + 0.05]}
				to={[e.x + e.l / 2 - 0.08, e.y - e.h / 2 + 0.04, -e.w / 2 - 0.08]}
			/>
			<Part
				zone="aire_acondicionado"
				position={[plan.dash.x + 0.3, plan.dash.y - 0.3, 0]}
			>
				<boxGeometry args={[0.12, 0.15, 0.6]} />
			</Part>
		</group>
	);
}

function Electrical() {
	const { plan } = useScene();
	const e = plan.engine;
	const l = plan.lights;
	return (
		<group>
			<Explode offset={[0, 0.45, -0.5]}>
				<Part
					zone="electrico"
					position={[e.x + e.l / 2 - 0.06, e.y + 0.1, -e.w / 2 - 0.07]}
					rotation={AXIS_Z}
				>
					<cylinderGeometry args={[0.07, 0.07, 0.12, 16]} />
				</Part>
				<Part
					zone="electrico"
					position={[
						e.x - e.l / 2 + 0.06,
						e.y - e.h / 2 + 0.04,
						e.w / 2 + 0.07,
					]}
					rotation={AXIS_X}
				>
					<cylinderGeometry args={[0.05, 0.05, 0.16, 16]} />
				</Part>
			</Explode>
			{/* Faros y calaveras como tiras de luz que siguen el frente y la cola */}
			<Explode offset={EXPLODE.electrico}>
				{[1, -1].map((side) => (
					<Part
						key={side}
						zone="electrico"
						base="#fef9c3"
						solid
						position={[l.fx, l.fy, side * l.fz]}
						rotation={[Math.PI / 2, side * 0.35, 0]}
					>
						<capsuleGeometry args={[0.03, 0.26, 4, 12]} />
					</Part>
				))}
			</Explode>
			<Explode offset={[-0.45, 0, 0]}>
				{[1, -1].map((side) => (
					<Part
						key={side}
						zone="electrico"
						base="#fb7185"
						solid
						position={[l.rx, l.ry, side * l.rz]}
						rotation={[Math.PI / 2, -side * 0.3, 0]}
					>
						<capsuleGeometry args={[0.028, 0.2, 4, 12]} />
					</Part>
				))}
			</Explode>
		</group>
	);
}

function Transmission() {
	const { plan } = useScene();
	const { engine: e, wheels: w } = plan;
	const hubY = w.r;
	if (plan.drive === "fwd") {
		return (
			<group>
				<Part
					zone="transmision"
					position={[e.x - 0.1, e.y - 0.1, e.w / 2 + 0.18]}
				>
					<boxGeometry args={[0.32, 0.28, 0.3]} />
				</Part>
				<Part
					zone="transmision"
					position={[e.x - 0.1, e.y - 0.1, e.w / 2 + 0.02]}
					rotation={AXIS_Z}
				>
					<cylinderGeometry args={[0.15, 0.13, 0.06, 24]} />
				</Part>
				{[1, -1].map((s) => (
					<Rod
						key={s}
						zone="transmision"
						r={0.025}
						from={[e.x - 0.1, hubY, s * 0.15]}
						to={[w.front, hubY, s * (w.track - 0.12)]}
					/>
				))}
			</group>
		);
	}
	// Tracción trasera o 4x4: caja detrás del motor, cardán y diferencial.
	const boxX = e.x - e.l / 2 - 0.3;
	const boxY = e.y - 0.08;
	const shaftY = hubY + 0.04;
	return (
		<group>
			<Part zone="transmision" position={[boxX, boxY, 0]} rotation={AXIS_X}>
				<cylinderGeometry args={[0.13, 0.17, 0.55, 20]} />
			</Part>
			<Rod
				zone="transmision"
				r={0.035}
				from={[boxX - 0.28, boxY - 0.05, 0]}
				to={[w.rear + 0.14, shaftY, 0]}
			/>
			<Part zone="transmision" position={[w.rear, shaftY, 0]}>
				<sphereGeometry args={[0.15, 20, 16]} />
			</Part>
			<Rod
				zone="transmision"
				r={0.04}
				from={[w.rear, shaftY, -(w.track - 0.12)]}
				to={[w.rear, shaftY, w.track - 0.12]}
			/>
			{plan.drive === "4x4" && (
				<>
					<Part zone="transmision" position={[boxX - 0.35, boxY - 0.04, 0.12]}>
						<boxGeometry args={[0.2, 0.22, 0.24]} />
					</Part>
					<Rod
						zone="transmision"
						r={0.03}
						from={[boxX - 0.35, boxY - 0.08, 0.12]}
						to={[w.front - 0.12, shaftY, 0.08]}
					/>
					<Part zone="transmision" position={[w.front, shaftY, 0.06]}>
						<sphereGeometry args={[0.12, 20, 16]} />
					</Part>
					{[1, -1].map((s) => (
						<Rod
							key={s}
							zone="transmision"
							r={0.025}
							from={[w.front, shaftY, 0.06]}
							to={[w.front, hubY, s * (w.track - 0.12)]}
						/>
					))}
				</>
			)}
		</group>
	);
}

function Steering() {
	const { plan } = useScene();
	const { wheels: w, dash } = plan;
	const rackX = w.front - 0.24;
	const rackY = w.r + 0.06;
	const half = w.track - 0.2;
	return (
		<group>
			<Rod
				zone="direccion"
				r={0.03}
				from={[rackX, rackY, -half]}
				to={[rackX, rackY, half]}
			/>
			{[1, -1].map((s) => (
				<group key={s}>
					<Rod
						zone="direccion"
						r={0.015}
						from={[rackX, rackY, s * half]}
						to={[w.front - 0.1, w.r, s * (w.track - 0.1)]}
					/>
					{/* Fuelles de la cremallera */}
					<Part
						zone="direccion"
						position={[rackX, rackY, s * (half - 0.08)]}
						rotation={AXIS_Z}
					>
						<cylinderGeometry args={[0.045, 0.035, 0.12, 14]} />
					</Part>
				</group>
			))}
			<Rod
				zone="direccion"
				r={0.02}
				from={[rackX + 0.05, rackY + 0.05, -0.36]}
				to={[dash.x + 0.06, dash.y - 0.06, -0.38]}
			/>
			<group position={[dash.x, dash.y, -0.38]} rotation={[0, 0, Math.PI / 5]}>
				<Part zone="direccion" rotation={[0, Math.PI / 2, 0]}>
					<torusGeometry args={[0.17, 0.02, 10, 36]} />
				</Part>
				<Part zone="direccion" rotation={AXIS_X}>
					<cylinderGeometry args={[0.05, 0.05, 0.04, 16]} />
				</Part>
				{[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((a) => (
					<Part
						key={a}
						zone="direccion"
						rotation={[a, 0, 0]}
						position={[0, 0, 0]}
					>
						<boxGeometry args={[0.015, 0.17, 0.025]} />
					</Part>
				))}
			</group>
		</group>
	);
}

class Helix extends THREE.Curve<THREE.Vector3> {
	constructor(
		private radius: number,
		private height: number,
		private turns: number,
	) {
		super();
	}
	getPoint(t: number, target = new THREE.Vector3()) {
		const a = t * Math.PI * 2 * this.turns;
		return target.set(
			Math.cos(a) * this.radius,
			t * this.height - this.height / 2,
			Math.sin(a) * this.radius,
		);
	}
}

/** Perfil de llanta con flancos redondeados (se tornea alrededor del eje). */
function tireProfile(r: number, width: number) {
	const half = width / 2;
	const inner = r * 0.62;
	const pts: THREE.Vector2[] = [new THREE.Vector2(inner, -half)];
	for (let i = 0; i <= 8; i++) {
		const a = -Math.PI / 2 + (i / 8) * Math.PI;
		// Flanco redondeado: el radio máximo (banda de rodamiento) es exactamente r.
		pts.push(
			new THREE.Vector2(r * (0.93 + 0.07 * Math.cos(a)), Math.sin(a) * half),
		);
	}
	pts.push(new THREE.Vector2(inner, half));
	return pts;
}

/** Llantas, frenos y suspensión de cada rueda. */
function Running() {
	const { plan } = useScene();
	const w = plan.wheels;
	const spring = useMemo(() => new Helix(0.065, w.r * 1.4, 6), [w.r]);
	const tire = useMemo(() => tireProfile(w.r, w.width), [w.r, w.width]);
	const corners: { x: number; axle: Axle; side: number }[] = [
		{ x: w.front, axle: "front", side: 1 },
		{ x: w.front, axle: "front", side: -1 },
		{ x: w.rear, axle: "rear", side: 1 },
		{ x: w.rear, axle: "rear", side: -1 },
	];
	return (
		<group>
			{corners.map(({ x, axle, side }) => {
				const z = side * w.track;
				const dual = axle === "rear" && w.dualRear;
				const inner =
					side * (w.track - w.width / 2 - 0.05 - (dual ? w.width + 0.04 : 0));
				const drum = axle === "rear" && plan.rearBrake === "tambor";
				const leaf = axle === "rear" && plan.rearSpring === "ballesta";
				const springZ = side * (w.track - w.width / 2 - 0.16);
				const wheelZs = dual ? [z, z - side * (w.width + 0.04)] : [z];
				return (
					<group key={`${axle}${side}`}>
						<Explode offset={cornerExplode("llantas", side)}>
							{wheelZs.map((wz) => (
								<Wheel
									key={wz}
									x={x}
									z={wz}
									side={side}
									axle={axle}
									tire={tire}
								/>
							))}
						</Explode>
						<Explode offset={cornerExplode("frenos", side)}>
							{drum ? (
								<group>
									<Part
										zone="frenos"
										axle={axle}
										position={[x, w.r, inner]}
										rotation={AXIS_Z}
									>
										<cylinderGeometry
											args={[w.r * 0.55, w.r * 0.55, 0.1, 28]}
										/>
									</Part>
									{[0, 1, 2, 3].map((i) => (
										<Part
											key={i}
											zone="frenos"
											axle={axle}
											position={[x, w.r, inner]}
											rotation={[Math.PI / 2, 0, (i * Math.PI) / 4]}
										>
											<boxGeometry args={[w.r * 1.12, 0.104, 0.012]} />
										</Part>
									))}
								</group>
							) : (
								<Disc x={x} side={side} axle={axle} inner={inner} />
							)}
						</Explode>
						<Explode offset={cornerExplode("amortiguadores", side)}>
							{leaf ? (
								<Leaf x={x} side={side} axle={axle} />
							) : (
								<>
									<Part
										zone="amortiguadores"
										axle={axle}
										position={[x, w.r + w.r * 1.2, springZ]}
									>
										<tubeGeometry args={[spring, 120, 0.012, 6, false]} />
									</Part>
									<Part
										zone="amortiguadores"
										axle={axle}
										position={[x, w.r + w.r * 1.1, springZ]}
									>
										<cylinderGeometry args={[0.025, 0.025, w.r * 1.7, 10]} />
									</Part>
								</>
							)}
						</Explode>
					</group>
				);
			})}
		</group>
	);
}

/** Llanta torneada con ranuras y rin de cinco rayos. */
function Wheel({
	x,
	z,
	side,
	axle,
	tire,
}: {
	x: number;
	z: number;
	side: number;
	axle: Axle;
	tire: THREE.Vector2[];
}) {
	const { plan } = useScene();
	const w = plan.wheels;
	const face = z + side * (w.width / 2 - 0.02);
	return (
		<group>
			<Part
				zone="llantas"
				axle={axle}
				base="#1e293b"
				solid
				position={[x, w.r, z]}
				rotation={AXIS_Z}
			>
				<latheGeometry args={[tire, 48]} />
			</Part>
			{[-0.3, 0, 0.3].map((t) => (
				<Part
					key={t}
					zone="llantas"
					axle={axle}
					base="#0f172a"
					solid
					position={[x, w.r, z + t * w.width]}
				>
					<torusGeometry args={[w.r * 1.005, 0.006, 4, 64]} />
				</Part>
			))}
			{/* Rin: aro, maza y cinco rayos */}
			<Part zone="llantas" axle={axle} position={[x, w.r, face]}>
				<torusGeometry args={[w.r * 0.6, 0.012, 8, 48]} />
			</Part>
			<Part
				zone="llantas"
				axle={axle}
				position={[x, w.r, face]}
				rotation={AXIS_Z}
			>
				<cylinderGeometry args={[w.r * 0.14, w.r * 0.14, 0.03, 20]} />
			</Part>
			{[0, 1, 2, 3, 4].map((i) => {
				const a = (i * Math.PI * 2) / 5;
				return (
					<Part
						key={i}
						zone="llantas"
						axle={axle}
						position={[
							x + Math.cos(a) * w.r * 0.37,
							w.r + Math.sin(a) * w.r * 0.37,
							face,
						]}
						rotation={[0, 0, a + Math.PI / 2]}
					>
						<boxGeometry args={[w.r * 0.09, w.r * 0.46, 0.02]} />
					</Part>
				);
			})}
		</group>
	);
}

/** Disco ventilado con ranuras, campana y mordaza. */
function Disc({
	x,
	side,
	axle,
	inner,
}: {
	x: number;
	side: number;
	axle: Axle;
	inner: number;
}) {
	const { plan } = useScene();
	const w = plan.wheels;
	const r = w.r * 0.6;
	return (
		<group>
			<Part
				zone="frenos"
				axle={axle}
				position={[x, w.r, inner]}
				rotation={AXIS_Z}
			>
				<cylinderGeometry args={[r, r, 0.03, 40]} />
			</Part>
			<Part
				zone="frenos"
				axle={axle}
				position={[x, w.r, inner + side * 0.025]}
				rotation={AXIS_Z}
			>
				<cylinderGeometry args={[r * 0.45, r * 0.45, 0.05, 28]} />
			</Part>
			{[0, 1, 2, 3, 4, 5].map((i) => {
				const a = (i * Math.PI) / 3 + 0.3;
				return (
					<Part
						key={i}
						zone="frenos"
						axle={axle}
						position={[
							x + Math.cos(a) * r * 0.75,
							w.r + Math.sin(a) * r * 0.75,
							inner + side * 0.017,
						]}
						rotation={[0, 0, a + 0.9]}
					>
						<boxGeometry args={[0.01, r * 0.38, 0.006]} />
					</Part>
				);
			})}
			<Part
				zone="frenos"
				axle={axle}
				position={[
					x + (axle === "front" ? -1 : 1) * r * 0.68,
					w.r + r * 0.68,
					inner,
				]}
				rotation={[0, 0, axle === "front" ? -Math.PI / 4 : Math.PI / 4]}
			>
				<capsuleGeometry args={[0.04, r * 0.5, 4, 12]} />
			</Part>
		</group>
	);
}

/** Paquete de ballestas con su amortiguador (pickup, microbús, camión). */
function Leaf({ x, side, axle }: { x: number; side: number; axle: Axle }) {
	const { plan } = useScene();
	const w = plan.wheels;
	const z = side * (w.track - w.width - 0.12);
	const y = w.r + 0.1;
	return (
		<group>
			{[1.1, 0.9, 0.7, 0.5].map((len, i) => (
				<Part
					key={len}
					zone="amortiguadores"
					axle={axle}
					position={[x, y - i * 0.028, z]}
				>
					<boxGeometry args={[len * w.r * 2.6, 0.022, 0.07]} />
				</Part>
			))}
			<Rod
				zone="amortiguadores"
				axle={axle}
				r={0.022}
				from={[x + 0.18, y - 0.05, z - side * 0.06]}
				to={[x + 0.32, y + w.r * 0.9, z - side * 0.06]}
			/>
		</group>
	);
}

function Exhaust() {
	const { plan } = useScene();
	const e = plan.engine;
	const y = plan.floorY;
	const pipe = useMemo(
		() =>
			new THREE.CatmullRomCurve3(
				(
					[
						[e.x - 0.1, e.y - e.h / 2, -0.15],
						[e.x - e.l / 2 - 0.2, y + 0.02, -0.18],
						[(e.x + plan.muffler) / 2, y, -0.22],
						[plan.muffler, y + 0.02, -0.4],
						[plan.tailX, y + 0.04, -0.4],
					] as Vec3[]
				).map((p) => new THREE.Vector3(...p)),
			),
		[e, y, plan.muffler, plan.tailX],
	);
	return (
		<group>
			<Part zone="escape">
				<tubeGeometry args={[pipe, 80, 0.032, 10, false]} />
			</Part>
			<Part
				zone="escape"
				position={[(e.x + plan.muffler) / 2, y, -0.22]}
				rotation={AXIS_X}
			>
				<capsuleGeometry args={[0.075, 0.2, 6, 16]} />
			</Part>
			<Part
				zone="escape"
				position={[plan.muffler, y + 0.02, -0.4]}
				rotation={AXIS_X}
			>
				<capsuleGeometry args={[0.11, 0.32, 6, 20]} />
			</Part>
			<Part
				zone="escape"
				position={[plan.tailX, y + 0.04, -0.4]}
				rotation={AXIS_X}
			>
				<cylinderGeometry args={[0.045, 0.04, 0.08, 16]} />
			</Part>
		</group>
	);
}

function Mirrors() {
	const { plan } = useScene();
	const [x, y, z] = plan.mirror;
	return (
		<group>
			{[1, -1].map((s) => (
				<group key={s}>
					<Part
						zone="carroceria"
						position={[x, y, s * z]}
						rotation={[0, s * 0.25, 0]}
					>
						<capsuleGeometry args={[0.05, 0.06, 4, 12]} />
					</Part>
					<Rod
						zone="carroceria"
						r={0.012}
						from={[x + 0.03, y - 0.03, s * (z - 0.1)]}
						to={[x, y, s * z]}
					/>
				</group>
			))}
		</group>
	);
}
