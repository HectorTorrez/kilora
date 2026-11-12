import type { components } from "@kilora/contracts";
import type { Axle, Zone } from "@/lib/parts-map";

/*
 * Planos paramétricos de cada tipo de carrocería, en metros. Solo datos: la
 * escena 3D los convierte en geometría y el panel los usa para describir
 * piezas que dependen del tipo (ballestas, tambores, cardán…).
 * Ejes: X = largo (adelante es +X), Y = alto, Z = ancho (+Z es el lado derecho).
 */

export type BodyType = components["schemas"]["BodyType"];
export type Vec3 = [number, number, number];
/** Sección transversal de la carrocería: [x, abajo, arriba, medio ancho]. */
export type Station = [number, number, number, number];

export type VehiclePlan = {
	length: number;
	lower: Station[];
	cabin: Station[];
	/** Exponente de la superelipse: más alto = más cuadrado. */
	lowerRound: number;
	cabinRound: number;
	/** Palangana abierta (pickup). */
	bed?: { x0: number; x1: number; floor: number; top: number; w: number };
	/** Furgón cerrado (camión). */
	cargo?: { x0: number; x1: number; bottom: number; top: number; w: number };
	/** Largueros del chasis visibles (vehículos de chasis). */
	frame?: { x0: number; x1: number; y: number; z: number };
	wheels: {
		front: number;
		rear: number;
		r: number;
		width: number;
		track: number;
		dualRear?: boolean;
	};
	engine: { x: number; y: number; l: number; h: number; w: number };
	radiatorX: number;
	battery: Vec3;
	drive: "fwd" | "rwd" | "4x4";
	rearBrake: "disco" | "tambor";
	rearSpring: "espiral" | "ballesta";
	/** Centro del timón. */
	dash: { x: number; y: number };
	lights: {
		fx: number;
		fy: number;
		fz: number;
		rx: number;
		ry: number;
		rz: number;
	};
	mirror: Vec3;
	floorY: number;
	muffler: number;
	tailX: number;
	camera: { home: Vec3; target: Vec3 };
};

const sedan: VehiclePlan = {
	length: 4.65,
	lowerRound: 4,
	cabinRound: 3,
	lower: [
		[-2.32, 0.42, 0.6, 0.5],
		[-2.26, 0.32, 0.84, 0.8],
		[-1.9, 0.28, 0.96, 0.87],
		[-1.2, 0.26, 0.99, 0.9],
		[0.5, 0.26, 0.99, 0.9],
		[1.3, 0.27, 0.92, 0.89],
		[1.95, 0.29, 0.8, 0.85],
		[2.25, 0.33, 0.68, 0.76],
		[2.33, 0.42, 0.58, 0.5],
	],
	cabin: [
		[-1.66, 0.9, 0.94, 0.74],
		[-1.3, 0.9, 1.22, 0.74],
		[-0.8, 0.9, 1.4, 0.72],
		[0.2, 0.9, 1.44, 0.72],
		[0.65, 0.9, 1.36, 0.73],
		[1.0, 0.9, 1.12, 0.76],
		[1.28, 0.9, 0.93, 0.78],
	],
	wheels: { front: 1.38, rear: -1.32, r: 0.32, width: 0.22, track: 0.76 },
	engine: { x: 1.76, y: 0.58, l: 0.5, h: 0.34, w: 0.62 },
	radiatorX: 2.14,
	battery: [1.98, 0.74, 0.56],
	drive: "fwd",
	rearBrake: "disco",
	rearSpring: "espiral",
	dash: { x: 0.78, y: 1.0 },
	lights: { fx: 2.2, fy: 0.72, fz: 0.6, rx: -2.27, ry: 0.8, rz: 0.62 },
	mirror: [1.02, 1.0, 0.93],
	floorY: 0.2,
	muffler: -1.85,
	tailX: -2.36,
	camera: { home: [4.4, 2.1, 4.9], target: [0.1, 0.6, 0] },
};

