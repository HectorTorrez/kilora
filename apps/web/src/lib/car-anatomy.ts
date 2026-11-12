import { type BodyType, plans, type VehiclePlan } from "@/lib/vehicle-plans";

/*
 * Dibujo 2D tipo "atlas de anatomía": la silueta del vehículo en gris con sus
 * piezas internas apenas marcadas, para resaltar la que se cambió. Las vistas
 * lateral y desde abajo salen de los mismos planos que la escena 3D, así cada
 * tipo de carrocería tiene su propia silueta y sus piezas en el lugar correcto.
 */

export type AnatomyView = "lateral" | "capo" | "abajo";
export const anatomyViews: AnatomyView[] = ["lateral", "capo", "abajo"];
export const anatomyViewLabels: Record<AnatomyView, string> = {
	lateral: "Lateral",
	capo: "Bajo el capó",
	abajo: "Desde abajo",
};

export type Shape =
	| "body"
	| "windshield"
	| "mirrors"
	| "wipers"
	| "headlights"
	| "taillights"
	| "engine"
	| "oil_pan"
	| "oil_cap"
	| "oil_filter"
	| "dipstick"
	| "air_filter"
	| "spark_plugs"
	| "injectors"
	| "timing_belt"
	| "accessory_belt"
	| "fuel_tank"
	| "fuel_filter"
	| "radiator"
	| "condenser"
	| "coolant_tank"
	| "thermostat"
	| "water_pump"
	| "ac_compressor"
	| "cabin_filter"
	| "battery"
	| "alternator"
	| "starter"
	| "fusebox"
	| "transmission"
	| "clutch"
	| "cv_axles"
	| "driveshaft"
	| "differential"
	| "steering_rack"
	| "tie_rods"
	| "steering_column"
	| "power_steering_tank"
	| "front_wheel"
	| "rear_wheel"
	| "front_disc"
	| "rear_disc"
	| "front_caliper"
	| "rear_caliper"
	| "brake_fluid"
	| "front_shock"
	| "rear_shock"
	| "rear_leaf"
	| "exhaust_pipe"
	| "catalytic"
	| "muffler";

/** Cómo se pinta un trazo: pieza rellena, pieza lineal o decoración fija. */
export type LayerRole = "body" | "glass" | "part" | "line" | "tire" | "detail";

export type Layer = {
	role: LayerRole;
	/** Sin forma: decoración que nunca se resalta. */
	shape?: Shape;
	d: string;
	/** Punto donde apunta la etiqueta cuando la pieza está resaltada. */
	anchor?: [number, number];
};

export type ViewGeometry = {
	width: number;
	height: number;
	layers: Layer[];
	/** Pasos de rueda que se recortan de la carrocería. */
	arches: { cx: number; cy: number; r: number }[];
};

type Pt = [number, number];

// ---------- primitivas en píxeles ----------

const f = (n: number) => Math.round(n * 10) / 10;

function rectD(x: number, y: number, w: number, h: number, r = 0) {
	const rr = Math.max(0, Math.min(r, w / 2, h / 2));
	if (!rr) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
	return `M${f(x + rr)} ${f(y)}H${f(x + w - rr)}A${f(rr)} ${f(rr)} 0 0 1 ${f(x + w)} ${f(y + rr)}V${f(y + h - rr)}A${f(rr)} ${f(rr)} 0 0 1 ${f(x + w - rr)} ${f(y + h)}H${f(x + rr)}A${f(rr)} ${f(rr)} 0 0 1 ${f(x)} ${f(y + h - rr)}V${f(y + rr)}A${f(rr)} ${f(rr)} 0 0 1 ${f(x + rr)} ${f(y)}Z`;
}

function circleD(cx: number, cy: number, r: number) {
	return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
}

function polyD(points: Pt[], close = false) {
	return (
		points.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("") +
		(close ? "Z" : "")
	);
}

/** Polígono cerrado suavizado (Catmull-Rom a Bézier). */
function smoothD(points: Pt[], tension = 0.5) {
	const n = points.length;
	const p = (i: number) => points[(i + n) % n];
	let d = `M${f(p(0)[0])} ${f(p(0)[1])}`;
	for (let i = 0; i < n; i++) {
		const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
		const k = tension / 3;
		const c1: Pt = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
		const c2: Pt = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
		d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
	}
	return `${d}Z`;
}

