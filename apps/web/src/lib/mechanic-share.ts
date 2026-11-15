import type { components } from "@kilora/contracts";
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "./api";

export const mechanicShareQuery = (vehicleID: string) =>
	queryOptions({
		queryKey: ["owner", "mechanic-share", vehicleID],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/me/vehicles/{vehicleID}/mechanic-share", {
					params: { path: { vehicleID } },
				}),
			),
	});

export const mechanicShareActions = {
	create: async (
		vehicleID: string,
		body: components["schemas"]["MechanicShareInput"],
	) =>
		unwrap(
			await api.POST("/api/v1/me/vehicles/{vehicleID}/mechanic-share", {
				params: { path: { vehicleID } },
				body,
			}),
		),
	revoke: async (vehicleID: string) =>
		unwrap(
			await api.DELETE("/api/v1/me/vehicles/{vehicleID}/mechanic-share", {
				params: { path: { vehicleID } },
			}),
		),
};

export const publicMechanicShareQuery = (token: string) =>
	queryOptions({
		queryKey: ["public-mechanic-share", token],
		queryFn: async ({ signal }) =>
			unwrap(
				await api.GET("/api/v1/public/mechanic-shares/{token}", {
					params: { path: { token } },
					signal,
				}),
			),
		retry: false,
		staleTime: 0,
		refetchInterval: 60000,
		refetchIntervalInBackground: false,
	});