const hatchback: VehiclePlan = {
	...sedan,
	length: 4.15,
	lower: [
		[-2.05, 0.4, 0.62, 0.5],
		[-1.98, 0.3, 0.92, 0.8],
		[-1.6, 0.27, 0.98, 0.86],
		[0.4, 0.26, 0.98, 0.88],
		[1.2, 0.27, 0.9, 0.87],
		[1.8, 0.29, 0.78, 0.82],
		[2.05, 0.34, 0.66, 0.72],
		[2.12, 0.42, 0.57, 0.5],
	],
	cabin: [
		[-2.0, 0.9, 0.95, 0.76],
		[-1.92, 0.9, 1.3, 0.74],
		[-1.6, 0.9, 1.43, 0.72],
		[0.1, 0.9, 1.46, 0.72],
		[0.55, 0.9, 1.36, 0.73],
		[0.95, 0.9, 1.1, 0.76],
		[1.16, 0.9, 0.93, 0.78],
	],
	wheels: { front: 1.25, rear: -1.22, r: 0.3, width: 0.2, track: 0.74 },
	engine: { x: 1.62, y: 0.56, l: 0.46, h: 0.32, w: 0.6 },
	radiatorX: 1.96,
	battery: [1.82, 0.72, 0.54],
	rearBrake: "tambor",
	dash: { x: 0.66, y: 1.0 },
	lights: { fx: 1.99, fy: 0.72, fz: 0.58, rx: -2.0, ry: 0.98, rz: 0.62 },
	mirror: [0.92, 1.0, 0.91],
	muffler: -1.6,
	tailX: -2.08,
	camera: { home: [4.0, 2.0, 4.5], target: [0, 0.6, 0] },
};

const suv: VehiclePlan = {
	length: 4.8,
	lowerRound: 5,
	cabinRound: 4,
	lower: [
		[-2.38, 0.48, 0.78, 0.55],
		[-2.32, 0.4, 1.08, 0.86],
		[-1.9, 0.38, 1.12, 0.93],
		[0.6, 0.38, 1.12, 0.95],
		[1.4, 0.39, 1.06, 0.94],
		[2.05, 0.41, 0.96, 0.9],
		[2.32, 0.45, 0.84, 0.82],
		[2.4, 0.52, 0.72, 0.6],
	],
	cabin: [
		[-2.3, 1.04, 1.1, 0.84],
		[-2.24, 1.04, 1.62, 0.82],
		[-1.8, 1.04, 1.74, 0.8],
		[0.3, 1.04, 1.76, 0.8],
		[0.75, 1.04, 1.66, 0.81],
		[1.25, 1.04, 1.24, 0.85],
		[1.46, 1.04, 1.08, 0.87],
	],
	wheels: { front: 1.42, rear: -1.38, r: 0.37, width: 0.26, track: 0.82 },
	engine: { x: 1.82, y: 0.74, l: 0.54, h: 0.38, w: 0.66 },
	radiatorX: 2.24,
	battery: [2.02, 0.94, 0.62],
	drive: "4x4",
	rearBrake: "disco",
	rearSpring: "espiral",
	dash: { x: 0.92, y: 1.2 },
	lights: { fx: 2.3, fy: 0.92, fz: 0.66, rx: -2.33, ry: 1.0, rz: 0.7 },
	mirror: [1.28, 1.22, 1.0],
	floorY: 0.3,
	muffler: -1.95,
	tailX: -2.4,
	camera: { home: [5.0, 2.5, 5.5], target: [0, 0.85, 0] },
};

const pickup: VehiclePlan = {
	length: 5.4,
	lowerRound: 5,
	cabinRound: 4,
	lower: [
		[-0.78, 0.6, 0.95, 0.7],
		[-0.72, 0.44, 1.12, 0.93],
		[0.6, 0.44, 1.12, 0.95],
		[1.6, 0.45, 1.1, 0.94],
		[2.3, 0.47, 1.0, 0.9],
		[2.6, 0.5, 0.88, 0.82],
		[2.68, 0.58, 0.76, 0.6],
	],
	cabin: [
		[-0.74, 1.08, 1.12, 0.86],
		[-0.7, 1.08, 1.78, 0.84],
		[0.4, 1.08, 1.82, 0.82],
		[0.85, 1.08, 1.7, 0.83],
		[1.35, 1.08, 1.25, 0.87],
		[1.56, 1.08, 1.1, 0.88],
	],
	bed: { x0: -2.74, x1: -0.84, floor: 0.82, top: 1.22, w: 0.9 },
	frame: { x0: -2.6, x1: 2.4, y: 0.58, z: 0.46 },
	wheels: { front: 1.75, rear: -1.6, r: 0.38, width: 0.26, track: 0.82 },
	engine: { x: 2.08, y: 0.82, l: 0.56, h: 0.4, w: 0.66 },
	radiatorX: 2.52,
	battery: [2.3, 1.02, 0.62],
	drive: "4x4",
	rearBrake: "tambor",
	rearSpring: "ballesta",
	dash: { x: 1.05, y: 1.24 },
	lights: { fx: 2.6, fy: 0.94, fz: 0.66, rx: -2.76, ry: 1.02, rz: 0.84 },
	mirror: [1.42, 1.28, 1.0],
	floorY: 0.36,
	muffler: -2.1,
	tailX: -2.62,
	camera: { home: [6.0, 2.8, 6.3], target: [-0.1, 0.9, 0] },
};

