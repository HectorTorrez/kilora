import type { components } from "@kilora/contracts";
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";

type S = components["schemas"];

export const ordersQuery = (
	workshopID: string,
	status?: S["WorkOrderStatus"],
	branch_id?: string,
) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "orders", status, branch_id],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/work-orders", {
					params: { path: { workshopID }, query: { status, branch_id } },
				}),
			),
	});
export const orderQuery = (workshopID: string, orderID: string) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "order", orderID],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/work-orders/{orderID}", {
					params: { path: { workshopID, orderID } },
				}),
			),
	});
export const createOrderAction =
	(workshopID: string) => async (body: S["CreateWorkOrder"]) =>
		unwrap(
			await api.POST("/api/v1/workshops/{workshopID}/work-orders", {
				params: { path: { workshopID } },
				body,
			}),
		);
export const orderActions = (workshopID: string, orderID: string) => {
	const path = { workshopID, orderID };
	return {
		edit: async (body: S["EditWorkOrder"]) =>
			unwrap(
				await api.PATCH(
					"/api/v1/workshops/{workshopID}/work-orders/{orderID}",
					{ params: { path }, body },
				),
			),
		status: async (body: S["ChangeStatus"]) =>
			unwrap(
				await api.PATCH(
					"/api/v1/workshops/{workshopID}/work-orders/{orderID}/status",
					{ params: { path }, body },
				),
			),
		job: async (body: S["CreateJob"]) =>
			unwrap(
				await api.POST(
					"/api/v1/workshops/{workshopID}/work-orders/{orderID}/jobs",
					{ params: { path }, body },
				),
			),
		deleteJob: async (jobID: string) =>
			unwrap(
				await api.DELETE(
					"/api/v1/workshops/{workshopID}/work-orders/{orderID}/jobs/{jobID}",
					{ params: { path: { ...path, jobID } } },
				),
			),
		part: async ({ jobID, body }: { jobID: string; body: S["CreatePart"] }) =>
			unwrap(
				await api.POST(
					"/api/v1/workshops/{workshopID}/work-orders/{orderID}/jobs/{jobID}/parts",
					{ params: { path: { ...path, jobID } }, body },
				),
			),
		deletePart: async ({ jobID, partID }: { jobID: string; partID: string }) =>
			unwrap(
				await api.DELETE(
					"/api/v1/workshops/{workshopID}/work-orders/{orderID}/jobs/{jobID}/parts/{partID}",
					{ params: { path: { ...path, jobID, partID } } },
				),
			),
		quote: async (body: S["QuoteInput"]) =>
			unwrap(
				await api.PUT(
					"/api/v1/workshops/{workshopID}/work-orders/{orderID}/quote",
					{ params: { path }, body },
				),
			),
		share: async () =>
			unwrap(
				await api.POST(
					"/api/v1/workshops/{workshopID}/work-orders/{orderID}/quote/share",
					{ params: { path } },
				),
			),
		outcome: async (body: S["QuoteOutcomeInput"]) =>
			unwrap(
				await api.PATCH(
					"/api/v1/workshops/{workshopID}/work-orders/{orderID}/quote/outcome",
					{ params: { path }, body },
				),
			),
	};
};
