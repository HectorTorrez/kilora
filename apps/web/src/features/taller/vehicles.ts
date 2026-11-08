import type { components } from "@kilora/contracts";
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";

type S = components["schemas"];

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