/** Recorta un polígono a la franja xmin ≤ x ≤ xmax (Sutherland–Hodgman). */
function clipX(points: Pt[], xmin: number, xmax: number) {
	const clip = (pts: Pt[], inside: (p: Pt) => boolean, edge: number) => {
		const out: Pt[] = [];
		for (let i = 0; i < pts.length; i++) {
			const a = pts[i];
			const b = pts[(i + 1) % pts.length];
			const cross = (): Pt => {
				const t = (edge - a[0]) / (b[0] - a[0]);
				return [edge, a[1] + (b[1] - a[1]) * t];
			};
			if (inside(a)) {
				out.push(a);
				if (!inside(b)) out.push(cross());
			} else if (inside(b)) out.push(cross());
		}
		return out;
	};
	return clip(
		clip(points, (p) => p[0] >= xmin, xmin),
		(p) => p[0] <= xmax,
		xmax,
	);
}

/** Interpola una columna de las estaciones de la carrocería en X. */
function profileAt(stations: number[][], x: number, col: number) {
	if (x <= stations[0][0]) return stations[0][col];
	for (let i = 1; i < stations.length; i++) {
		if (x <= stations[i][0]) {
			const t =
				(x - stations[i - 1][0]) / (stations[i][0] - stations[i - 1][0]);
			return (
				stations[i - 1][col] + (stations[i][col] - stations[i - 1][col]) * t
			);
		}
	}
	return stations[stations.length - 1][col];
}

const center = (x: number, y: number, w: number, h: number): Pt => [
	x + w / 2,
	y + h / 2,
];

// ---------- vista lateral (adelante a la derecha) ----------

const S = 70; // px por metro

