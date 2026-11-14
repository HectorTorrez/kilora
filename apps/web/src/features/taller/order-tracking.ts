import type { components } from "@kilora/contracts";
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";

export const orderTrackingQuery = (workshopID: string, orderID: string) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "order-tracking", orderID],
		queryFn: async ({ signal }) =>
			unwrap(
				await api.GET(
					"/api/v1/workshops/{workshopID}/work-orders/{orderID}/tracking",
					{ params: { path: { workshopID, orderID } }, signal },
				),
			),
	});
export const trackingActions = (workshopID: string, orderID: string) => {
	const path = { workshopID, orderID };
	return {
		update: async (body: components["schemas"]["OrderTrackingInput"]) =>
			unwrap(
				await api.PUT(
					"/api/v1/workshops/{workshopID}/work-orders/{orderID}/tracking",
					{ params: { path }, body },
				),
			),
		share: async () =>
			unwrap(
				await api.POST(
					"/api/v1/workshops/{workshopID}/work-orders/{orderID}/tracking/share",
					{ params: { path } },
				),
			),
		revoke: async () =>
			unwrap(
				await api.DELETE(
					"/api/v1/workshops/{workshopID}/work-orders/{orderID}/tracking/share",
					{ params: { path } },
				),
			),
	};
};
