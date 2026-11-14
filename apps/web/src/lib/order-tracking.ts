import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";
import { TIME_ZONE } from "./format";

export const publicOrderTrackingQuery = (token: string) =>
	queryOptions({
		queryKey: ["public-order-tracking", token],
		queryFn: async ({ signal }) =>
			unwrap(
				await api.GET("/api/v1/public/order-tracking/{token}", {
					params: { path: { token } },
					signal,
				}),
			),
		retry: false,
		staleTime: 15000,
		refetchInterval: 30000,
		refetchIntervalInBackground: false,
	});
const timestampFormatter = new Intl.DateTimeFormat("es-SV", {
	timeZone: TIME_ZONE,
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});
export const trackingDate = (value: string) =>
	timestampFormatter.format(new Date(value));
const inputFormatter = new Intl.DateTimeFormat("sv-SE", {
	timeZone: TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});
export function trackingDateInput(value: string | null) {
	if (!value) return "";
	const parts = inputFormatter.formatToParts(new Date(value));
	const part = (name: Intl.DateTimeFormatPartTypes) =>
		parts.find((p) => p.type === name)?.value ?? "";
	return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export const trackingInputDate = (value: string) => new Date(`${value}-06:00`);
