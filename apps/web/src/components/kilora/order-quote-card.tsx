import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useWorkshopMutation } from "@/features/taller/mutation";
import { orderActions } from "@/features/taller/orders";
import { date, money } from "@/lib/format";
import {
	blankQuoteItem,
	QuoteItemsFields,
	quoteItemPayload,
	quoteItemsSchema,
	quoteItemValues,
} from "./quote-items-fields";
import { QuoteOutcomePicker } from "./quote-outcome";
import { CopyField, SectionCard } from "./workshop-ui";

type S = components["schemas"];

export function OrderQuoteCard({
	workshopID,
	order,
}: {
	workshopID: string;
	order: S["WorkOrderDetail"];
}) {
	const a = orderActions(workshopID, order.id);
	const quote = useWorkshopMutation(workshopID, a.quote);
	const share = useWorkshopMutation(workshopID, a.share);
	const outcome = useWorkshopMutation(workshopID, a.outcome);
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(z.object({ items: quoteItemsSchema })),
		defaultValues: {
			items: order.quote?.items.map(quoteItemValues) ?? [blankQuoteItem("0")],
		},
	});
	const {
		reset,
		formState: { isDirty },
	} = form;
	const [url, setUrl] = useState("");
	useEffect(() => {
		if (order.quote && !isDirty)
			reset({ items: order.quote.items.map(quoteItemValues) });
	}, [order.quote, reset, isDirty]);
	const cmp = order.quote_comparison;

	return (
		<SectionCard
			title="Cotización"
			description={
				order.quote?.shared_at
					? `Compartida el ${date(order.quote.shared_at)}. El cliente la puede ver por link durante 15 días.`
					: "Presupuesto que le das al cliente antes de reparar. Lo ve por link; no necesita firmar."
			}
		>
			<Form {...form}>
				<div className="space-y-4">
					<QuoteItemsFields initialUnitPrice="0" />
					<div className="flex flex-wrap gap-2">
						<Button
							disabled={quote.isPending || (!!order.quote && !isDirty)}
							onClick={form.handleSubmit(({ items }) =>
								quote.mutate(
									{ items: items.map(quoteItemPayload) },
									{
										onSuccess: (saved) => {
											reset({ items: saved.items.map(quoteItemValues) });
											toast.success("Cotización guardada");
										},
									},
								),
							)}
						>
							{quote.isPending ? "Guardando…" : "Guardar cotización"}
						</Button>
						<Button
							variant="outline"
							disabled={!order.quote || isDirty || share.isPending}
							title={
								!order.quote || isDirty
									? "Guardá la cotización antes de compartirla"
									: undefined
							}
							onClick={async () => {
								try {
									const result = await share.mutateAsync();
									setUrl(result.url);
									window.open(
										result.whatsapp_url,
										"_blank",
										"noopener,noreferrer",
									);
								} catch {}
							}}
						>
							<MessageCircle className="size-4" />
							Compartir por WhatsApp
						</Button>
					</div>
					{url && <CopyField value={url} label="Enlace de la cotización" />}
					{order.quote && (
						<QuoteOutcomePicker
							value={order.quote.outcome}
							markedAt={order.quote.outcome_at}
							pending={outcome.isPending}
							onChange={(value) => outcome.mutate({ outcome: value })}
						/>
					)}
					{cmp && (
						<dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-line text-center">
							{[
								["Cotizado", cmp.quote_total],
								["Cobrado", cmp.charged_total],
								["Diferencia", cmp.difference],
							].map(([label, value]) => (
								<div key={label} className="bg-card px-2 py-2.5">
									<dt className="text-[11.5px] text-ink-3">{label}</dt>
									<dd className="font-mono text-[13.5px] font-semibold tabular-nums">
										{money(value || 0)}
									</dd>
								</div>
							))}
						</dl>
					)}
				</div>
			</Form>
		</SectionCard>
	);
}
