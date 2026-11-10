import type { components } from "@kilora/contracts";
import { queryOptions } from "@tanstack/react-query";
import type { DateRange } from "@/components/kilora/date-range-filter";
import { api, unwrap } from "@/lib/api";
import { LIST_PAGE_SIZE } from "@/lib/pagination";

type S = components["schemas"];

export function matchesVehicle(vehicle: S["Vehicle"], query: string) {
	const normalize = (value: string) =>
		value.toLowerCase().replace(/[\s-]/g, "");
	return normalize(
		[
			vehicle.plate,
			vehicle.make,
			vehicle.model,
			vehicle.contact_name,
			vehicle.contact_phone,
			vehicle.vin,
		]
			.filter(Boolean)
			.join(" "),
	).includes(normalize(query.trim()));
}

export const vehiclesQuery = (workshopID: string) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "vehicles"],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/vehicles", {
					params: { path: { workshopID } },
				}),
			),
	});
export const vehicleQuery = (workshopID: string, vehicleID: string) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "vehicle", vehicleID],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/vehicles/{vehicleID}", {
					params: { path: { workshopID, vehicleID } },
				}),
			),
	});
export const historyQuery = (workshopID: string, vehicleID: string) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "history", vehicleID],
		queryFn: async () =>
			unwrap(
				await api.GET(
					"/api/v1/workshops/{workshopID}/vehicles/{vehicleID}/history",
					{ params: { path: { workshopID, vehicleID } } },
				),
			),
	});
export const invitationsQuery = (workshopID: string, vehicleID: string) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "invitations", vehicleID],
		queryFn: async () =>
			unwrap(
				await api.GET(
					"/api/v1/workshops/{workshopID}/vehicles/{vehicleID}/invitations",
					{ params: { path: { workshopID, vehicleID } } },
				),
			),
	});
export const createVehicleAction =
	(workshopID: string) => async (body: S["CreateVehicle"]) =>
		unwrap(
			await api.POST("/api/v1/workshops/{workshopID}/vehicles", {
				params: { path: { workshopID } },
				body,
			}),
		);
export const inviteOwnerAction =
	(workshopID: string, vehicleID: string) => async (email: string) =>
		unwrap(
			await api.POST(
				"/api/v1/workshops/{workshopID}/vehicles/{vehicleID}/invitations",
				{ params: { path: { workshopID, vehicleID } }, body: { email } },
			),
		);

export const vehiclesPageQuery = (
	workshopID: string,
	q = "",
	statuses: Exclude<S["VehicleStatus"], "archivado">[] = [],
	offset = 0,
	range: DateRange = {},
) =>
	queryOptions({
		queryKey: [
			"workshop",
			workshopID,
			"vehicles",
			"page",
			q,
			statuses,
			offset,
			range,
		],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/vehicles/page", {
					params: {
						path: { workshopID },
						query: {
							q: q || undefined,
							status: statuses.length ? statuses : undefined,
							limit: LIST_PAGE_SIZE,
							offset,
							from: range.from,
							to: range.to,
						},
					},
				}),
			),
	});
