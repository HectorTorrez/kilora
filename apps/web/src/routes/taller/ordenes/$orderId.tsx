import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	ArrowRight,
	BadgeCheck,
	Ban,
	Check,
	Lock,
	Plus,
	Printer,
	Trash2,
	Wrench,
	X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
	kmField,
	moneyField,
	optionalText,
	quantityField,
	requiredText,
} from "@/components/kilora/form-schemas";
import { OrderQuoteCard } from "@/components/kilora/order-quote-card";
import { OwnerInvitation } from "@/components/kilora/owner-invitation";
import { RecommendationsCard } from "@/components/kilora/recommendations";
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
import { useWorkshopMutation } from "@/features/taller/mutation";
import { orderActions, orderQuery } from "@/features/taller/orders";
import { useWorkshopId } from "@/features/taller/session";
import { vehicleQuery } from "@/features/taller/vehicles";
import { categoryLabels } from "@/lib/domain";
import { date, km as formatKm, money, statusLabel } from "@/lib/format";
import { amountCents, formatCents, lineCents } from "@/lib/money";
import { cn } from "@/lib/utils";

type S = components["schemas"];
export const Route = createFileRoute("/taller/ordenes/$orderId")({
	component: OrderPage,
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
	const a = orderActions(workshopID, order.id);
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
					<OrderQuoteCard workshopID={workshopID} order={order} />
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
					<RecommendationsCard
						workshopID={workshopID}
						vehicleID={order.vehicle_id}
						workOrderID={order.id}
						currentKm={order.odometer_km ?? vehicle?.last_odometer_km}
					/>
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
	const a = orderActions(workshopID, order.id);
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
			amountCents(j.labor_price) +
			j.parts.reduce((s, p) => s + lineCents(p.quantity, p.unit_price), 0),
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
										{j.category && (
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
												{money(
													formatCents(lineCents(p.quantity, p.unit_price)),
												)}
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
											const validation = z
												.object({
													name: requiredText("Ingresá el nombre de la pieza"),
													quantity: quantityField,
													price: moneyField(),
												})
												.safeParse({
													name: partName.trim(),
													quantity: partQty || "1",
													price: partPrice,
												});
											if (!validation.success) {
												toast.error(validation.error.issues[0].message);
												return;
											}
											part.mutate(
												{
													jobID: j.id,
													body: {
														name: partName.trim(),
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
						const validation = z
							.object({
								name: requiredText("Ingresá el trabajo realizado"),
								labor: moneyField(),
							})
							.safeParse({ name: jobName.trim(), labor });
						if (!validation.success) {
							toast.error(validation.error.issues[0].message);
							return;
						}
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
					{money(formatCents(total))}
				</span>
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
		orderActions(workshopID, order.id).edit,
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
					const validation = z
						.object({
							reason: requiredText("Ingresá el motivo"),
							km: kmField(),
							publicNotes: optionalText,
							internalNotes: optionalText,
						})
						.safeParse({ reason, km, publicNotes, internalNotes });
					if (!validation.success) {
						toast.error(validation.error.issues[0].message);
						return;
					}
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
