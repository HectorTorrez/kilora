import type { components } from "@kilora/contracts";
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";

type S = components["schemas"];

export const vehicleRecommendationsQuery = (
	workshopID: string,
	vehicleID: string,
) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "recommendations", "vehicle", vehicleID],
		queryFn: async () =>
			unwrap(
				await api.GET(
					"/api/v1/workshops/{workshopID}/vehicles/{vehicleID}/recommendations",
					{ params: { path: { workshopID, vehicleID } } },
				),
			),
	});
export const recommendationsQuery = (
	workshopID: string,
	status?: S["RecommendationStatus"],
) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "recommendations", "all", status],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/recommendations", {
					params: { path: { workshopID }, query: { status } },
				}),
			),
	});
export const recommendationActions = (workshopID: string) => ({
	recommend: async ({
		vehicleID,
		body,
	}: {
		vehicleID: string;
		body: S["RecommendationInput"];
	}) =>
		unwrap(
			await api.POST(
				"/api/v1/workshops/{workshopID}/vehicles/{vehicleID}/recommendations",
				{ params: { path: { workshopID, vehicleID } }, body },
			),
		),
	resolve: async ({
		id,
		status,
	}: {
		id: string;
		status: S["RecommendationResolve"]["status"];
	}) =>
		unwrap(
			await api.PATCH(
				"/api/v1/workshops/{workshopID}/recommendations/{recommendationID}",
				{
					params: { path: { workshopID, recommendationID: id } },
					body: { status },
				},
			),
		),
});