function lateral(plan: VehiclePlan): ViewGeometry {
	const { engine: e, wheels: w } = plan;
	const minX =
		Math.min(
			plan.lower[0][0],
			plan.bed?.x0 ?? 0,
			plan.cargo?.x0 ?? 0,
			plan.lights.rx,
			plan.tailX,
		) - 0.12;
	const maxX =
		Math.max(plan.lower[plan.lower.length - 1][0], plan.lights.fx) + 0.12;
	const top =
		Math.max(
			...plan.cabin.map((s) => s[2]),
			plan.cargo?.top ?? 0,
			plan.bed?.top ?? 0,
		) + 0.12;
	const X = (x: number) => (x - minX) * S;
	const Y = (y: number) => (top - y) * S;
	const P = (x: number, y: number): Pt => [X(x), Y(y)];
	const box = (x0: number, y0: number, x1: number, y1: number, r = 0.03) => {
		const [ax, ay] = P(x0, y1);
		const wpx = (x1 - x0) * S;
		const hpx = (y1 - y0) * S;
		return {
			d: rectD(ax, ay, wpx, hpx, r * S),
			anchor: center(ax, ay, wpx, hpx),
		};
	};
	const dot = (x: number, y: number, r: number) => ({
		d: circleD(X(x), Y(y), r * S),
		anchor: P(x, y),
	});
	const layers: Layer[] = [];
	const add = (
		role: LayerRole,
		shape: Shape | undefined,
		g: { d: string; anchor?: Pt },
	) => layers.push({ role, shape, ...g });

	// Carrocería: parte baja + cabina (+ palangana o furgón).
	const lower = plan.lower;
	const lowerPts: Pt[] = [
		...lower.map((s) => P(s[0], s[2])),
		...[...lower].reverse().map((s) => P(s[0], s[1])),
	];
	const cab = plan.cabin;
	const cabPts: Pt[] = [
		...cab.map((s) => P(s[0], s[2])),
		...[...cab].reverse().map((s) => P(s[0], s[1])),
	];
	const bodyParts = [smoothD(lowerPts, 0.35), smoothD(cabPts, 0.35)];
	if (plan.bed) {
		const b = plan.bed;
		bodyParts.push(
			box(b.x0, plan.frame?.y ?? b.floor - 0.3, b.x1 + 0.1, b.top, 0.04).d,
		);
	}
	if (plan.cargo) {
		const c = plan.cargo;
		bodyParts.push(box(c.x0, c.bottom, c.x1, c.top, 0.05).d);
	}
	if (plan.frame) {
		const fr = plan.frame;
		add("detail", undefined, box(fr.x0, fr.y - 0.05, fr.x1, fr.y + 0.05, 0.02));
	}
	add("body", "body", {
		d: bodyParts.join(""),
		anchor: P(
			(plan.cabin[0][0] + plan.cabin[cab.length - 1][0]) / 2,
			cab[2][2] - 0.1,
		),
	});

	// Vidrios: perfil del techo hacia adentro, cortado en la línea de cintura.
	const belt = Math.max(...cab.map((s) => profileAt(lower, s[0], 2))) + 0.04;
	const glassTop: Pt[] = cab.slice(1, -1).map((s) => [s[0], s[2] - 0.08] as Pt);
	const first = cab[0];
	const last = cab[cab.length - 1];
	const glass: Pt[] = [
		[first[0] + 0.08, belt],
		...glassTop,
		[last[0] - 0.08, belt],
	];
	const aPillar = plan.dash.x - 0.12;
	const side = clipX(glass, -99, aPillar - 0.03).map((p) =>
		P(p[0], Math.max(p[1], belt)),
	);
	const front = clipX(glass, aPillar + 0.03, 99).map((p) =>
		P(p[0], Math.max(p[1], belt)),
	);
	if (side.length > 2) add("glass", undefined, { d: polyD(side, true) });
	if (front.length > 2) {
		const xs = front.map((p) => p[0]);
		add("glass", "windshield", {
			d: polyD(front, true),
			anchor: [(Math.min(...xs) + Math.max(...xs)) / 2, Y(belt + 0.18)],
		});
	}
	// Parante central sobre los vidrios laterales.
	if (side.length > 2) {
		const xs = side.map((p) => p[0]);
		const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
		const yTop = Math.min(...side.map((p) => p[1]));
		add("detail", undefined, {
			d: rectD(mid - 3, yTop - 2, 6, Y(belt) - yTop + 2, 2),
		});
	}

	// Sistema de escape y combustible (al fondo).
	const engRear = e.x - e.l / 2;
	const floor = plan.floorY;
	add("line", "exhaust_pipe", {
		d: polyD([
			P(engRear + 0.12, e.y - e.h / 2),
			P(engRear - 0.1, floor - 0.02),
			P(plan.tailX + 0.05, floor + 0.02),
		]),
		anchor: P((engRear + plan.tailX) / 2, floor),
	});
	add(
		"part",
		"catalytic",
		box(engRear - 0.62, floor - 0.08, engRear - 0.3, floor + 0.04, 0.05),
	);
	add(
		"part",
		"muffler",
		box(
			plan.muffler - 0.24,
			floor - 0.08,
			plan.muffler + 0.24,
			floor + 0.1,
			0.07,
		),
	);
	const tankX = w.rear + w.r + 0.08;
	add(
		"part",
		"fuel_tank",
		box(tankX, floor + 0.02, tankX + 0.6, floor + 0.24, 0.03),
	);
	add("part", "fuel_filter", dot(tankX + 0.72, floor + 0.06, 0.035));

	// Tren motriz.
	const rwd = plan.drive !== "fwd";
	const clutchX = engRear - 0.07;
	add(
		"part",
		"clutch",
		box(clutchX, e.y - e.h * 0.4, engRear, e.y + e.h * 0.35, 0.02),
	);
	if (rwd) {
		const tx = clutchX - 0.55;
		add("part", "transmission", {
			d: polyD(
				[
					P(clutchX, e.y + e.h * 0.32),
					P(tx, e.y + e.h * 0.08),
					P(tx, e.y - e.h * 0.28),
					P(clutchX, e.y - e.h * 0.42),
				],
				true,
			),
			anchor: P((clutchX + tx) / 2, e.y - e.h * 0.05),
		});
		const shafts: Pt[][] = [
			[P(tx, e.y - e.h * 0.12), P(w.rear + w.r * 0.6, w.r + 0.02)],
		];
		if (plan.drive === "4x4")
			shafts.push([
				P(tx + 0.1, e.y - e.h * 0.3),
				P(w.front - w.r * 0.6, w.r + 0.02),
			]);
		add("line", "driveshaft", {
			d: shafts.map((s) => polyD(s)).join(""),
			anchor: P((tx + w.rear) / 2, (e.y - e.h * 0.12 + w.r) / 2),
		});
	} else {
		add(
			"part",
			"transmission",
			box(clutchX - 0.26, e.y - e.h * 0.45, clutchX, e.y + e.h * 0.2, 0.04),
		);
	}

	// Motor y lo que lo rodea.
	add(
		"part",
		"engine",
		box(engRear, e.y - e.h / 2, e.x + e.l / 2, e.y + e.h / 2, 0.05),
	);
	add(
		"part",
		"oil_pan",
		box(
			e.x - e.l * 0.32,
			e.y - e.h / 2 - 0.08,
			e.x + e.l * 0.32,
			e.y - e.h / 2,
			0.02,
		),
	);
	add(
		"part",
		"oil_filter",
		box(
			engRear + 0.03,
			e.y - e.h / 2 + 0.02,
			engRear + 0.1,
			e.y - e.h / 2 + 0.13,
			0.02,
		),
	);
	add(
		"part",
		"timing_belt",
		box(
			e.x + e.l / 2 - 0.06,
			e.y - e.h * 0.35,
			e.x + e.l / 2,
			e.y + e.h * 0.42,
			0.03,
		),
	);
	add("line", "accessory_belt", {
		d: rectD(
			X(e.x + e.l / 2 + 0.02),
			Y(e.y + e.h * 0.38),
			0.07 * S,
			e.h * 0.76 * S,
			0.035 * S,
		),
		anchor: P(e.x + e.l / 2 + 0.055, e.y),
	});
	add(
		"part",
		"water_pump",
		dot(e.x + e.l / 2 + 0.055, e.y + e.h * 0.05, 0.035),
	);
	add("part", "alternator", dot(e.x + e.l * 0.28, e.y + e.h * 0.22, 0.055));
	add("part", "ac_compressor", dot(e.x + e.l * 0.28, e.y - e.h * 0.27, 0.055));
	add("part", "starter", dot(engRear + 0.03, e.y - e.h * 0.05, 0.05));
	add("part", "thermostat", dot(e.x + e.l * 0.05, e.y + e.h / 2 - 0.05, 0.03));
	const hood = profileAt(lower, e.x, 2);
	const afTop = Math.min(e.y + e.h / 2 + 0.1, hood - 0.03);
	add(
		"part",
		"air_filter",
		box(e.x - e.l * 0.35, e.y + e.h / 2, e.x + e.l * 0.05, afTop, 0.02),
	);
	add(
		"part",
		"radiator",
		box(
			plan.radiatorX - 0.03,
			e.y - e.h / 2,
			plan.radiatorX + 0.02,
			e.y + e.h / 2 + 0.06,
			0.01,
		),
	);
	add(
		"part",
		"condenser",
		box(
			plan.radiatorX + 0.035,
			e.y - e.h / 2 + 0.03,
			plan.radiatorX + 0.06,
			e.y + e.h / 2 + 0.03,
			0.01,
		),
	);
	const [bx, by] = plan.battery;
	add("part", "battery", box(bx - 0.11, by - 0.08, bx + 0.11, by + 0.08, 0.02));

	// Cabina: dirección y filtro de cabina.
	add("line", "steering_column", {
		d: polyD([P(plan.dash.x, plan.dash.y), P(w.front - 0.28, w.r + 0.14)]),
		anchor: P(
			(plan.dash.x + w.front - 0.28) / 2,
			(plan.dash.y + w.r + 0.14) / 2,
		),
	});
	add(
		"part",
		"cabin_filter",
		box(
			plan.dash.x - 0.12,
			plan.dash.y - 0.32,
			plan.dash.x + 0.04,
			plan.dash.y - 0.24,
			0.015,
		),
	);

	// Suspensión.
	const shockTop = (x: number) =>
		Math.min(
			w.r * 2.3,
			(plan.bed ? plan.bed.floor : profileAt(lower, x, 2)) - 0.08,
		);
	add("line", "front_shock", {
		d: polyD([P(w.front, w.r), P(w.front - 0.05, shockTop(w.front))]),
		anchor: P(w.front - 0.03, (w.r + shockTop(w.front)) / 2 + 0.08),
	});
	add("line", "rear_shock", {
		d: polyD([P(w.rear, w.r), P(w.rear + 0.06, shockTop(w.rear))]),
		anchor: P(w.rear + 0.04, (w.r + shockTop(w.rear)) / 2 + 0.08),
	});
	if (plan.rearSpring === "ballesta") {
		const [a, c, b] = [
			P(w.rear - 0.6, w.r + 0.14),
			P(w.rear, w.r - 0.14),
			P(w.rear + 0.6, w.r + 0.14),
		];
		add("line", "rear_leaf", {
			d: `M${f(a[0])} ${f(a[1])}Q${f(c[0])} ${f(c[1])} ${f(b[0])} ${f(b[1])}`,
			anchor: P(w.rear + 0.42, w.r + 0.1),
		});
	}

	// Ruedas y frenos.
	const arches: ViewGeometry["arches"] = [];
	for (const axle of ["front", "rear"] as const) {
		const x = w[axle];
		const [cx, cy] = P(x, w.r);
		const r = w.r * S;
		arches.push({ cx, cy, r: r * 1.14 });
		add("tire", `${axle}_wheel`, {
			d: circleD(cx, cy, r),
			anchor: [cx + (axle === "front" ? 0.55 : -0.55) * r, cy + r * 0.55],
		});
		add("detail", undefined, { d: circleD(cx, cy, r * 0.64) });
		const drum = axle === "rear" && plan.rearBrake === "tambor";
		add("part", `${axle}_disc`, {
			d: circleD(cx, cy, r * (drum ? 0.5 : 0.42)),
			anchor: [cx, cy],
		});
		if (!drum) {
			const dir = axle === "front" ? 1 : -1;
			const ra = r * 0.5;
			const a0 = -Math.PI / 2 + 0.35;
			const a1 = 0.15;
			const pa: Pt = [cx + dir * Math.cos(a0) * ra, cy + Math.sin(a0) * ra];
			const pb: Pt = [cx + dir * Math.cos(a1) * ra, cy + Math.sin(a1) * ra];
			add("line", `${axle}_caliper`, {
				d: `M${f(pa[0])} ${f(pa[1])}A${f(ra)} ${f(ra)} 0 0 ${dir === 1 ? 1 : 0} ${f(pb[0])} ${f(pb[1])}`,
				anchor: [cx + dir * ra * 0.75, cy - ra * 0.55],
			});
		}
	}

	// Luces y espejos por encima de todo.
	const l = plan.lights;
	add(
		"part",
		"headlights",
		box(l.fx - 0.14, l.fy - 0.05, l.fx + 0.02, l.fy + 0.05, 0.03),
	);
	add(
		"part",
		"taillights",
		box(l.rx - 0.02, l.ry - 0.07, l.rx + 0.06, l.ry + 0.07, 0.02),
	);
	const [mx, my] = plan.mirror;
	add(
		"part",
		"mirrors",
		box(mx - 0.06, my - 0.03, mx + 0.08, my + 0.07, 0.025),
	);
	const ws =
		front.length > 2
			? Math.max(...front.map((p) => p[0]))
			: X(plan.dash.x + 0.3);
	add("line", "wipers", {
		d: polyD([
			[ws - 0.45 * S, Y(belt) - 2],
			[ws - 0.05 * S, Y(belt) - 4],
		]),
		anchor: [ws - 0.25 * S, Y(belt) - 3],
	});

	return { width: X(maxX), height: Y(-0.04), layers, arches };
}

