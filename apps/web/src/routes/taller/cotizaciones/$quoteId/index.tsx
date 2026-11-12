import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ArrowRight,
	Check,
	MessageCircle,
	Pencil,
	Printer,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AIQuoteMessage } from "@/components/kilora/ai-quote-message";
import {
	CounterQuoteForm,
	counterQuoteFormValues,
} from "@/components/kilora/counter-quote-form";
import { FormError } from "@/components/kilora/form-fields";
import {
	QuoteOutcomeBadge,
	QuoteOutcomePicker,
} from "@/components/kilora/quote-outcome";
import { SortableHead, useTableSort } from "@/components/kilora/sortable-table";
import {
	BackLink,
	CopyField,
	DetailList,
	PageBody,
	PageHeader,
	Plate,
	SectionCard,
} from "@/components/kilora/workshop-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useWorkshopMutation } from "@/features/taller/mutation";
import {
	counterQuoteActions,
	counterQuoteQuery,
	rememberQuoteShare,
} from "@/features/taller/quotes";
import { useTallerContext, useWorkshopId } from "@/features/taller/session";
import { api, unwrap } from "@/lib/api";
import { date, day, money, phone, quoteCode } from "@/lib/format";
import { formatCents, lineCents } from "@/lib/money";

export const Route = createFileRoute("/taller/cotizaciones/$quoteId/")({
	component: QuoteDetailPage,
});

