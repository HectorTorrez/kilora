import type { components } from "@kilora/contracts";
import { differenceInCalendarMonths } from "date-fns";
import { categoryLabels } from "@/lib/domain";

type HistoryRecord = components["schemas"]["HistoryRecord"];
type HistoryItem = components["schemas"]["HistoryItem"];

/** Cada categoría de pieza (menos "otro") es una zona del vehículo. */
export type Zone = Exclude<components["schemas"]["PartCategory"], "otro">;

/** Orden de las zonas: de adelante hacia atrás, como se recorre el carro. */
export const zones: Zone[] = [
	"aceite",
	"motor",
	"refrigeracion",
	"aire_acondicionado",
	"bateria",
	"electrico",
	"transmision",
	"direccion",
	"frenos",
	"amortiguadores",
	"llantas",
	"escape",
	"carroceria",
];

/** Zonas que se desgastan distinto en cada eje. */
export type AxleZone = "frenos" | "amortiguadores" | "llantas";
export type Axle = "front" | "rear";
export const axles: Axle[] = ["front", "rear"];
export const axleLabels: Record<Axle, string> = {
	front: "Delanteros",
	rear: "Traseros",
};
export const isAxleZone = (zone: Zone): zone is AxleZone =>
	zone === "frenos" || zone === "amortiguadores" || zone === "llantas";

/** Intervalos de referencia genéricos; sin intervalo no se calcula desgaste. */
export const zoneInfo: Record<
	Zone,
	{ label: string; area: string; km?: number; months?: number }
> = {
	aceite: {
		label: "Aceite",
		area: "Lubricación del motor",
		km: 5000,
		months: 6,
	},
	motor: {
		label: categoryLabels.motor,
		area: "Filtros, bujías y correas",
		km: 40000,
		months: 36,
	},
	refrigeracion: {
		label: categoryLabels.refrigeracion,
		area: "Radiador y refrigerante",
		km: 40000,
		months: 24,
	},
	aire_acondicionado: {
		label: categoryLabels.aire_acondicionado,
		area: "Compresor y condensador",
		months: 24,
	},
	bateria: {
		label: categoryLabels.bateria,
		area: "Compartimiento del motor",
		months: 36,
	},
	electrico: {
		label: categoryLabels.electrico,
		area: "Alternador, arranque y luces",
	},
	transmision: {
		label: categoryLabels.transmision,
		area: "Caja y ejes",
		km: 60000,
		months: 48,
	},
	direccion: {
		label: categoryLabels.direccion,
		area: "Cremallera y terminales",
	},
	frenos: {
		label: categoryLabels.frenos,
		area: "Discos, pastillas y mordazas",
		km: 30000,
		months: 24,
	},
	amortiguadores: {
		label: categoryLabels.amortiguadores,
		area: "Suspensión",
		km: 80000,
		months: 60,
	},
	llantas: {
		label: categoryLabels.llantas,
		area: "Neumáticos y alineación",
		km: 50000,
		months: 48,
	},
	escape: { label: categoryLabels.escape, area: "Catalizador y silenciador" },
	carroceria: {
		label: categoryLabels.carroceria,
		area: "Pintura, vidrios y espejos",
	},
};

// Los servicios que agrega el propietario no traen categoría: se infiere del texto.
const keywords: [Zone, RegExp][] = [
	["aceite", /aceite|lubric/],
	[
		"refrigeracion",
		/radiador|refrigerante|anticongelante|termostato|bomba de agua|enfriamiento/,
	],
	[
		"aire_acondicionado",
		/aire acondicionado|\ba\/?c\b|compresor|condensador|recarga de gas/,
	],
	["bateria", /bater[ií]a|acumulador/],
	[
		"electrico",
		/alternador|arranque|el[eé]ctric|luce?s?\b|faro|foco|bombillo|fusible|sensor/,
	],
	[
		"transmision",
		/transmisi|caja de|embrague|clutch|cloch|diferencial|card[aá]n|homocin|flecha|transfer|4x4|tracci[oó]n/,
	],
	["direccion", /direcci[oó]n|cremallera|terminal|r[oó]tula|timón|timon/],
	["frenos", /fren|pastilla|balata|zapata|disco|caliper|mordaza|tambor/],
	[
		"amortiguadores",
		/amortigu|suspensi|resorte|espiral|muelle|strut|buje|ballesta/,
	],
	["llantas", /llanta|neum[aá]tic|rotaci[oó]n|alineaci|balanceo|\brin(es)?\b/],
	["escape", /escape|silenciador|mofle|catalizador/],
	[
		"carroceria",
		/carrocer|pintura|enderez|parabrisas|vidrio|retrovisor|espejo|plumilla|limpiaparabrisas|parachoques|bumper|abolladura|palangana|batea|furg[oó]n|tolva/,
	],
];
// "Motor" es el comodín: solo si nada más específico coincide.
const motorKeywords =
	/motor|buj[ií]a|filtro de aire|correa|banda|distribuci|inyector|afinaci|culata|empaque/;

