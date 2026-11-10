import { formatPhoneNumberIntl } from "react-phone-number-input";
import { statusLabels } from "./domain";

export const TIME_ZONE = "America/El_Salvador";

export const todayISO = () =>
	new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());

export const quoteCode = (number: number) =>
	`COT-${String(number).padStart(4, "0")}`;

export const money = (value: number | string) =>
	new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(
		Number(value),
	);
export const date = (value: string) =>
	new Intl.DateTimeFormat("es-SV", {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: TIME_ZONE,
	}).format(new Date(value));
export const statusLabel = (status: keyof typeof statusLabels) =>
	statusLabels[status];
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
export const phone = (value: string | null | undefined) =>
	value ? formatPhoneNumberIntl(value) || value : "";
