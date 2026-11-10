import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
	CounterQuoteForm,
	counterQuoteFormValues,
} from "@/components/kilora/counter-quote-form";
import { FormError } from "@/components/kilora/form-fields";
import { QuoteOutcomeBadge } from "@/components/kilora/quote-outcome";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkshopMutation } from "@/features/taller/mutation";
import {
	counterQuoteActions,
	counterQuoteQuery,
	rememberQuoteShare,
} from "@/features/taller/quotes";
import { useTallerContext, useWorkshopId } from "@/features/taller/session";
import { quoteOutcomeActions } from "@/lib/domain";
import { date, day, money, phone, quoteCode } from "@/lib/format";
import { formatCents, lineCents } from "@/lib/money";

export const Route = createFileRoute("/taller/cotizaciones/$quoteId/")({
	component: QuoteDetailPage,
});

function vehicleLine(quote: components["schemas"]["CounterQuote"]) {
	const name = [quote.vehicle_make, quote.vehicle_model, quote.vehicle_year]
		.filter(Boolean)
		.join(" ");
	return quote.vehicle_plate ? `${quote.vehicle_plate} · ${name}` : name;
}

function QuoteDetailPage() {
	const { quoteId } = Route.useParams();
	const workshopID = useWorkshopId();
	const { me } = useTallerContext();
	const branches = me.memberships.filter(
		(item) => item.workshop_id === workshopID,
	);
	const navigate = useNavigate();
	const { data, isLoading, error } = useQuery(
		counterQuoteQuery(workshopID, quoteId),
	);
	const actions = counterQuoteActions(workshopID, quoteId);
	const update = useWorkshopMutation(workshopID, actions.update);
	const outcome = useWorkshopMutation(workshopID, actions.outcome);
	const share = useWorkshopMutation(workshopID, actions.share);
	const convert = useWorkshopMutation(workshopID, actions.convert);
	const [editing, setEditing] = useState(false);
	const [confirm, setConfirm] = useState(false);
	const [url, setUrl] = useState("");
	const [shareError, setShareError] = useState<string | null>(null);
	if (isLoading) {
		return (
			<main className="mx-auto max-w-3xl space-y-4 px-5 py-7">
				<Skeleton className="h-10 w-48" />
				<Skeleton className="h-40" />
			</main>
		);
	}
	if (error || !data) {
		return (
			<main className="mx-auto max-w-3xl px-5 py-7">
				<Alert variant="destructive">
					<AlertDescription>
						{error?.message ?? "No se encontró la cotización."}
					</AlertDescription>
				</Alert>
			</main>
		);
	}
	const quote = data;
	const converted = Boolean(quote.converted_order_id);
	const editable = quote.outcome === "pendiente" && !converted;
	return (
		<main className="mx-auto max-w-3xl space-y-5 px-5 py-7">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="font-mono text-sm text-ink-3">
						{quoteCode(quote.number)}
					</p>
					<h1 className="font-display text-3xl font-bold">
						{quote.customer_name || "Cotización"}
					</h1>
					<p className="text-sm text-ink-3">
						{date(quote.created_at)}
						{quote.valid_until
							? ` · válida hasta ${day(quote.valid_until)}`
							: ""}
					</p>
				</div>
				<QuoteOutcomeBadge outcome={quote.outcome} />
			</div>
			{converted && quote.converted_order_id ? (
				<Alert>
					<AlertDescription>
						Convertida en orden{" "}
						<Link
							className="font-medium underline"
							to="/taller/ordenes/$orderId"
							params={{ orderId: quote.converted_order_id }}
						>
							#{quote.converted_order_number}
						</Link>
					</AlertDescription>
				</Alert>
			) : null}
			<div className="flex flex-wrap gap-2">
				{editable ? (
					<Button
						type="button"
						variant="outline"
						onClick={() => setEditing((value) => !value)}
					>
						{editing ? "Ver detalle" : "Editar"}
					</Button>
				) : null}
				<Button asChild variant="outline">
					<Link
						to="/taller/cotizaciones/$quoteId/imprimir"
						params={{ quoteId: quote.id }}
					>
						Imprimir
					</Link>
				</Button>
				<Button
					type="button"
					variant="outline"
					disabled={share.isPending}
					onClick={async () => {
						setShareError(null);
						try {
							const result = await share.mutateAsync();
							rememberQuoteShare(quote.id, result.url);
							setUrl(result.url);
							window.open(result.whatsapp_url, "_blank", "noopener,noreferrer");
						} catch (shareFailure) {
							setShareError(
								shareFailure instanceof Error
									? shareFailure.message
									: "No se pudo compartir la cotización.",
							);
						}
					}}
				>
					Compartir por WhatsApp
				</Button>
				{quote.outcome !== "rechazo" && !converted ? (
					<Button type="button" onClick={() => setConfirm(true)}>
						Convertir en orden
					</Button>
				) : null}
			</div>
			<FormError error={shareError} />
			{url ? (
				<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
					<div className="grid gap-2">
						<Label htmlFor="counter-quote-url">Enlace de la cotización</Label>
						<Input id="counter-quote-url" readOnly value={url} />
					</div>
					<Button
						type="button"
						variant="outline"
						onClick={async () => {
							await navigator.clipboard.writeText(url);
							toast.success("Enlace copiado");
						}}
					>
						Copiar
					</Button>
				</div>
			) : null}
			{editing && editable ? (
				<CounterQuoteForm
					workshopID={workshopID}
					branches={branches}
					initial={counterQuoteFormValues(quote, branches[0]?.branch_id)}
					pending={update.isPending}
					onCancel={() => setEditing(false)}
					onSubmit={async (body) => {
						await update.mutateAsync(body);
						toast.success("Cotización actualizada");
						setEditing(false);
					}}
				/>
			) : (
				<>
					<Card className="gap-2 rounded-lg p-5 shadow-none">
						<h2 className="font-semibold">Cliente y vehículo</h2>
						<p>{quote.customer_name}</p>
						<p className="text-sm text-ink-3">
							{phone(quote.customer_phone) || "Sin teléfono"}
						</p>
						<p className="mt-2">{vehicleLine(quote)}</p>
						<p className="text-sm text-ink-3">{quote.branch_name}</p>
					</Card>
					<Card className="gap-3 rounded-lg p-5 shadow-none">
						<h2 className="font-semibold">Ítems</h2>
						<ul className="grid gap-2">
							{quote.items.map((item, index) => (
								<li
									// biome-ignore lint/suspicious/noArrayIndexKey: Los ítems no tienen id.
									key={`${item.description}-${index}`}
									className="flex justify-between gap-4 text-sm"
								>
									<span>
										{item.description}
										<span className="text-ink-3">
											{" "}
											· {item.kind === "repuesto" ? "Repuesto" : "Mano de obra"}{" "}
											· {item.quantity} × {money(item.unit_price)}
										</span>
									</span>
									<span className="tabular-nums">
										{money(
											formatCents(
												lineCents(
													String(item.quantity),
													String(item.unit_price),
												),
											),
										)}
									</span>
								</li>
							))}
						</ul>
						<p className="flex justify-between border-t pt-3 font-bold">
							<span>Total</span>
							<span className="tabular-nums">{money(quote.total)}</span>
						</p>
						{quote.notes ? (
							<p className="text-sm text-ink-3">{quote.notes}</p>
						) : null}
					</Card>
				</>
			)}
			{!converted ? (
				<Card className="gap-3 rounded-lg p-5 shadow-none">
					<h2 className="font-semibold">Marcar resultado</h2>
					<p className="text-sm text-ink-3">
						El cliente no firma. Recepción deja constancia de lo que pasó.
					</p>
					<div className="flex flex-wrap gap-2">
						{quoteOutcomeActions.map(([value, label]) => (
							<Button
								key={value}
								type="button"
								variant={quote.outcome === value ? "default" : "outline"}
								size="sm"
								disabled={outcome.isPending}
								onClick={() => outcome.mutate({ outcome: value })}
							>
								{label}
							</Button>
						))}
					</div>
					<FormError error={outcome.error} />
				</Card>
			) : null}
			<Dialog open={confirm} onOpenChange={setConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Convertir en orden</DialogTitle>
						<DialogDescription>
							Se abre una orden en {quote.branch_name} con el motivo Cotización{" "}
							{quoteCode(quote.number)}.
							{quote.vehicle_id
								? " Usa el vehículo vinculado."
								: " Se registra un vehículo provisional con estos datos."}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setConfirm(false)}
						>
							Cancelar
						</Button>
						<Button
							type="button"
							disabled={convert.isPending}
							onClick={async () => {
								try {
									const result = await convert.mutateAsync();
									toast.success("Orden abierta");
									setConfirm(false);
									await navigate({
										to: "/taller/ordenes/$orderId",
										params: { orderId: result.order_id },
									});
								} catch {}
							}}
						>
							Convertir
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</main>
	);
}
