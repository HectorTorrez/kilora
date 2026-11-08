import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	ArrowRight,
	BadgeCheck,
	Ban,
	Check,
	Copy,
	Lock,
	MessageCircle,
	Plus,
	Printer,
	Trash2,
	Wrench,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorkshopId } from "@/components/kilora/app-shell";
import { categoryLabels } from "@/components/kilora/history-timeline";
import { OwnerInvitation } from "@/components/kilora/owner-invitation";
import {
	EmptyState,
	OrderStatusBadge,
	PageBody,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { date, km as formatKm, money, statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
	actions,
	orderQuery,
	useWorkshopMutation,
	vehicleQuery,
} from "@/lib/workshop";

type S = components["schemas"];
export const Route = createFileRoute("/taller/ordenes/$orderId")({
	component: OrderPage,
});
const blank = (): S["QuoteItem"] => ({
	kind: "repuesto",
	description: "",
	quantity: 1,
	unit_price: 0,
});
const flow: S["WorkOrderStatus"][] = [
	"recibido",
	"diagnostico",
	"en_reparacion",
	"listo",
];
const next: Partial<Record<S["WorkOrderStatus"], S["WorkOrderStatus"]>> = {
	recibido: "diagnostico",
	diagnostico: "en_reparacion",
	en_reparacion: "listo",
};

function OrderPage() {
	const { orderId } = Route.useParams();
	const workshopID = useWorkshopId();
	const order = useQuery({
		...orderQuery(workshopID, orderId),
		enabled: !!workshopID,
	});
	const vehicle = useQuery({
		...vehicleQuery(workshopID, order.data?.vehicle_id || ""),
		enabled: !!order.data,
	});
	if (order.isLoading || !workshopID)
		return (
			<PageBody>
				<Skeleton className="h-28" aria-label="Cargando orden…" />
				<div className="grid gap-6 lg:grid-cols-[1fr_340px]">
					<Skeleton className="h-96" />
					<Skeleton className="h-96" />
				</div>
			</PageBody>
		);
	if (order.error || !order.data)
		return (
			<PageBody>
				<Alert variant="destructive">
					<AlertDescription>
						{order.error?.message || "Orden no disponible"}
					</AlertDescription>
				</Alert>
			</PageBody>
		);
	return (
		<OrderDetail
			key={order.data.id}
			workshopID={workshopID}
			order={order.data}
			vehicle={vehicle.data}
		/>
	);
}

function OrderDetail({
	workshopID,
	order,
	vehicle,
}: {
	workshopID: string;
	order: S["WorkOrderDetail"];
	vehicle?: S["Vehicle"];
}) {
	const a = actions(workshopID, order.id);
	const status = useWorkshopMutation(workshopID, a.status);
	const [cancelOpen, setCancelOpen] = useState(false);
	const [cancelReason, setCancelReason] = useState("");
	const nextStatus = next[order.status];
	const closed = order.status === "listo" || order.status === "cancelado";
	const step = flow.indexOf(order.status);

	return (
		<PageBody>
			<div>
				<Link
					to="/taller/ordenes"
					className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-foreground print:hidden"
				>
					<ArrowLeft className="size-3.5" />
					Órdenes
				</Link>
				<div className="mt-3 flex flex-wrap items-end justify-between gap-4">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<span className="font-mono text-[13px] font-semibold text-ink-3">
								Orden #{order.number}
							</span>
							<OrderStatusBadge status={order.status} />
							{order.history_record_id && (
								<span className="inline-flex items-center gap-1 rounded-full bg-seal-soft px-2 py-0.5 text-[11.5px] font-semibold text-seal">
									<BadgeCheck className="size-3.5" />
									Publicada en el historial
								</span>
							)}
						</div>
						<h1 className="mt-2 flex flex-wrap items-center gap-3 font-display text-[26px] leading-tight font-bold">
							<Plate value={vehicle?.plate} className="text-base" />
							{vehicle ? (
								`${vehicle.make} ${vehicle.model}`
							) : (
								<Skeleton className="h-7 w-48" />
							)}
						</h1>
						<p className="mt-1 text-sm text-ink-3">
							{order.reason} · recibida el {date(order.received_at)}
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button asChild variant="outline">
							<Link
								to="/taller/ordenes/$orderId/hoja"
								params={{ orderId: order.id }}
							>
								<Printer className="size-4" />
								Hoja del mecánico
							</Link>
						</Button>
						{!closed && (
							<Button variant="outline" onClick={() => setCancelOpen(true)}>
								<Ban className="size-4" />
								Cancelar
							</Button>
						)}
						{nextStatus && (
							<Button
								disabled={status.isPending}
								onClick={() =>
									status.mutate(
										{ status: nextStatus },
										{
											onSuccess: () =>
												toast.success(
													nextStatus === "listo"
														? "Orden lista y publicada en el historial"
														: `Orden en ${statusLabel(nextStatus).toLowerCase()}`,
												),
										},
									)
								}
							>
								{nextStatus === "listo" ? (
									<Check className="size-4" />
								) : (
									<ArrowRight className="size-4" />
								)}
								{nextStatus === "listo"
									? "Marcar como lista"
									: `Pasar a ${statusLabel(nextStatus).toLowerCase()}`}
							</Button>
						)}
					</div>
				</div>
			</div>

			{order.status === "cancelado" ? (
				<Alert variant="destructive">
					<AlertDescription>
						Orden cancelada
						{order.cancelled_at ? ` el ${date(order.cancelled_at)}` : ""}
						{order.cancel_reason ? ` · ${order.cancel_reason}` : ""}
					</AlertDescription>
				</Alert>
			) : (
				<ol
					className="grid grid-cols-4 gap-2"
					aria-label="Progreso de la orden"
				>
					{flow.map((s, i) => (
						<li key={s} aria-current={i === step ? "step" : undefined}>
							<div
								className={cn(
									"h-1.5 rounded-full bg-secondary",
									i <= step && "bg-seal",
									i === step && s !== "listo" && "bg-seal/60",
								)}
							/>
							<p
								className={cn(
									"mt-1.5 text-[11.5px] text-ink-3",
									i === step && "font-semibold text-foreground",
								)}
							>
								{statusLabel(s)}
							</p>
						</li>
					))}
				</ol>
			)}
			{nextStatus === "listo" && (
				<p className="-mt-3 text-xs text-ink-3">
					Al marcarla como lista se publica un registro inmutable en el
					historial del vehículo. Las correcciones posteriores se agregan, no se
					reescriben.
				</p>
			)}

			<div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
				<div className="min-w-0 space-y-6">
					<JobsCard workshopID={workshopID} order={order} locked={closed} />
					<QuoteCard workshopID={workshopID} order={order} />
				</div>
				<div className="space-y-6">
					<SectionCard
						title="Vehículo"
						actions={
							<Button asChild variant="ghost" size="sm">
								<Link
									to="/taller/vehiculos/$vehicleId"
									params={{ vehicleId: order.vehicle_id }}
								>
									Ver ficha
									<ArrowRight className="size-3.5" />
								</Link>
							</Button>
						}
					>
						<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
							<dt className="text-ink-3">Contacto</dt>
							<dd className="truncate text-right font-medium">
								{vehicle?.contact_name || "—"}
							</dd>
							<dt className="text-ink-3">Teléfono</dt>
							<dd className="text-right font-mono">
								{vehicle?.contact_phone || "—"}
							</dd>
							<dt className="text-ink-3">Km de ingreso</dt>
							<dd className="text-right font-mono">
								{formatKm(order.odometer_km)}
							</dd>
						</dl>
					</SectionCard>
					<OrderDataCard workshopID={workshopID} order={order} />
					<OwnerInvitation
						workshopID={workshopID}
						vehicleID={order.vehicle_id}
						linked={vehicle?.owner_linked ?? vehicle?.status === "vinculado"}
						name={vehicle?.owner_name}
					/>
				</div>
			</div>

			<Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Cancelar orden #{order.number}</DialogTitle>
						<DialogDescription>
							La orden no se publica en el historial. Dejá constancia del
							motivo.
						</DialogDescription>
					</DialogHeader>
					<form
						id="cancel-form"
						onSubmit={(e) => {
							e.preventDefault();
							status.mutate(
								{ status: "cancelado", cancel_reason: cancelReason },
								{
									onSuccess: () => {
										setCancelOpen(false);
										toast.success("Orden cancelada");
									},
								},
							);
						}}
					>
						<Label htmlFor="cancel-reason" className="grid gap-2">
							Motivo de cancelación
							<Textarea
								id="cancel-reason"
								required
								autoFocus
								placeholder="Ej. El cliente decidió no hacer la reparación"
								value={cancelReason}
								onChange={(e) => setCancelReason(e.target.value)}
							/>
						</Label>
					</form>
					<DialogFooter>
						<Button variant="outline" onClick={() => setCancelOpen(false)}>
							Volver
						</Button>
						<Button
							type="submit"
							form="cancel-form"
							variant="destructive"
							disabled={!cancelReason.trim() || status.isPending}
						>
							Cancelar orden
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</PageBody>
	);
}

function JobsCard({
	workshopID,
	order,
	locked,
}: {
	workshopID: string;
	order: S["WorkOrderDetail"];
	locked: boolean;
}) {
	const a = actions(workshopID, order.id);
	const job = useWorkshopMutation(workshopID, a.job);
	const deleteJob = useWorkshopMutation(workshopID, a.deleteJob);
	const part = useWorkshopMutation(workshopID, a.part);
	const deletePart = useWorkshopMutation(workshopID, a.deletePart);
	const [jobName, setJobName] = useState("");
	const [labor, setLabor] = useState("");
	const [category, setCategory] = useState<string>("none");
	const [partName, setPartName] = useState("");
	const [partQty, setPartQty] = useState("1");
	const [partPrice, setPartPrice] = useState("");
	const [partJob, setPartJob] = useState("");
	const total = order.jobs.reduce(
		(sum, j) =>
			sum +
			Number(j.labor_price || 0) +
			j.parts.reduce(
				(s, p) => s + Number(p.quantity) * Number(p.unit_price || 0),
				0,
			),
		0,
	);

	return (
		<SectionCard
			title="Trabajos y piezas"
			description="Lo que se cobra. La categoría alimenta el «último cambio por pieza»."
			bodyClassName="p-0 sm:p-0"
		>
			{!order.jobs.length ? (
				<EmptyState
					icon={Wrench}
					title="Sin trabajos todavía"
					description="Agregá el primer trabajo realizado con su mano de obra."
				/>
			) : (
				<ul className="divide-y">
					{order.jobs.map((j) => (
						<li key={j.id} className="px-4 py-3.5 sm:px-5">
							<div className="flex items-start gap-3">
								<div className="min-w-0 flex-1">
									<p className="text-[13.5px] font-semibold">
										{j.description}
										{j.category && categoryLabels[j.category] && (
											<span className="ml-2 rounded bg-secondary px-1.5 py-px align-middle text-[10.5px] font-medium text-ink-2">
												{categoryLabels[j.category]}
											</span>
										)}
									</p>
									<p className="text-xs text-ink-3">Mano de obra</p>
								</div>
								<span className="font-mono text-[13px] tabular-nums">
									{money(j.labor_price || 0)}
								</span>
								{!locked && (
									<Button
										variant="ghost"
										size="icon"
										className="-my-1 size-8 text-ink-3 hover:text-destructive"
										aria-label={`Eliminar trabajo ${j.description}`}
										onClick={() => deleteJob.mutate(j.id)}
									>
										<Trash2 className="size-4" />
									</Button>
								)}
							</div>
							{j.parts.length > 0 && (
								<ul className="mt-2 space-y-1 border-l-2 pl-3">
									{j.parts.map((p) => (
										<li
											key={p.id}
											className="flex items-center gap-3 text-[13px]"
										>
											<span className="min-w-0 flex-1 truncate">
												{p.name}
												{p.brand && (
													<span className="text-ink-3"> · {p.brand}</span>
												)}
											</span>
											<span className="font-mono text-xs text-ink-3 tabular-nums">
												{Number(p.quantity)} × {money(p.unit_price || 0)}
											</span>
											<span className="w-20 text-right font-mono text-[13px] tabular-nums">
												{money(Number(p.quantity) * Number(p.unit_price || 0))}
											</span>
											{!locked && (
												<Button
													variant="ghost"
													size="icon"
													className="size-7 text-ink-3 hover:text-destructive"
													aria-label={`Eliminar pieza ${p.name}`}
													onClick={() =>
														deletePart.mutate({ jobID: j.id, partID: p.id })
													}
												>
													<X className="size-3.5" />
												</Button>
											)}
										</li>
									))}
								</ul>
							)}
							{!locked &&
								(partJob === j.id ? (
									<form
										className="mt-3 flex flex-wrap gap-2 rounded-md bg-secondary/50 p-2"
										onSubmit={(e) => {
											e.preventDefault();
											part.mutate(
												{
													jobID: j.id,
													body: {
														name: partName,
														quantity: partQty || 1,
														unit_price: partPrice || "0",
													},
												},
												{
													onSuccess: () => {
														setPartName("");
														setPartPrice("");
														setPartQty("1");
														setPartJob("");
													},
												},
											);
										}}
									>
										<Input
											autoFocus
											className="min-w-40 flex-1 bg-card"
											required
											aria-label="Pieza"
											placeholder="Pieza"
											value={partName}
											onChange={(e) => setPartName(e.target.value)}
										/>
										<Input
											className="w-20 bg-card"
											type="number"
											min="0.01"
											step="0.01"
											aria-label="Cantidad"
											value={partQty}
											onChange={(e) => setPartQty(e.target.value)}
										/>
										<Input
											className="w-28 bg-card"
											type="number"
											min="0"
											step="0.01"
											aria-label="Precio unitario"
											placeholder="Precio"
											value={partPrice}
											onChange={(e) => setPartPrice(e.target.value)}
										/>
										<Button size="sm" className="h-9" disabled={part.isPending}>
											Agregar
										</Button>
										<Button
											type="button"
											size="sm"
											variant="ghost"
											className="h-9"
											onClick={() => setPartJob("")}
										>
											Cancelar
										</Button>
									</form>
								) : (
									<button
										type="button"
										className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-seal hover:underline"
										onClick={() => setPartJob(j.id)}
									>
										<Plus className="size-3.5" />
										Agregar pieza
									</button>
								))}
						</li>
					))}
				</ul>
			)}
			{!locked && (
				<form
					className="flex flex-wrap gap-2 border-t bg-secondary/30 px-4 py-3 sm:px-5"
					onSubmit={(e) => {
						e.preventDefault();
						job.mutate(
							{
								description: jobName,
								labor_price: labor || "0",
								category:
									category === "none" ? null : (category as S["PartCategory"]),
							},
							{
								onSuccess: () => {
									setJobName("");
									setLabor("");
									setCategory("none");
								},
							},
						);
					}}
				>
					<Input
						required
						className="min-w-48 flex-1 bg-card"
						aria-label="Trabajo realizado"
						placeholder="Trabajo realizado"
						value={jobName}
						onChange={(e) => setJobName(e.target.value)}
					/>
					<Select value={category} onValueChange={setCategory}>
						<SelectTrigger aria-label="Categoría" className="w-40 bg-card">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">Sin categoría</SelectItem>
							{Object.entries(categoryLabels).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
							<SelectItem value="otro">Otro</SelectItem>
						</SelectContent>
					</Select>
					<Input
						className="w-32 bg-card"
						type="number"
						min="0"
						step="0.01"
						aria-label="Mano de obra"
						placeholder="Mano de obra"
						value={labor}
						onChange={(e) => setLabor(e.target.value)}
					/>
					<Button disabled={job.isPending}>
						<Plus className="size-4" />
						Agregar trabajo
					</Button>
				</form>
			)}
			<div className="flex items-center justify-between border-t px-4 py-3 sm:px-5">
				<span className="text-[13px] text-ink-3">Total a cobrar</span>
				<span className="font-display text-xl font-bold tabular-nums">
					{money(total)}
				</span>
			</div>
		</SectionCard>
	);
}

const outcomes = [
	["acepto", "Aceptó"],
	["rechazo", "Rechazó"],
	["no_respondio", "No respondió"],
] as const;

function QuoteCard({
	workshopID,
	order,
}: {
	workshopID: string;
	order: S["WorkOrderDetail"];
}) {
	const a = actions(workshopID, order.id);
	const quote = useWorkshopMutation(workshopID, a.quote);
	const share = useWorkshopMutation(workshopID, a.share);
	const outcome = useWorkshopMutation(workshopID, a.outcome);
	const [items, setItems] = useState<S["QuoteItem"][]>(
		order.quote?.items || [blank()],
	);
	const [url, setUrl] = useState("");
	useEffect(() => {
		if (order.quote) setItems(order.quote.items);
	}, [order.quote]);
	const update = (i: number, patch: Partial<S["QuoteItem"]>) =>
		setItems(items.map((x, n) => (n === i ? { ...x, ...patch } : x)));
	const total = items.reduce(
		(sum, i) => sum + Number(i.quantity) * Number(i.unit_price),
		0,
	);
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
			<div className="space-y-3">
				<div className="hidden grid-cols-[140px_1fr_80px_110px_36px] gap-2 px-0.5 text-[11.5px] font-medium text-ink-3 sm:grid">
					<span>Tipo</span>
					<span>Descripción</span>
					<span>Cant.</span>
					<span>Precio unit.</span>
					<span />
				</div>
				{items.map((item, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: Items have no IDs.
						key={`item-${i}`}
						className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:grid-cols-[140px_1fr_80px_110px_36px]"
					>
						<Select
							value={item.kind}
							onValueChange={(value) =>
								update(i, { kind: value as S["QuoteItem"]["kind"] })
							}
						>
							<SelectTrigger aria-label="Tipo" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="repuesto">Repuesto</SelectItem>
								<SelectItem value="mano_de_obra">Mano de obra</SelectItem>
							</SelectContent>
						</Select>
						<Input
							aria-label="Descripción"
							placeholder="Descripción"
							className="col-span-2 sm:col-span-1"
							value={item.description}
							onChange={(e) => update(i, { description: e.target.value })}
						/>
						<Input
							aria-label="Cantidad"
							type="number"
							min="0.01"
							step="0.01"
							value={item.quantity}
							onChange={(e) => update(i, { quantity: e.target.value })}
						/>
						<Input
							aria-label="Precio"
							type="number"
							min="0"
							step="0.01"
							value={item.unit_price}
							onChange={(e) => update(i, { unit_price: e.target.value })}
						/>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Quitar ítem"
							className="text-ink-3 hover:text-destructive"
							onClick={() => setItems(items.filter((_, n) => n !== i))}
						>
							<Trash2 className="size-4" />
						</Button>
					</div>
				))}
				<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
					<button
						type="button"
						className="inline-flex items-center gap-1 text-xs font-semibold text-seal hover:underline"
						onClick={() => setItems([...items, blank()])}
					>
						<Plus className="size-3.5" />
						Agregar ítem
					</button>
					<p className="text-[13px] text-ink-3">
						Total cotizado{" "}
						<strong className="ml-1 font-display text-lg text-foreground tabular-nums">
							{money(total)}
						</strong>
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						disabled={quote.isPending}
						onClick={() =>
							quote.mutate(
								{ items },
								{ onSuccess: () => toast.success("Cotización guardada") },
							)
						}
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
							{outcomes.map(([value, label]) => (
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
		</SectionCard>
	);
}

function OrderDataCard({
	workshopID,
	order,
}: {
	workshopID: string;
	order: S["WorkOrderDetail"];
}) {
	const edit = useWorkshopMutation(
		workshopID,
		actions(workshopID, order.id).edit,
	);
	const [reason, setReason] = useState(order.reason);
	const [km, setKm] = useState(order.odometer_km?.toString() || "");
	const [publicNotes, setPublicNotes] = useState(order.public_notes || "");
	const [internalNotes, setInternalNotes] = useState(
		order.internal_notes || "",
	);
	const dirty =
		reason !== order.reason ||
		km !== (order.odometer_km?.toString() || "") ||
		publicNotes !== (order.public_notes || "") ||
		internalNotes !== (order.internal_notes || "");

	return (
		<SectionCard title="Datos de la orden">
			<form
				className="grid gap-3.5"
				onSubmit={(e) => {
					e.preventDefault();
					edit.mutate(
						{
							reason,
							odometer_km: km ? Number(km) : null,
							public_notes: publicNotes || null,
							internal_notes: internalNotes || null,
						},
						{ onSuccess: () => toast.success("Cambios guardados") },
					);
				}}
			>
				<Label className="grid gap-1.5" htmlFor="order-reason">
					Motivo
					<Input
						id="order-reason"
						required
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
				</Label>
				<Label className="grid gap-1.5" htmlFor="order-km">
					Kilometraje
					<Input
						id="order-km"
						type="number"
						min="0"
						value={km}
						onChange={(e) => setKm(e.target.value)}
					/>
				</Label>
				<Label className="grid gap-1.5" htmlFor="order-public">
					<span>
						Notas públicas{" "}
						<span className="font-normal text-ink-3">
							· las ve el propietario
						</span>
					</span>
					<Textarea
						id="order-public"
						value={publicNotes}
						onChange={(e) => setPublicNotes(e.target.value)}
					/>
				</Label>
				<Label className="grid gap-1.5" htmlFor="order-internal">
					<span className="flex items-center gap-1">
						<Lock className="size-3 text-ink-3" />
						Notas internas{" "}
						<span className="font-normal text-ink-3">· solo el taller</span>
					</span>
					<Textarea
						id="order-internal"
						value={internalNotes}
						onChange={(e) => setInternalNotes(e.target.value)}
					/>
				</Label>
				<Button
					variant={dirty ? "default" : "outline"}
					disabled={!dirty || edit.isPending}
				>
					{edit.isPending ? "Guardando…" : "Guardar cambios"}
				</Button>
			</form>
		</SectionCard>
	);
}
