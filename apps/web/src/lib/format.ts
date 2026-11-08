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
// Fechas sin hora (YYYY-MM-DD): se formatean en UTC para no correr el día.
export const day = (value: string) =>
	new Intl.DateTimeFormat("es-SV", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
export const km = (value: number | string | null | undefined) =>
	value === null || value === undefined || value === ""
		? "—"
		: `${new Intl.NumberFormat("es-SV").format(Number(value))} km`;
export const plural = (n: number, one: string, many: string) =>
	`${n} ${n === 1 ? one : many}`;
