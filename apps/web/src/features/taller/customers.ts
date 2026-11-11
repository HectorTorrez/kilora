import type { components } from "@kilora/contracts";
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import { LIST_PAGE_SIZE } from "@/lib/pagination";

type S = components["schemas"];
export type Customer = S["Customer"];
export type CustomerRef = S["CustomerRef"];
export type CustomerInput = S["CustomerInput"];
export type CustomerChoice = S["CustomerChoice"];

export const customersPageQuery = (
	workshopID: string,
	q = "",
	offset = 0,
	limit = LIST_PAGE_SIZE,
) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "customers", "page", q, offset, limit],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/customers/page", {
					params: {
						path: { workshopID },
						query: { q: q || undefined, limit, offset },
					},
				}),
			),
	});

export const customerQuery = (workshopID: string, customerID: string) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "customer", customerID],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/customers/{customerID}", {
					params: { path: { workshopID, customerID } },
				}),
			),
	});

export const createCustomerAction =
	(workshopID: string) => async (body: CustomerInput) =>
		unwrap(
			await api.POST("/api/v1/workshops/{workshopID}/customers", {
				params: { path: { workshopID } },
				body,
			}),
		);

export const updateCustomerAction =
	(workshopID: string, customerID: string) => async (body: CustomerInput) =>
		unwrap(
			await api.PATCH("/api/v1/workshops/{workshopID}/customers/{customerID}", {
				params: { path: { workshopID, customerID } },
				body,
			}),
		);

export const setVehicleCustomerAction =
	(workshopID: string, vehicleID: string) => async (body: CustomerChoice) =>
		unwrap(
			await api.PUT(
				"/api/v1/workshops/{workshopID}/vehicles/{vehicleID}/customer",
				{ params: { path: { workshopID, vehicleID } }, body },
			),
		);