function vehicleName(quote: components["schemas"]["CounterQuote"]) {
	return [quote.vehicle_make, quote.vehicle_model, quote.vehicle_year]
		.filter(Boolean)
		.join(" ");
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
	const items = useTableSort(data?.items ?? [], {
		description: (item) => item.description,
		kind: (item) => item.kind,
		quantity: (item) => Number(item.quantity),
		price: (item) => Number(item.unit_price),
		subtotal: (item) => Number(item.quantity) * Number(item.unit_price),
	});
	const [editing, setEditing] = useState(false);
	const [confirm, setConfirm] = useState(false);
	const [url, setUrl] = useState("");
	const [shareError, setShareError] = useState<string | null>(null);
	if (isLoading) {
		return (
			<PageBody>
				<Skeleton className="h-20 w-80" />
				<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
					<Skeleton className="h-72" />
					<Skeleton className="h-72" />
				</div>
			</PageBody>
		);
	}
	if (error || !data) {
		return (
			<PageBody>
				<Alert variant="destructive">
					<AlertDescription>
						{error?.message ?? "No se encontró la cotización."}
					</AlertDescription>
				</Alert>
			</PageBody>
		);
	}
	const quote = data;
	const converted = Boolean(quote.converted_order_id);
	const editable = quote.outcome === "pendiente" && !converted;
	const back = <BackLink to="/taller/cotizaciones">Cotizaciones</BackLink>;

	if (editing && editable) {
		return (
			<PageBody>
				<PageHeader
					back={back}
					eyebrow={quoteCode(quote.number)}
					title="Editar cotización"
				/>
				<CounterQuoteForm
					workshopID={workshopID}
					branches={branches}
					initial={counterQuoteFormValues(quote, branches[0]?.branch_id)}
					pending={update.isPending}
					submitLabel="Guardar cambios"
					onCancel={() => setEditing(false)}
					onSubmit={async (body) => {
						await update.mutateAsync(body);
						toast.success("Cotización actualizada");
						setEditing(false);
					}}
				/>
			</PageBody>
		);
	}

	const shareQuote = async () => {
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
	};

	return (
		<PageBody>
			<PageHeader
				back={back}
				eyebrow={`${quoteCode(quote.number)} · ${date(quote.created_at)}`}
				title={quote.customer_name || "Cotización"}
				badges={<QuoteOutcomeBadge outcome={quote.outcome} />}
				description={
					quote.valid_until ? `Válida hasta el ${day(quote.valid_until)}` : null
				}
				actions={
					<>
						<Button asChild variant="outline">
							<Link
								to="/taller/cotizaciones/$quoteId/imprimir"
								params={{ quoteId: quote.id }}
							>
								<Printer className="size-4" />
								Imprimir
							</Link>
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={share.isPending}
							onClick={shareQuote}
						>
							<MessageCircle className="size-4" />
							WhatsApp
						</Button>
						<AIQuoteMessage
							generate={async () =>
								unwrap(
									await api.POST(
										"/api/v1/workshops/{workshopID}/quotes/{quoteID}/ai/message",
										{ params: { path: { workshopID, quoteID: quote.id } } },
									),
								)
							}
							share={() => share.mutateAsync()}
							onShared={(link) => {
								rememberQuoteShare(quote.id, link);
								setUrl(link);
							}}
						/>
						{editable ? (
							<Button
								type="button"
								variant="outline"
								onClick={() => setEditing(true)}
							>
								<Pencil className="size-4" />
								Editar
							</Button>
						) : null}
						{quote.outcome !== "rechazo" && !converted ? (
							<Button type="button" onClick={() => setConfirm(true)}>
								<ArrowRight className="size-4" />
								Convertir en orden
							</Button>
						) : null}
					</>
				}
			/>
			{converted && quote.converted_order_id ? (
				<Alert>
					<Check />
					<AlertDescription>
						<span>
							Convertida en la orden{" "}
							<Link
								className="font-semibold text-seal underline-offset-2 hover:underline"
								to="/taller/ordenes/$orderId"
								params={{ orderId: quote.converted_order_id }}
							>
								#{quote.converted_order_number}
							</Link>
							.
						</span>
					</AlertDescription>
				</Alert>
			) : null}
			<FormError error={shareError} />
			{url ? <CopyField value={url} label="Enlace de la cotización" /> : null}

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
				<SectionCard
					title="Repuestos y mano de obra"
					bodyClassName="p-0 sm:p-0"
				>
					<Table>
						<TableHeader>
							<TableRow className="bg-secondary/40 hover:bg-secondary/40">
								<SortableHead
									sortKey="description"
									sort={items.sort}
									onSort={items.toggle}
									className="pl-3 sm:pl-4 sm:pl-5"
								>
									Descripción
								</SortableHead>
								<SortableHead
									sortKey="kind"
									sort={items.sort}
									onSort={items.toggle}
									className="hidden sm:table-cell"
								>
									Tipo
								</SortableHead>
								<SortableHead
									sortKey="quantity"
									sort={items.sort}
									onSort={items.toggle}
									className="text-right"
									align="right"
								>
									Cant.
								</SortableHead>
								<SortableHead
									sortKey="price"
									sort={items.sort}
									onSort={items.toggle}
									className="text-right"
									align="right"
								>
									Precio unit.
								</SortableHead>
								<SortableHead
									sortKey="subtotal"
									sort={items.sort}
									onSort={items.toggle}
									className="pr-3 sm:pr-4 text-right sm:pr-5"
									align="right"
								>
									Subtotal
								</SortableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.rows.map((item, index) => (
								<TableRow
									// biome-ignore lint/suspicious/noArrayIndexKey: Los ítems no tienen id.
									key={`${item.description}-${index}`}
									className="hover:bg-transparent"
								>
									<TableCell className="pl-3 sm:pl-4 text-[13px] font-medium whitespace-normal sm:pl-5">
										{item.description}
									</TableCell>
									<TableCell className="hidden text-[13px] text-ink-3 sm:table-cell">
										{item.kind === "repuesto" ? "Repuesto" : "Mano de obra"}
									</TableCell>
									<TableCell className="text-right font-mono text-[13px] tabular-nums">
										{Number(item.quantity)}
									</TableCell>
									<TableCell className="text-right font-mono text-[13px] tabular-nums">
										{money(item.unit_price)}
									</TableCell>
									<TableCell className="pr-3 sm:pr-4 text-right font-mono text-[13px] tabular-nums sm:pr-5">
										{money(
											formatCents(
												lineCents(
													String(item.quantity),
													String(item.unit_price),
												),
											),
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
					<div className="flex items-baseline justify-between border-t bg-secondary/30 px-4 py-3 sm:px-5">
						<span className="text-[13px] font-medium text-ink-2">Total</span>
						<span className="font-display text-xl font-bold tabular-nums">
							{money(quote.total)}
						</span>
					</div>
					{quote.notes ? (
						<div className="border-t px-4 py-3 text-[13px] sm:px-5">
							<p className="text-ink-3">Notas para el cliente</p>
							<p className="mt-1 whitespace-pre-line">{quote.notes}</p>
						</div>
					) : null}
				</SectionCard>
				<div className="space-y-6">
					<SectionCard title="Cliente y vehículo">
						<DetailList
							items={[
								{ label: "Cliente", value: quote.customer_name },
								{
									label: "Teléfono",
									value: phone(quote.customer_phone),
									mono: true,
								},
								{ label: "Vehículo", value: vehicleName(quote) },
								{
									label: "Placa",
									value: quote.vehicle_plate && (
										<Plate value={quote.vehicle_plate} />
									),
								},
								{ label: "Sucursal", value: quote.branch_name },
							]}
						/>
					</SectionCard>
					{!converted ? (
						<SectionCard
							title="Respuesta del cliente"
							description="El cliente no firma: dejá constancia de lo que respondió."
						>
							<QuoteOutcomePicker
								value={quote.outcome}
								pending={outcome.isPending}
								onChange={(value) => outcome.mutate({ outcome: value })}
							/>
							<FormError error={outcome.error} className="mt-3" />
						</SectionCard>
					) : null}
				</div>
			</div>
			<Dialog open={confirm} onOpenChange={setConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Convertir en orden</DialogTitle>
						<DialogDescription>
							Se abre una orden en {quote.branch_name} con el motivo «Cotización{" "}
							{quoteCode(quote.number)}».
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
							Convertir en orden
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</PageBody>
	);
}
