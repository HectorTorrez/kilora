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
