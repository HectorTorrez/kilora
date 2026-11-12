import type { components } from "@kilora/contracts";

type S = components["schemas"];

export const statusLabels: Record<S["WorkOrderStatus"], string> = {
	recibido: "Recibido",
	diagnostico: "Diagnóstico",
	en_reparacion: "En reparación",
	listo: "Listo",
	cancelado: "Cancelado",
};

export const isOpenOrder = (status: S["WorkOrderStatus"]) =>
	status !== "listo" && status !== "cancelado";

export const categoryLabels: Record<S["PartCategory"], string> = {
	aceite: "Aceite",
	frenos: "Frenos",
	amortiguadores: "Amortiguadores",
	bateria: "Batería",
	llantas: "Llantas",
	motor: "Motor",
	transmision: "Transmisión",
	refrigeracion: "Refrigeración",
	electrico: "Sistema eléctrico",
	aire_acondicionado: "Aire acondicionado",
	direccion: "Dirección",
	escape: "Escape",
	carroceria: "Carrocería",
	otro: "Otro",
};

/** Las categorías que la hoja del mecánico resume por último cambio. */
export const trackedCategories: S["PartCategory"][] = [
	"aceite",
	"frenos",
	"amortiguadores",
	"bateria",
	"llantas",
];

export const quoteOutcomeLabels: Record<S["CounterQuote"]["outcome"], string> =
	{
		pendiente: "Pendiente",
		acepto: "Aceptó",
		rechazo: "Rechazó",
		no_respondio: "No respondió",
	};

export const quoteOutcomeActions = (
	["acepto", "rechazo", "no_respondio"] as const
).map((value) => [value, quoteOutcomeLabels[value]] as const);

export const bodyTypeLabels: Record<S["BodyType"], string> = {
	sedan: "Sedán",
	hatchback: "Hatchback",
	suv: "SUV / Camioneta",
	pickup: "Pickup",
	van: "Microbús / Van",
	camion: "Camión",
};
