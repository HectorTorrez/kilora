import type { components } from "@kilora/contracts";
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import { LIST_PAGE_SIZE } from "@/lib/pagination";

type S = components["schemas"];

export const workshopQuery = (workshopID: string) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "detail"],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/", {
					params: { path: { workshopID } },
				}),
			),
	});
export const membersQuery = (workshopID: string) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "members"],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/members", {
					params: { path: { workshopID } },
				}),
			),
	});
export const auditPageQuery = (workshopID: string, offset = 0) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "audit", "page", offset],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/audit/page", {
					params: {
						path: { workshopID },
						query: { offset, limit: LIST_PAGE_SIZE },
					},
				}),
			),
	});
export const adminActions = (workshopID: string) => ({
	addMember: async (body: S["MemberInput"]) =>
		unwrap(
			await api.POST("/api/v1/workshops/{workshopID}/members", {
				params: { path: { workshopID } },
				body,
			}),
		),
	removeMember: async (membershipID: string) =>
		unwrap(
			await api.DELETE(
				"/api/v1/workshops/{workshopID}/members/{membershipID}",
				{ params: { path: { workshopID, membershipID } } },
			),
		),
});