const van: VehiclePlan = {
	length: 5.0,
	lowerRound: 6,
	cabinRound: 6,
	lower: [
		[-2.47, 0.42, 0.7, 0.6],
		[-2.42, 0.34, 1.05, 0.9],
		[-1.9, 0.32, 1.08, 0.95],
		[1.5, 0.33, 1.06, 0.95],
		[2.15, 0.36, 0.98, 0.92],
		[2.42, 0.42, 0.85, 0.84],
		[2.5, 0.5, 0.72, 0.62],
	],
	cabin: [
		[-2.44, 1.0, 1.05, 0.9],
		[-2.4, 1.0, 2.0, 0.9],
		[-1.9, 1.0, 2.08, 0.88],
		[1.0, 1.0, 2.08, 0.88],
		[1.6, 1.0, 1.86, 0.89],
		[2.05, 1.0, 1.3, 0.9],
		[2.26, 1.0, 1.05, 0.9],
	],
	frame: { x0: -2.3, x1: 2.2, y: 0.42, z: 0.46 },
	wheels: { front: 1.58, rear: -1.48, r: 0.34, width: 0.24, track: 0.8 },
	engine: { x: 1.95, y: 0.64, l: 0.5, h: 0.36, w: 0.62 },
	radiatorX: 2.36,
	battery: [2.15, 0.86, 0.62],
	drive: "rwd",
	rearBrake: "tambor",
	rearSpring: "ballesta",
	dash: { x: 1.62, y: 1.28 },
	lights: { fx: 2.44, fy: 0.86, fz: 0.68, rx: -2.45, ry: 1.08, rz: 0.8 },
	mirror: [2.02, 1.32, 1.0],
	floorY: 0.24,
	muffler: -1.95,
	tailX: -2.5,
	camera: { home: [5.6, 2.9, 6.0], target: [0, 1.0, 0] },
};

const camion: VehiclePlan = {
	length: 6.6,
	lowerRound: 6,
	cabinRound: 6,
	lower: [
		[1.56, 0.86, 1.5, 0.9],
		[1.62, 0.7, 1.62, 1.05],
		[2.85, 0.7, 1.62, 1.08],
		[3.02, 0.76, 1.46, 1.0],
		[3.08, 0.86, 1.3, 0.8],
	],
	cabin: [
		[1.62, 1.56, 1.62, 1.0],
		[1.67, 1.56, 2.55, 1.0],
		[2.6, 1.56, 2.58, 1.0],
		[2.95, 1.56, 2.35, 1.02],
		[3.05, 1.56, 1.76, 1.02],
	],
	cargo: { x0: -3.45, x1: 1.45, bottom: 1.06, top: 2.9, w: 1.18 },
	frame: { x0: -3.35, x1: 3.0, y: 0.86, z: 0.46 },
	wheels: {
		front: 2.38,
		rear: -1.8,
		r: 0.5,
		width: 0.28,
		track: 0.95,
		dualRear: true,
	},
	engine: { x: 2.36, y: 1.12, l: 0.72, h: 0.5, w: 0.7 },
	radiatorX: 2.98,
	battery: [0.6, 0.78, 0.82],
	drive: "rwd",
	rearBrake: "tambor",
	rearSpring: "ballesta",
	dash: { x: 2.72, y: 1.8 },
	lights: { fx: 3.06, fy: 1.0, fz: 0.82, rx: -3.42, ry: 1.0, rz: 0.98 },
	mirror: [2.98, 2.1, 1.22],
	floorY: 0.62,
	muffler: 0.4,
	tailX: -0.5,
	camera: { home: [8.2, 3.9, 8.6], target: [-0.2, 1.3, 0] },
};

export const plans: Record<BodyType, VehiclePlan> = {
	sedan,
	hatchback,
	suv,
	pickup,
	van,
	camion,
};

