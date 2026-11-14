import type { components } from "@kilora/contracts";
import { queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import { lineCents } from "@/lib/money";
import { useTallerContext } from "./session";

export type QuoteTemplate = components["schemas"]["QuoteTemplate"];
type Input = components["schemas"]["QuoteTemplateInput"];

export const quoteTemplatesQuery = (workshopID: string) =>
	queryOptions({
		queryKey: ["workshop", workshopID, "quote-templates"],
		queryFn: async ({ signal }) =>
			unwrap(
				await api.GET("/api/v1/workshops/{workshopID}/quote-templates", {
					params: { path: { workshopID } },
					signal,
				}),
			).items,
	});

export const quoteTemplateActions = (workshopID: string) => ({
	create: async (body: Input) =>
		unwrap(
			await api.POST("/api/v1/workshops/{workshopID}/quote-templates", {
				params: { path: { workshopID } },
				body,
			}),
		),
	update: async ({ id, ...body }: Input & { id: string }) =>
		unwrap(
			await api.PUT(
				"/api/v1/workshops/{workshopID}/quote-templates/{templateID}",
				{ params: { path: { workshopID, templateID: id } }, body },
			),
		),
	remove: async (id: string) =>
		unwrap(
			await api.DELETE(
				"/api/v1/workshops/{workshopID}/quote-templates/{templateID}",
				{ params: { path: { workshopID, templateID: id } } },
			),
		),
});

/** Admin y recepción de cualquier sucursal administran las plantillas del taller. */
export function useCanManageQuoteTemplates(workshopID: string) {
	const { me } = useTallerContext();
	return me.memberships.some(
		(m) =>
			m.workshop_id === workshopID &&
			(m.role === "admin" || m.role === "recepcion"),
	);
}

/** Total de la plantilla en centavos. */
export const templateTotal = (template: QuoteTemplate) =>
	template.items.reduce(
		(sum, item) =>
			sum + lineCents(String(item.quantity), String(item.unit_price)),
		0,
	);
