import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { Copy, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useWorkshopMutation } from "@/features/taller/mutation";
import { orderActions } from "@/features/taller/orders";
import { quoteOutcomeActions } from "@/lib/domain";
import { date, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
	blankQuoteItem,
	QuoteItemsFields,
	quoteItemsSchema,
	quoteItemValues,
} from "./quote-items-fields";
import { SectionCard } from "./workshop-ui";

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
			description="Constancia del presupuesto verbal. El cliente la ve por link durante 15 días; no firma ni aprueba."
			actions={
				order.quote?.shared_at && (
					<span className="text-[11.5px] text-ink-3">
						Compartida el {date(order.quote.shared_at)}
					</span>
				)
			}
		>
			<Form {...form}>
				<div className="space-y-3">
					<QuoteItemsFields layout="compact" initialUnitPrice="0" />
					<div className="flex flex-wrap gap-2">
						<Button
							disabled={quote.isPending}
							onClick={form.handleSubmit(({ items }) =>
								quote.mutate(
									{ items },
									{
										onSuccess: (saved) => {
											reset({ items: saved.items.map(quoteItemValues) });
											toast.success("Cotización guardada");
										},
									},
								),
							)}
						>
							Guardar cotización
						</Button>
						<Button
							variant="outline"
							disabled={!order.quote || share.isPending}
							title={!order.quote ? "Guardá la cotización primero" : undefined}
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
					{url && (
						<div className="flex gap-2">
							<Input
								readOnly
								value={url}
								aria-label="Enlace de la cotización"
								className="font-mono text-xs"
							/>
							<Button
								variant="outline"
								size="icon"
								aria-label="Copiar enlace"
								onClick={async () => {
									await navigator.clipboard.writeText(url);
									toast.success("Enlace copiado");
								}}
							>
								<Copy className="size-4" />
							</Button>
						</div>
					)}
					{order.quote && (
						<div className="flex flex-wrap items-center gap-3 rounded-md bg-secondary/50 p-3">
							<span className="text-[13px] font-medium">
								¿Qué respondió el cliente?
							</span>
							<fieldset className="inline-flex rounded-md border bg-card p-0.5">
								<legend className="sr-only">Resultado de la cotización</legend>
								{quoteOutcomeActions.map(([value, label]) => (
									<button
										key={value}
										type="button"
										aria-pressed={order.quote?.outcome === value}
										disabled={outcome.isPending}
										onClick={() => outcome.mutate({ outcome: value })}
										className={cn(
											"rounded px-2.5 py-1 text-[12.5px] font-medium text-ink-3 hover:text-foreground",
											order.quote?.outcome === value &&
												(value === "acepto"
													? "bg-ok-soft text-ok"
													: value === "rechazo"
														? "bg-destructive/10 text-destructive"
														: "bg-secondary text-foreground"),
										)}
									>
										{label}
									</button>
								))}
							</fieldset>
							{order.quote.outcome_at && (
								<span className="text-[11.5px] text-ink-3">
									Marcado el {date(order.quote.outcome_at)}
								</span>
							)}
						</div>
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