// ---------- vista desde abajo (adelante a la derecha) ----------

function abajo(plan: VehiclePlan): ViewGeometry {
	const { engine: e, wheels: w } = plan;
	const minX =
		Math.min(plan.lower[0][0], plan.bed?.x0 ?? 0, plan.cargo?.x0 ?? 0) - 0.1;
	const maxX = plan.lower[plan.lower.length - 1][0] + 0.1;
	const zMax =
		Math.max(
			w.track + w.width / 2,
			...plan.lower.map((s) => s[3]),
			plan.cargo?.w ?? 0,
			plan.bed?.w ?? 0,
		) + 0.06;
	const X = (x: number) => (x - minX) * S;
	const Z = (z: number) => (zMax - z) * S;
	const P = (x: number, z: number): Pt => [X(x), Z(z)];
	const box = (x0: number, z0: number, x1: number, z1: number, r = 0.04) => {
		const [ax, ay] = P(x0, Math.max(z0, z1));
		const wpx = (x1 - x0) * S;
		const hpx = Math.abs(z1 - z0) * S;
		return {
			d: rectD(ax, ay, wpx, hpx, r * S),
			anchor: center(ax, ay, wpx, hpx),
		};
	};
	const dot = (x: number, z: number, r: number) => ({
		d: circleD(X(x), Z(z), r * S),
		anchor: P(x, z),
	});
	const both = (g: (s: 1 | -1) => { d: string; anchor: Pt }) => {
		const a = g(1);
		return { d: a.d + g(-1).d, anchor: a.anchor };
	};
	const layers: Layer[] = [];
	const add = (
		role: LayerRole,
		shape: Shape | undefined,
		g: { d: string; anchor?: Pt },
	) => layers.push({ role, shape, ...g });

	const lower = plan.lower;
	const bodyParts = [
		smoothD(
			[
				...lower.map((s) => P(s[0], s[3])),
				...[...lower].reverse().map((s) => P(s[0], -s[3])),
			],
			0.35,
		),
	];
	if (plan.bed)
		bodyParts.push(
			box(plan.bed.x0, -plan.bed.w, plan.bed.x1 + 0.1, plan.bed.w, 0.06).d,
		);
	if (plan.cargo)
		bodyParts.push(
			box(plan.cargo.x0, -plan.cargo.w, plan.cargo.x1, plan.cargo.w, 0.06).d,
		);
	add("body", "body", { d: bodyParts.join(""), anchor: P(0, zMax * 0.6) });
	if (plan.frame) {
		const fr = plan.frame;
		add("detail", undefined, {
			d:
				box(fr.x0, fr.z - 0.04, fr.x1, fr.z + 0.04, 0.02).d +
				box(fr.x0, -fr.z - 0.04, fr.x1, -fr.z + 0.04, 0.02).d,
		});
	}

	// Llantas: desde abajo se ven enteras, por encima de la carrocería.
	const tireW = w.width;
	const wheelAt = (x: number, z: number) =>
		box(x - w.r, z - tireW / 2, x + w.r, z + tireW / 2, 0.05);
	for (const axle of ["front", "rear"] as const) {
		const x = w[axle];
		const dual = axle === "rear" && w.dualRear;
		const zs = dual ? [w.track, w.track - tireW - 0.03] : [w.track];
		const ds = zs.flatMap((z) => [wheelAt(x, z).d, wheelAt(x, -z).d]).join("");
		add("tire", `${axle}_wheel`, { d: ds, anchor: P(x, w.track) });
	}

	const inner = w.track - w.width / 2;
	for (const axle of ["front", "rear"] as const) {
		const x = w[axle];
		const zIn = axle === "rear" && w.dualRear ? inner - w.width - 0.03 : inner;
		add(
			"part",
			`${axle}_disc`,
			both((s) =>
				box(
					x - w.r * 0.45,
					s * (zIn - 0.02),
					x + w.r * 0.45,
					s * (zIn - 0.08),
					0.01,
				),
			),
		);
		add(
			"part",
			`${axle}_shock`,
			both((s) => dot(x, s * (zIn - 0.2), 0.055)),
		);
	}
	if (plan.rearSpring === "ballesta") {
		const zl = (w.dualRear ? inner - w.width - 0.03 : inner) - 0.2;
		add(
			"part",
			"rear_leaf",
			both((s) =>
				box(w.rear - 0.6, s * (zl - 0.04), w.rear + 0.6, s * (zl + 0.04), 0.03),
			),
		);
	}

	// Escape y combustible.
	const engRear = e.x - e.l / 2;
	add("line", "exhaust_pipe", {
		d: polyD([
			P(e.x - e.l * 0.15, -0.12),
			P(engRear - 0.15, -0.3),
			P(plan.tailX + 0.05, -0.3),
		]),
		anchor: P((engRear + plan.tailX) / 2, -0.3),
	});
	add(
		"part",
		"catalytic",
		box(engRear - 0.62, -0.38, engRear - 0.3, -0.22, 0.07),
	);
	add(
		"part",
		"muffler",
		box(plan.muffler - 0.24, -0.45, plan.muffler + 0.24, -0.15, 0.1),
	);
	const tankX = w.rear + w.r + 0.08;
	add("part", "fuel_tank", box(tankX, 0.1, tankX + 0.62, 0.6, 0.06));
	add("part", "fuel_filter", dot(tankX + 0.75, 0.32, 0.045));

	// Tren motriz.
	const rwd = plan.drive !== "fwd";
	const fourByFour = plan.drive === "4x4";
	if (rwd) {
		const tx = engRear - 0.62;
		const shafts = [polyD([P(tx, 0), P(w.rear, 0)])];
		if (fourByFour) shafts.push(polyD([P(tx + 0.15, 0.12), P(w.front, 0.12)]));
		add("line", "driveshaft", {
			d: shafts.join(""),
			anchor: P((tx + w.rear) / 2, 0),
		});
		const diffs = [dot(w.rear, 0, 0.13).d];
		if (fourByFour) diffs.push(dot(w.front, 0.12, 0.11).d);
		add("part", "differential", { d: diffs.join(""), anchor: P(w.rear, 0) });
	}
	const axleLines: string[] = [];
	if (!rwd || fourByFour)
		axleLines.push(
			polyD([P(w.front, inner - 0.04), P(w.front, -(inner - 0.04))]),
		);
	if (rwd)
		axleLines.push(
			polyD([P(w.rear, inner - 0.04), P(w.rear, -(inner - 0.04))]),
		);
	add("line", "cv_axles", {
		d: axleLines.join(""),
		anchor: P(rwd && !fourByFour ? w.rear : w.front, inner * 0.6),
	});
	if (rwd) {
		add("part", "clutch", box(engRear - 0.07, -0.2, engRear, 0.2, 0.02));
		add(
			"part",
			"transmission",
			box(engRear - 0.62, -0.16, engRear - 0.07, 0.16, 0.05),
		);
	} else {
		add(
			"part",
			"transmission",
			box(
				e.x - e.l * 0.45,
				-e.w / 2 - 0.24,
				e.x + e.l * 0.15,
				-e.w / 2 + 0.02,
				0.06,
			),
		);
		add(
			"part",
			"clutch",
			box(
				e.x - e.l * 0.2,
				-e.w / 2 - 0.03,
				e.x + e.l * 0.05,
				-e.w / 2 + 0.06,
				0.02,
			),
		);
	}
	add("part", "engine", box(engRear, -e.w / 2, e.x + e.l / 2, e.w / 2, 0.08));
	add(
		"part",
		"oil_pan",
		box(e.x - e.l * 0.32, -e.w * 0.32, e.x + e.l * 0.32, e.w * 0.32, 0.05),
	);
	add("part", "oil_filter", dot(e.x - e.l * 0.38, e.w * 0.38, 0.045));

	// Dirección: cremallera detrás del eje delantero y terminales a las ruedas.
	const rackX = w.front - 0.16;
	add("line", "steering_rack", {
		d: polyD([P(rackX, inner - 0.3), P(rackX, -(inner - 0.3))]),
		anchor: P(rackX, -0.2),
	});
	add("line", "tie_rods", {
		d:
			polyD([P(rackX, inner - 0.3), P(w.front - 0.1, inner - 0.05)]) +
			polyD([P(rackX, -(inner - 0.3)), P(w.front - 0.1, -(inner - 0.05))]),
		anchor: P(w.front - 0.13, inner - 0.17),
	});

	return { width: X(maxX), height: Z(-zMax), layers, arches: [] };
}

