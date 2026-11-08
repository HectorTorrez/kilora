import type { components } from "@kilora/contracts";
import {
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiError } from "./api";
import { get } from "./owner";

type S = components["schemas"];
const unwrap = <T>(result: { data?: T; error?: { error: string } }) => {
	if (result.error) throw apiError(result.error);
	return result.data as T;
};
export const vehiclesQuery = (workshopID: string, plate = "") =>
	queryOptions({
		queryKey: ["workshop", workshopID, "vehicles", plate],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/vehicles", {
					params: {
						path: { workshopID },
						query: { plate: plate || undefined },
					},
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
export const ordersQuery = (
	workshopID: string,
	status?: S["WorkOrderStatus"],
	branch_id?: string,
) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "orders", status, branch_id],
		queryFn: async () => {
			if (import.meta.env.SSR) {
				const params = new URLSearchParams();
				if (status) params.set("status", status);
				if (branch_id) params.set("branch_id", branch_id);
				return get<S["WorkOrderSummary"][]>(
					`/api/v1/workshops/${encodeURIComponent(workshopID)}/work-orders?${params}`,
				);
			}
			return unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/work-orders", {
					params: { path: { workshopID }, query: { status, branch_id } },
				}),
			);
		},
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
export const counterQuotesQuery = (
	workshopID: string,
	q = "",
	outcome?: S["CounterQuote"]["outcome"],
) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "counter-quotes", q, outcome ?? ""],
		queryFn: async () => {
			if (import.meta.env.SSR) {
				const params = new URLSearchParams();
				if (q) params.set("q", q);
				if (outcome) params.set("outcome", outcome);
				params.set("limit", "50");
				return get<S["CounterQuoteList"]>(
					`/api/v1/workshops/${encodeURIComponent(workshopID)}/quotes?${params}`,
				);
			}
			return unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/quotes", {
					params: {
						path: { workshopID },
						query: { q: q || undefined, outcome, limit: 50 },
					},
				}),
			);
		},
	});
export const counterQuoteQuery = (workshopID: string, quoteID: string) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "counter-quote", quoteID],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/quotes/{quoteID}", {
					params: { path: { workshopID, quoteID } },
				}),
			),
	});
const quoteShareKey = (quoteID: string) => `kilora-quote-share:${quoteID}`;
export function rememberQuoteShare(quoteID: string, url: string) {
	try {
		sessionStorage.setItem(quoteShareKey(quoteID), url);
	} catch {}
}
export function storedQuoteShare(quoteID: string) {
	try {
		return sessionStorage.getItem(quoteShareKey(quoteID)) ?? "";
	} catch {
		return "";
	}
}
export const quoteQuery = (workshopID: string, orderID: string) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "quote", orderID],
		queryFn: async () =>
			unwrap(
				await api.GET(
					"/api/v1/workshops/{workshopID}/work-orders/{orderID}/quote",
					{ params: { path: { workshopID, orderID } } },
				),
			),
	});
export function useWorkshopMutation<T, R>(
	workshopID: string,
	fn: (value: T) => Promise<R>,
) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["workshop", workshopID] }),
		onError: (error) =>
			toast.error(
				error instanceof Error
					? error.message
					: "No se pudo completar la solicitud.",
			),
	});
}
export const actions = (workshopID: string, orderID = "") => {
	const path = { workshopID, orderID };
	return {
		createVehicle: async (body: S["CreateVehicle"]) =>
			unwrap(
				await api.POST("/api/v1/workshops/{workshopID}/vehicles", {
					params: { path: { workshopID } },
					body,
				}),
			),
		createOrder: async (body: S["CreateWorkOrder"]) =>
			unwrap(
				await api.POST("/api/v1/workshops/{workshopID}/work-orders", {
					params: { path: { workshopID } },
					body,
				}),
			),
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
export const counterQuoteActions = (workshopID: string, quoteID = "") => {
	const path = { workshopID, quoteID };
	return {
		create: async (body: S["CounterQuoteInput"]) =>
			unwrap(
				await api.POST("/api/v1/workshops/{workshopID}/quotes", {
					params: { path: { workshopID } },
					body,
				}),
			),
		update: async (body: S["CounterQuoteInput"]) =>
			unwrap(
				await api.PUT("/api/v1/workshops/{workshopID}/quotes/{quoteID}", {
					params: { path },
					body,
				}),
			),
		outcome: async (body: S["QuoteOutcomeInput"]) =>
			unwrap(
				await api.PATCH(
					"/api/v1/workshops/{workshopID}/quotes/{quoteID}/outcome",
					{ params: { path }, body },
				),
			),
		share: async () =>
			unwrap(
				await api.POST(
					"/api/v1/workshops/{workshopID}/quotes/{quoteID}/share",
					{
						params: { path },
					},
				),
			),
		convert: async () =>
			unwrap(
				await api.POST(
					"/api/v1/workshops/{workshopID}/quotes/{quoteID}/convert",
					{ params: { path } },
				),
			),
	};
};
