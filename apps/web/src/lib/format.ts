export const money = (value: number | string) =>
	new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(
		Number(value),
	);
export const date = (value: string) =>
	new Intl.DateTimeFormat("es-SV", {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "America/El_Salvador",
	}).format(new Date(value));
const statusLabels: Record<string, string> = {
	recibido: "Recibido",
	diagnostico: "Diagnóstico",
	en_reparacion: "En reparación",
	listo: "Listo",
	cancelado: "Cancelado",
};
export const statusLabel = (status: string) => statusLabels[status] ?? status;