// ---------- vista bajo el capó (adelante arriba) ----------

const capoLayers: Layer[] = (() => {
	const L: Layer[] = [];
	const r = (
		shape: Shape | undefined,
		role: LayerRole,
		x: number,
		y: number,
		w: number,
		h: number,
		rad = 4,
	) =>
		L.push({
			role,
			shape,
			d: rectD(x, y, w, h, rad),
			anchor: center(x, y, w, h),
		});
	const c = (
		shape: Shape | undefined,
		role: LayerRole,
		cx: number,
		cy: number,
		rad: number,
	) => L.push({ role, shape, d: circleD(cx, cy, rad), anchor: [cx, cy] });
	L.push({
		role: "body",
		shape: "body",
		d: "M30 8L270 8Q290 8 290 28L284 176Q282 190 266 190L34 190Q18 190 16 176L10 28Q10 8 30 8Z",
		anchor: [150, 182],
	});
	L.push({
		role: "glass",
		shape: "windshield",
		d: rectD(24, 196, 252, 16, 5),
		anchor: [150, 204],
	});
	L.push({
		role: "line",
		shape: "wipers",
		d: "M58 207L126 199M174 207L242 199",
		anchor: [126, 199],
	});
	r("headlights", "part", 14, 12, 40, 10, 5);
	L.push({
		role: "part",
		shape: "headlights",
		d: rectD(246, 12, 40, 10, 5),
		anchor: [266, 17],
	});
	r("condenser", "part", 62, 9, 176, 5, 2);
	r("radiator", "part", 60, 16, 180, 13, 3);
	r("engine", "part", 92, 46, 116, 94, 12);
	for (const x of [120, 140, 160, 180])
		L.push({ role: "detail", d: circleD(x, 112, 7) });
	L.push({
		role: "part",
		shape: "spark_plugs",
		d: [120, 140, 160, 180].map((x) => circleD(x, 112, 4)).join(""),
		anchor: [150, 112],
	});
	L.push({
		role: "part",
		shape: "injectors",
		d: [114, 134, 154, 174].map((x) => rectD(x + 2, 84, 8, 12, 2)).join(""),
		anchor: [150, 90],
	});
	c("oil_cap", "part", 128, 66, 8);
	L.push({
		role: "line",
		shape: "dipstick",
		d: "M186 128L198 86M198 86m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
		anchor: [198, 86],
	});
	c("thermostat", "part", 176, 56, 5);
	r("timing_belt", "part", 210, 52, 10, 74, 4);
	L.push({
		role: "line",
		shape: "accessory_belt",
		d: rectD(76, 52, 16, 82, 8),
		anchor: [84, 93],
	});
	c("alternator", "part", 84, 62, 9);
	c("ac_compressor", "part", 84, 124, 9);
	c("water_pump", "part", 86, 93, 6);
	r("air_filter", "part", 226, 48, 48, 38, 6);
	r("fusebox", "part", 24, 48, 44, 34, 5);
	r("battery", "part", 22, 100, 50, 42, 5);
	r("coolant_tank", "part", 230, 100, 40, 30, 8);
	c("power_steering_tank", "part", 246, 152, 9);
	r("brake_fluid", "part", 124, 154, 38, 22, 5);
	return L;
})();

const capo: ViewGeometry = {
	width: 300,
	height: 216,
	layers: capoLayers,
	arches: [],
};

const cache = new Map<string, ViewGeometry>();

export function anatomyGeometry(
	bodyType: BodyType,
	view: AnatomyView,
): ViewGeometry {
	if (view === "capo") return capo;
	const key = `${bodyType}:${view}`;
	let g = cache.get(key);
	if (!g) {
		g = view === "lateral" ? lateral(plans[bodyType]) : abajo(plans[bodyType]);
		cache.set(key, g);
	}
	return g;
}

/** Vistas donde aparece alguna de estas formas. */
export function viewsShowing(bodyType: BodyType, shapes: Shape[]) {
	return anatomyViews.filter((v) =>
		anatomyGeometry(bodyType, v).layers.some(
			(l) => l.shape && shapes.includes(l.shape),
		),
	);
}