function zonesOfText(text: string): Zone[] {
	const t = text.toLowerCase();
	const found = keywords.filter(([, re]) => re.test(t)).map(([zone]) => zone);
	if (!found.length && motorKeywords.test(t)) found.push("motor");
	return found;
}

function zonesOfItem(item: HistoryItem): Zone[] {
	if (item.category && item.category !== "otro") return [item.category];
	return zonesOfText(itemText(item));
}

const itemText = (item: HistoryItem) =>
	`${item.description ?? ""} ${item.name ?? ""}`;

/** Eje al que se refiere un texto; sin indicación se asumen los dos. */
export function axlesOfText(text: string): Axle[] {
	const t = text.toLowerCase();
	const front = /delanter|frontal|adelante/.test(t);
	const rear = /traser|posterior|atr[aá]s/.test(t);
	if (front && !rear) return ["front"];
	if (rear && !front) return ["rear"];
	return ["front", "rear"];
}

export type ZoneEvent = {
	record: HistoryRecord;
	items: HistoryItem[];
	/** Solo en zonas de eje. */
	axles: Axle[];
};

export type ZoneStatus =
	| "sin-registro"
	| "registrado"
	| "al-dia"
	| "pronto"
	| "revisar";

type Freshness = {
	last?: ZoneEvent;
	kmSince?: number;
	monthsSince?: number;
	/** Fracción del intervalo de referencia consumida (1 = toca revisar). */
	wear?: number;
	status: ZoneStatus;
};

export type AxleSummary = Freshness & { events: ZoneEvent[] };

export type ZoneSummary = Freshness & {
	zone: Zone;
	events: ZoneEvent[];
	axles?: Record<Axle, AxleSummary>;
};

const severity: Record<ZoneStatus, number> = {
	"sin-registro": 0,
	registrado: 1,
	"al-dia": 2,
	pronto: 3,
	revisar: 4,
};

function freshness(
	events: ZoneEvent[],
	zone: Zone,
	currentKm: number | null | undefined,
	today: Date,
): Freshness {
	const last = events[0];
	if (!last) return { status: "sin-registro" };
	const info = zoneInfo[zone];
	const monthsSince = differenceInCalendarMonths(
		today,
		new Date(`${last.record.performed_on.slice(0, 10)}T12:00:00Z`),
	);
	const kmSince =
		currentKm != null && last.record.odometer_km != null
			? Math.max(0, currentKm - last.record.odometer_km)
			: undefined;
	const ratios = [
		info.months ? monthsSince / info.months : undefined,
		info.km && kmSince != null ? kmSince / info.km : undefined,
	].filter((r): r is number => r !== undefined);
	const wear = ratios.length ? Math.max(...ratios) : undefined;
	const status: ZoneStatus =
		wear === undefined
			? "registrado"
			: wear >= 1
				? "revisar"
				: wear >= 0.8
					? "pronto"
					: "al-dia";
	return { last, kmSince, monthsSince, wear, status };
}

