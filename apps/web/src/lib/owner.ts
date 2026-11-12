import type { components } from "@kilora/contracts";
import {
	keepPreviousData,
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { api, unwrap } from "./api";

type S = components["schemas"];

export const ownerVehiclesQuery = () =>
	queryOptions({
		queryKey: ["owner", "vehicles"],
		queryFn: async () => unwrap(await api.GET("/api/v1/me/vehicles")),
	});
export const ownerVehicleQuery = (vehicleID: string) =>
	queryOptions({
		queryKey: ["owner", "vehicle", vehicleID],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/me/vehicles/{vehicleID}", {
					params: { path: { vehicleID } },
				}),
			),
	});
export const OWNER_HISTORY_PAGE_SIZE = 10;
export const ownerHistoryQuery = (vehicleID: string, page = 1) =>
	queryOptions({
		queryKey: ["owner", "history", vehicleID, page],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/me/vehicles/{vehicleID}/history", {
					params: {
						path: { vehicleID },
						query: {
							limit: OWNER_HISTORY_PAGE_SIZE,
							offset: (page - 1) * OWNER_HISTORY_PAGE_SIZE,
						},
					},
				}),
			),
		placeholderData: keepPreviousData,
	});
/** Todo el historial (hasta el máximo de la API) para el mapa del vehículo. */
export const ownerPartsMapQuery = (vehicleID: string) =>
	queryOptions({
		queryKey: ["owner", "history", vehicleID, "map"],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/me/vehicles/{vehicleID}/history", {
					params: { path: { vehicleID }, query: { limit: 100, offset: 0 } },
				}),
			),
	});
export const invitationQuery = (token: string) =>
	queryOptions({
		queryKey: ["invitation", token],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/public/invitations/{token}", {
					params: { path: { token } },
				}),
			),
		retry: false,
	});
export const ownerReportQuery = (vehicleID: string) =>
	queryOptions({
		queryKey: ["owner", "report", vehicleID],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/me/vehicles/{vehicleID}/report", {
					params: { path: { vehicleID } },
				}),
			),
	});
export const ownerActions = {
	createReport: async (vehicleID: string) =>
		unwrap(
			await api.POST("/api/v1/me/vehicles/{vehicleID}/report", {
				params: { path: { vehicleID } },
			}),
		),
	revokeReport: async (vehicleID: string) =>
		unwrap(
			await api.DELETE("/api/v1/me/vehicles/{vehicleID}/report", {
				params: { path: { vehicleID } },
			}),
		),
	create: async (body: S["OwnerVehicleInput"]) =>
		unwrap(await api.POST("/api/v1/me/vehicles", { body })),
	manual: async (vehicleID: string, body: S["ManualHistoryInput"]) =>
		unwrap(
			await api.POST("/api/v1/me/vehicles/{vehicleID}/history", {
				params: { path: { vehicleID } },
				body,
			}),
		),
	correction: async (vehicleID: string, body: S["CorrectionInput"]) =>
		unwrap(
			await api.POST("/api/v1/me/vehicles/{vehicleID}/corrections", {
				params: { path: { vehicleID } },
				body,
			}),
		),
	odometer: async (vehicleID: string, km: number) =>
		unwrap(
			await api.POST("/api/v1/me/vehicles/{vehicleID}/odometer", {
				params: { path: { vehicleID } },
				body: { km },
			}),
		),
	bodyType: async (vehicleID: string, bodyType: S["BodyType"]) =>
		unwrap(
			await api.PUT("/api/v1/me/vehicles/{vehicleID}/body-type", {
				params: { path: { vehicleID } },
				body: { body_type: bodyType },
			}),
		),
	accept: async (token: string) =>
		unwrap(
			await api.POST("/api/v1/invitations/{token}/accept", {
				params: { path: { token } },
				body: { consent: true },
			}),
		),
};
export function useOwnerMutation<T, R>(fn: (input: T) => Promise<R>) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSuccess: () => qc.invalidateQueries({ queryKey: ["owner"] }),
	});
}