/** Medio ancho de la carrocería baja en una posición X (interpolado). */
export function widthAt(plan: VehiclePlan, x: number) {
	const s = plan.lower;
	if (x <= s[0][0]) return s[0][3];
	for (let i = 1; i < s.length; i++) {
		if (x <= s[i][0]) {
			const t = (x - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
			return s[i - 1][3] + (s[i][3] - s[i - 1][3]) * t;
		}
	}
	return s[s.length - 1][3];
}

/** Descripción de la zona según las piezas que tiene este tipo de vehículo. */
export function zoneArea(zone: Zone, plan: VehiclePlan, fallback: string) {
	switch (zone) {
		case "frenos":
			return plan.rearBrake === "tambor"
				? "Discos adelante, tambores atrás"
				: "Discos, pastillas y mordazas";
		case "amortiguadores":
			return plan.rearSpring === "ballesta"
				? "Espirales adelante, ballestas atrás"
				: "Amortiguadores y espirales";
		case "transmision":
			return plan.drive === "fwd"
				? "Caja y flechas delanteras"
				: plan.drive === "4x4"
					? "Caja, transfer, cardanes y diferenciales"
					: "Caja, cardán y diferencial";
		case "llantas":
			return plan.wheels.dualRear ? "Neumáticos, duales atrás" : fallback;
		case "carroceria":
			return plan.bed
				? "Cabina, palangana y vidrios"
				: plan.cargo
					? "Cabina, furgón y vidrios"
					: fallback;
		default:
			return fallback;
	}
}

export type PinView = { anchor: Vec3; dir: Vec3; dist: number };
export type PinId = Zone | `${"frenos" | "amortiguadores" | "llantas"}:${Axle}`;

/** Dónde va cada pin y desde dónde lo mira la cámara al enfocarlo. */
export function pinViews(plan: VehiclePlan): Record<PinId, PinView> {
	const { engine: e, wheels: w, length: L } = plan;
	const roofTop = Math.max(
		...plan.cabin.map((s) => s[2]),
		plan.cargo?.top ?? 0,
	);
	const roofX =
		plan.cabin.reduce((sum, s) => sum + s[0], 0) / plan.cabin.length;
	const side = w.track + w.width / 2 + 0.08;
	const gearbox =
		plan.drive === "fwd"
			? [e.x - 0.1, e.y - 0.1, 0.5]
			: [e.x - e.l / 2 - 0.3, e.y - 0.08, 0];
	return {
		aceite: {
			anchor: [e.x, e.y - e.h / 2 - 0.08, 0],
			dir: [0.9, 0.25, 1],
			dist: L * 0.5,
		},
		motor: {
			anchor: [e.x, e.y + e.h / 2 + 0.16, 0],
			dir: [0.6, 1, 0.8],
			dist: L * 0.55,
		},
		refrigeracion: {
			anchor: [plan.radiatorX, e.y + 0.26, 0.3],
			dir: [1, 0.45, 0.6],
			dist: L * 0.5,
		},
		aire_acondicionado: {
			anchor: [plan.radiatorX + 0.08, e.y - 0.2, -0.45],
			dir: [1, 0.3, -0.7],
			dist: L * 0.52,
		},
		bateria: {
			anchor: [plan.battery[0], plan.battery[1] + 0.16, plan.battery[2]],
			dir: [0.5, 0.8, 1],
			dist: L * 0.45,
		},
		electrico: {
			anchor: [plan.lights.fx, plan.lights.fy, -plan.lights.fz],
			dir: [1, 0.35, -0.8],
			dist: L * 0.6,
		},
		transmision: {
			anchor: gearbox as Vec3,
			dir: [0.25, 0.5, 1],
			dist: L * 0.6,
		},
		direccion: {
			anchor: [plan.dash.x, plan.dash.y + 0.14, -0.38],
			dir: [-0.2, 0.9, -1],
			dist: L * 0.55,
		},
		"frenos:front": {
			anchor: [w.front, w.r, side],
			dir: [0.3, 0.2, 1],
			dist: L * 0.4,
		},
		"frenos:rear": {
			anchor: [w.rear, w.r, side],
			dir: [-0.3, 0.2, 1],
			dist: L * 0.4,
		},
		"amortiguadores:front": {
			anchor: [w.front, w.r * 2.3, w.track - 0.1],
			dir: [0.4, 0.3, 1],
			dist: L * 0.45,
		},
		"amortiguadores:rear": {
			anchor: [w.rear, w.r * 1.8, w.track - 0.1],
			dir: [-0.4, 0.3, 1],
			dist: L * 0.45,
		},
		"llantas:front": {
			anchor: [w.front + w.r * 0.7, w.r * 0.35, side],
			dir: [0.6, 0.2, 1],
			dist: L * 0.45,
		},
		"llantas:rear": {
			anchor: [w.rear - w.r * 0.7, w.r * 0.35, side],
			dir: [-0.6, 0.2, 1],
			dist: L * 0.45,
		},
		escape: {
			anchor: [plan.muffler, plan.floorY, -0.4],
			dir: [-1, 0.25, -0.6],
			dist: L * 0.5,
		},
		carroceria: {
			anchor: [roofX, roofTop + 0.14, 0],
			dir: [0.5, 0.7, 1],
			dist: L * 1.2,
		},
		// Las zonas de eje se miran de lado, con ambos ejes a la vista.
		frenos: {
			anchor: [(w.front + w.rear) / 2, w.r, side],
			dir: [0, 0.25, 1],
			dist: L * 1.3,
		},
		amortiguadores: {
			anchor: [(w.front + w.rear) / 2, w.r * 1.8, side],
			dir: [0, 0.3, 1],
			dist: L * 1.3,
		},
		llantas: {
			anchor: [(w.front + w.rear) / 2, w.r, side],
			dir: [0, 0.2, 1],
			dist: L * 1.3,
		},
	};
}
