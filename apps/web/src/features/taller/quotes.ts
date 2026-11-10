import type { components } from "@kilora/contracts";
import { queryOptions } from "@tanstack/react-query";
import type { DateRange } from "@/components/kilora/date-range-filter";
import { api, unwrap } from "@/lib/api";
import { LIST_PAGE_SIZE } from "@/lib/pagination";

type S = components["schemas"];

export const counterQuotesQuery = (
	workshopID: string,
	q = "",
	outcomes: S["CounterQuote"]["outcome"][] = [],
	offset = 0,
	range: DateRange = {},
) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "counter-quotes", q, outcomes, offset],
		queryFn: async () =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/quotes", {
					params: {
						path: { workshopID },
						query: {
							q: q || undefined,
							outcome: outcomes.length ? outcomes : undefined,
							limit: LIST_PAGE_SIZE,
							offset,
							from: range.from,
							to: range.to,
						},
					},
				}),
			),
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
export const createCounterQuoteAction =
	(workshopID: string) => async (body: S["CounterQuoteInput"]) =>
		unwrap(
			await api.POST("/api/v1/workshops/{workshopID}/quotes", {
				params: { path: { workshopID } },
				body,
			}),
		);
export const counterQuoteActions = (workshopID: string, quoteID: string) => {
	const path = { workshopID, quoteID };
	return {
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