export function summarizeZones(
	records: HistoryRecord[],
	currentKm: number | null | undefined,
	today = new Date(),
): Record<Zone, ZoneSummary> {
	const sorted = [...records].sort((a, b) =>
		b.performed_on.localeCompare(a.performed_on),
	);
	const events = Object.fromEntries(
		zones.map((z) => [z, [] as ZoneEvent[]]),
	) as Record<Zone, ZoneEvent[]>;
	for (const record of sorted) {
		const byZone = new Map<Zone, HistoryItem[]>();
		for (const item of record.items) {
			for (const z of zonesOfItem(item)) {
				byZone.set(z, [...(byZone.get(z) ?? []), item]);
			}
		}
		if (byZone.size === 0) {
			for (const z of zonesOfText(record.summary)) byZone.set(z, []);
		}
		for (const [z, items] of byZone) {
			const text = items.length
				? items.map(itemText).join(" ")
				: record.summary;
			// Si los ítems no dicen el eje, el título del servicio puede decirlo.
			let found = axlesOfText(text);
			if (found.length === 2) found = axlesOfText(record.summary);
			events[z].push({
				record,
				items,
				axles: isAxleZone(z) ? found : [],
			});
		}
	}
	return Object.fromEntries(
		zones.map((zone): [Zone, ZoneSummary] => {
			const list = events[zone];
			const overall = freshness(list, zone, currentKm, today);
			if (!isAxleZone(zone)) return [zone, { zone, events: list, ...overall }];
			const perAxle = Object.fromEntries(
				axles.map((axle) => {
					const own = list.filter((e) => e.axles.includes(axle));
					return [
						axle,
						{ events: own, ...freshness(own, zone, currentKm, today) },
					];
				}),
			) as Record<Axle, AxleSummary>;
			// La zona toma el estado del eje más urgente.
			const worst = axles
				.map((a) => perAxle[a].status)
				.reduce((a, b) => (severity[b] > severity[a] ? b : a));
			return [
				zone,
				{ zone, events: list, ...overall, status: worst, axles: perAxle },
			];
		}),
	) as Record<Zone, ZoneSummary>;
}

/** Estado de un eje concreto, o el de la zona si no es una zona de eje. */
export function statusOf(summary: ZoneSummary, axle?: Axle): ZoneStatus {
	return axle && summary.axles ? summary.axles[axle].status : summary.status;
}

export const statusLabels: Record<ZoneStatus, string> = {
	"sin-registro": "Sin registro",
	registrado: "Con servicio",
	"al-dia": "Al día",
	pronto: "Revisar pronto",
	revisar: "Toca revisar",
};

// La vista 3D siempre es oscura, en tema claro y oscuro.
export const statusColor: Record<ZoneStatus, string> = {
	"sin-registro": "#64748b",
	registrado: "#7dd3fc",
	"al-dia": "#5eead4",
	pronto: "#fbbf24",
	revisar: "#fb7185",
};

export type Health = {
	/** 0–100; null si ninguna zona con intervalo tiene servicios. */
	score: number | null;
	revisar: number;
	pronto: number;
	sinRegistro: number;
};

const healthPoints: Partial<Record<ZoneStatus, number>> = {
	"al-dia": 100,
	pronto: 60,
	revisar: 20,
};

/** Salud general: promedio de las zonas con intervalo de referencia. */
export function healthOf(summary: Record<Zone, ZoneSummary>): Health {
	const statuses = zones.map((z) => summary[z].status);
	const scored = statuses
		.map((s) => healthPoints[s])
		.filter((p): p is number => p !== undefined);
	return {
		score: scored.length
			? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
			: null,
		revisar: statuses.filter((s) => s === "revisar").length,
		pronto: statuses.filter((s) => s === "pronto").length,
		sinRegistro: statuses.filter((s) => s === "sin-registro").length,
	};
}

export const healthColor = (score: number | null) =>
	score === null
		? statusColor.registrado
		: score >= 80
			? statusColor["al-dia"]
			: score >= 50
				? statusColor.pronto
				: statusColor.revisar;

/** Zonas que tocó un servicio (para la línea de tiempo). */
export function recordZones(record: HistoryRecord): Zone[] {
	const found = new Set(record.items.flatMap(zonesOfItem));
	if (!found.size) for (const z of zonesOfText(record.summary)) found.add(z);
	return zones.filter((z) => found.has(z));
}
