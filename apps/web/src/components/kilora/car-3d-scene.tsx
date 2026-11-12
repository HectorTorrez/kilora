import { Grid, OrbitControls, RoundedBox } from "@react-three/drei";
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

const BG = "#060c17";

/** Lo que usamos de OrbitControls (evita depender de los tipos de three-stdlib). */
type Controls = THREE.EventDispatcher<{ start: object }> & {
	target: THREE.Vector3;
	update: () => void;
};

type SceneState = {
	summary: Record<Zone, ZoneSummary>;
	selected: Zone;
	hover: Zone | null;
	onHover: (zone: Zone | null) => void;
	onSelect: (zone: Zone, pin?: PinId) => void;
};
const SceneContext = createContext<(SceneState & { plan: VehiclePlan }) | null>(
	null,
);
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
	onInteract: () => void;
	/** Pines (DOM, fuera del canvas) que la escena posiciona en cada cuadro. */
	pins: RefObject<Partial<Record<PinId, HTMLElement | null>>>;
};

export default function CarScene({
	bodyType,
	focus,
	autoRotate,
	onInteract,
	pins,
	summary,
	selected,
	hover,
	onHover,
	onSelect,
}: CarSceneProps) {
	const plan = plans[bodyType];
	const ctx = useMemo(
		() => ({ summary, selected, hover, onHover, onSelect, plan }),
		[summary, selected, hover, onHover, onSelect, plan],
	);
	return (
		<Canvas
			dpr={[1, 1.75]}
			camera={{ position: plan.camera.home, fov: 35, near: 0.1, far: 80 }}
			gl={{ antialias: true, powerPreference: "high-performance" }}
			onPointerMissed={() => onHover(null)}
		>
			<color attach="background" args={[BG]} />
			<fog attach="fog" args={[BG, plan.length * 2.2, plan.length * 4.5]} />
			<SceneContext.Provider value={ctx}>
				<hemisphereLight args={["#7dd3fc", BG, 0.7]} />
				<ambientLight intensity={0.3} />
				<directionalLight position={[5, 8, 5]} intensity={1.2} />
				<directionalLight
					position={[-6, 4, -4]}
					intensity={0.5}
					color="#93c5fd"
				/>

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
				<CameraRig focus={focus} onInteract={onInteract} />
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

/* ------------------------------- Cámara y pines ------------------------------ */

function CameraRig({
	focus,
	onInteract,
}: Pick<CarSceneProps, "focus" | "onInteract">) {
	const { plan } = useScene();
	const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
	const aspect = useThree((s) => s.size.width / s.size.height);
	const controls = useThree((s) => s.controls) as unknown as Controls | null;
	const views = useMemo(() => pinViews(plan), [plan]);
	const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(
		null,
	);

	// En pantallas angostas (celular) se abre el lente para que quepa el vehículo.
	useEffect(() => {
		camera.fov = aspect < 1 ? 58 : aspect < 1.4 ? 44 : 35;
		camera.updateProjectionMatrix();
	}, [aspect, camera]);

	useEffect(() => {
		if (!focus.key) return;
		if (!focus.pin) {
			goal.current = {
				pos: new THREE.Vector3(...plan.camera.home),
				target: new THREE.Vector3(...plan.camera.target),
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
	}, [focus, views, plan]);

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

/** Proyecta el anclaje de cada pin a la pantalla y mueve su botón (DOM) ahí. */
function PinProjector({ pins }: { pins: CarSceneProps["pins"] }) {
	const { plan } = useScene();
	const camera = useThree((s) => s.camera);
	const size = useThree((s) => s.size);
	const anchors = useMemo(
		() =>
			Object.entries(pinViews(plan)).map(
				([id, view]) =>
					[id as PinId, new THREE.Vector3(...view.anchor)] as const,
			),
		[plan],
	);
	const v = useMemo(() => new THREE.Vector3(), []);
	useFrame(() => {
		for (const [id, anchor] of anchors) {
			const el = pins.current[id];
			if (!el) continue;
			v.copy(anchor).project(camera);
			const x = ((v.x + 1) / 2) * size.width;
			const y = ((1 - v.y) / 2) * size.height;
			el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
			el.style.visibility = v.z > 1 ? "hidden" : "visible";
		}
	});
	return null;
}

/* --------------------------------- Ambiente --------------------------------- */

function Floor() {
	const { plan } = useScene();
	const glow = useMemo(
		() =>
			new THREE.ShaderMaterial({
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				uniforms: { uColor: { value: new THREE.Color("#38bdf8") } },
				vertexShader:
					"varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
				fragmentShader:
					"uniform vec3 uColor; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d) * 0.22 + smoothstep(0.03, 0.0, abs(d - 0.92)) * 0.5; gl_FragColor = vec4(uColor, a); }",
			}),
		[],
	);
	useEffect(() => () => glow.dispose(), [glow]);
	const r = plan.length * 0.78;
	return (
		<group>
			<mesh
				rotation={[-Math.PI / 2, 0, 0]}
				position={[0, 0.002, 0]}
				material={glow}
				raycast={() => null}
			>
				<planeGeometry args={[r * 2, r * 2]} />
			</mesh>
			<Grid
				args={[30, 30]}
				position={[0, -0.001, 0]}
				cellSize={0.25}
				cellThickness={0.5}
				cellColor="#0f2a47"
				sectionSize={1}
				sectionThickness={0.9}
				sectionColor="#1d4ed8"
				fadeDistance={plan.length * 3.2}
				fadeStrength={1.8}
				infiniteGrid
			/>
		</group>
	);
}

/* ----------------------------- Carrocería holográfica ----------------------------- */

const holoVertex = `
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
	vec4 wp = modelMatrix * vec4(position, 1.0);
	vY = wp.y;
	vec4 mv = viewMatrix * wp;
	vN = normalize(normalMatrix * normal);
	vV = normalize(-mv.xyz);
	gl_Position = projectionMatrix * mv;
}`;
const holoFragment = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
	float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
	float scan = smoothstep(0.92, 1.0, sin(vY * 70.0 - uTime * 1.6));
	float a = (f * 0.9 + 0.025 + scan * 0.035) * uOpacity;
	gl_FragColor = vec4(uColor * (0.55 + f * 1.6), a);
}`;

function useHolo(color: string, opacity: number) {
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
				},
				vertexShader: holoVertex,
				fragmentShader: holoFragment,
			}),
		[],
	);
	useEffect(() => {
		material.uniforms.uColor.value.set(color);
		material.uniforms.uOpacity.value = opacity;
	}, [material, color, opacity]);
	useFrame(({ clock }) => {
		material.uniforms.uTime.value = clock.elapsedTime;
	});
	useEffect(() => () => material.dispose(), [material]);
	return material;
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
	const { plan, summary, selected, hover } = useScene();
	const focused = selected === "carroceria" || hover === "carroceria";
	const status = summary.carroceria.status;
	const tint = focused
		? statusColor[status === "sin-registro" ? "registrado" : status]
		: "#38bdf8";
	const body = useHolo(tint, focused ? 1.1 : 0.6);
	const glass = useHolo(focused ? tint : "#7dd3fc", focused ? 1 : 0.5);
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
			<Lines color={tint} />
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

/** Líneas de carácter: arcos de rueda y línea de cintura. */
function Lines({ color }: { color: string }) {
	const { plan } = useScene();
	const { wheels: w } = plan;
	const belt = useMemo(
		() =>
			new THREE.CatmullRomCurve3(
				plan.lower
					.slice(1, -1)
					.map(([x, , yt, wd]) => new THREE.Vector3(x, yt - 0.03, wd * 0.98)),
			),
		[plan],
	);
	const first = plan.lower[0][0];
	const last = plan.lower[plan.lower.length - 1][0];
	const arches = [w.front, w.rear].filter((x) => x > first && x < last);
	return (
		<group>
			{[1, -1].map((side) => (
				<group key={side} scale={[1, 1, side]}>
					<mesh raycast={noRay}>
						<tubeGeometry args={[belt, 96, 0.006, 6, false]} />
						<meshBasicMaterial color={color} toneMapped={false} />
					</mesh>
					{arches.map((x) => (
						<mesh
							key={x}
							position={[x, w.r, widthAt(plan, x) * 0.99]}
							raycast={noRay}
						>
							<torusGeometry args={[w.r + 0.07, 0.008, 6, 48, Math.PI]} />
							<meshBasicMaterial color={color} toneMapped={false} />
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
	const { summary, selected, hover, onHover, onSelect } = useScene();
	const material = useRef<THREE.MeshStandardMaterial>(null);
	const status = statusOf(summary[zone], axle);
	const serviced = status !== "sin-registro";
	const active = selected === zone;
	const hovered = hover === zone;
	const glow = serviced ? statusColor[status] : "#cbd5e1";
	const color = active || hovered || (serviced && !solid) ? glow : base;
	const opacity = active || hovered ? 1 : serviced ? 0.55 : solid ? 0.5 : 0.22;
	const intensity = active
		? serviced
			? 1.6
			: 0.5
		: hovered
			? 0.9
			: serviced
				? solid
					? 0.05
					: 0.3
				: 0;

	useFrame(({ clock }) => {
		if (!material.current) return;
		material.current.emissiveIntensity =
			active && serviced
				? intensity + Math.sin(clock.elapsedTime * 3.5) * 0.45
				: intensity;
	});

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: es un objeto three.js, no DOM; el teclado usa las pestañas de zonas.
		<mesh
			position={position}
			rotation={rotation}
			onPointerOver={(e: ThreeEvent<PointerEvent>) => {
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
				metalness={0.4}
				roughness={0.4}
				transparent
				opacity={opacity}
				depthWrite={opacity > 0.9}
			/>
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
	return (
		<mesh position={position} rotation={rotation} raycast={noRay}>
			{children}
			<meshStandardMaterial
				color="#1e3a5f"
				transparent
				opacity={0.35}
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

function Vehicle() {
	return (
		<group>
			<Shell />
			<Structure />
			<Engine />
			<Oil />
			<Battery />
			<Cooling />
			<AirConditioning />
			<Electrical />
			<Transmission />
			<Steering />
			<Running />
			<Exhaust />
			<Mirrors />
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
	return (
		<group>
			<Part zone="motor" position={[e.x, e.y, 0]}>
				<boxGeometry args={[e.l, e.h, e.w]} />
			</Part>
			<Part zone="motor" position={[e.x, top + 0.05, 0]}>
				<boxGeometry args={[e.l * 0.92, 0.1, e.w * 0.9]} />
			</Part>
			<Part
				zone="motor"
				position={[e.x - e.l / 2 - 0.05, top + 0.02, e.w / 2 + 0.06]}
			>
				<boxGeometry args={[0.26, 0.1, 0.22]} />
			</Part>
			{[-0.21, -0.07, 0.07, 0.21].map((z) => (
				<Part key={z} zone="motor" position={[e.x, top + 0.13, z]}>
					<cylinderGeometry args={[0.016, 0.016, 0.07, 8]} />
				</Part>
			))}
			<Part
				zone="motor"
				position={[e.x + e.l / 2 + 0.03, e.y, -e.w / 2 + 0.05]}
			>
				<torusGeometry args={[0.13, 0.012, 8, 32]} />
			</Part>
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
			{[-0.07, 0.07].map((dx) => (
				<Part key={dx} zone="bateria" position={[x + dx, y + 0.11, z]}>
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
	return (
		<group>
			<Part zone="refrigeracion" position={[x, e.y, 0]}>
				<boxGeometry args={[0.05, e.h + 0.1, half * 2]} />
			</Part>
			<Part
				zone="refrigeracion"
				position={[x - 0.06, e.y, half * 0.35]}
				rotation={AXIS_X}
			>
				<cylinderGeometry args={[e.h * 0.45, e.h * 0.45, 0.035, 24]} />
			</Part>
			<Part
				zone="refrigeracion"
				position={[x - 0.16, e.y + e.h / 2 + 0.06, -(half - 0.1)]}
			>
				<boxGeometry args={[0.12, 0.12, 0.1]} />
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
				<boxGeometry args={[0.03, e.h, half * 2]} />
			</Part>
			<Part
				zone="aire_acondicionado"
				position={[e.x + e.l / 2 - 0.08, e.y - e.h / 2 + 0.04, -e.w / 2 - 0.08]}
				rotation={AXIS_Z}
			>
				<cylinderGeometry args={[0.06, 0.06, 0.14, 16]} />
			</Part>
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
			<Part
				zone="electrico"
				position={[e.x + e.l / 2 - 0.06, e.y + 0.1, -e.w / 2 - 0.07]}
				rotation={AXIS_Z}
			>
				<cylinderGeometry args={[0.07, 0.07, 0.12, 16]} />
			</Part>
			<Part
				zone="electrico"
				position={[e.x - e.l / 2 + 0.06, e.y - e.h / 2 + 0.04, e.w / 2 + 0.07]}
				rotation={AXIS_X}
			>
				<cylinderGeometry args={[0.05, 0.05, 0.16, 16]} />
			</Part>
			{[1, -1].map((side) => (
				<group key={side}>
					<Part
						zone="electrico"
						base="#fef9c3"
						solid
						position={[l.fx, l.fy, side * l.fz]}
					>
						<boxGeometry args={[0.07, 0.09, 0.3]} />
					</Part>
					<Part
						zone="electrico"
						base="#fb7185"
						solid
						position={[l.rx, l.ry, side * l.rz]}
					>
						<boxGeometry args={[0.05, 0.1, 0.22]} />
					</Part>
				</group>
			))}
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
			<Part zone="transmision" position={[boxX, boxY, 0]}>
				<boxGeometry args={[0.55, 0.28, 0.3]} />
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
				<Rod
					key={s}
					zone="direccion"
					r={0.015}
					from={[rackX, rackY, s * half]}
					to={[w.front - 0.1, w.r, s * (w.track - 0.1)]}
				/>
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

/** Llantas, frenos y suspensión de cada rueda. */
function Running() {
	const { plan } = useScene();
	const w = plan.wheels;
	const spring = useMemo(() => new Helix(0.065, w.r * 1.4, 6), [w.r]);
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
				return (
					<group key={`${axle}${side}`}>
						<Part
							zone="llantas"
							axle={axle}
							base="#1e293b"
							solid
							position={[x, w.r, z]}
							rotation={AXIS_Z}
						>
							<cylinderGeometry args={[w.r, w.r, w.width, 40]} />
						</Part>
						<Part
							zone="llantas"
							axle={axle}
							position={[x, w.r, z + side * 0.005]}
							rotation={AXIS_Z}
						>
							<cylinderGeometry
								args={[w.r * 0.6, w.r * 0.6, w.width + 0.005, 28]}
							/>
						</Part>
						{dual && (
							<Part
								zone="llantas"
								axle={axle}
								base="#1e293b"
								solid
								position={[x, w.r, z - side * (w.width + 0.04)]}
								rotation={AXIS_Z}
							>
								<cylinderGeometry args={[w.r, w.r, w.width, 40]} />
							</Part>
						)}
						{drum ? (
							<Part
								zone="frenos"
								axle={axle}
								position={[x, w.r, inner]}
								rotation={AXIS_Z}
							>
								<cylinderGeometry args={[w.r * 0.55, w.r * 0.55, 0.1, 28]} />
							</Part>
						) : (
							<>
								<Part
									zone="frenos"
									axle={axle}
									position={[x, w.r, inner]}
									rotation={AXIS_Z}
								>
									<cylinderGeometry args={[w.r * 0.6, w.r * 0.6, 0.025, 32]} />
								</Part>
								<Part
									zone="frenos"
									axle={axle}
									position={[
										x + (axle === "front" ? -1 : 1) * w.r * 0.4,
										w.r * 1.38,
										inner + side * 0.01,
									]}
									rotation={[0, 0, axle === "front" ? 0.8 : -0.8]}
								>
									<boxGeometry args={[0.07, w.r * 0.5, 0.06]} />
								</Part>
							</>
						)}
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
					</group>
				);
			})}
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
				<cylinderGeometry args={[0.075, 0.075, 0.32, 16]} />
			</Part>
			<Part
				zone="escape"
				position={[plan.muffler, y + 0.02, -0.4]}
				rotation={AXIS_X}
			>
				<cylinderGeometry args={[0.11, 0.11, 0.5, 20]} />
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
				<Part key={s} zone="carroceria" position={[x, y, s * z]}>
					<boxGeometry args={[0.14, 0.1, 0.08]} />
				</Part>
			))}
		</group>
	);
}
