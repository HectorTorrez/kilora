import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	BadgeCheck,
	Ban,
	Check,
	Lock,
	MoreHorizontal,
	Pencil,
	Plus,
	Printer,
	Trash2,
	Wrench,
	X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	CancelOrderDialog,
	EditOrderDialog,
	JobDialog,
	PartDialog,
} from "@/components/kilora/order-dialogs";
import { OrderQuoteCard } from "@/components/kilora/order-quote-card";
import { OwnerInvitation } from "@/components/kilora/owner-invitation";
import { RecommendationsCard } from "@/components/kilora/recommendations";
import {
	BackLink,
	DetailList,
	EmptyState,
	Missing,
	OrderStatusBadge,
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkshopMutation } from "@/features/taller/mutation";
import { orderActions, orderQuery } from "@/features/taller/orders";
import { useWorkshopId } from "@/features/taller/session";
import { vehicleQuery } from "@/features/taller/vehicles";
import { categoryLabels } from "@/lib/domain";
import { date, km as formatKm, money, phone, statusLabel } from "@/lib/format";
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
	const [editOpen, setEditOpen] = useState(false);
	const nextStatus = next[order.status];
	const closed = order.status === "listo" || order.status === "cancelado";
	const step = flow.indexOf(order.status);

	return (
		<PageBody>
			<PageHeader
				back={<BackLink to="/taller/ordenes">Órdenes</BackLink>}
				eyebrow={`Orden #${order.number} · recibida el ${date(order.received_at)}`}
				title={
					<>
						<Plate value={vehicle?.plate} className="text-base" />
						{vehicle ? (
							`${vehicle.make} ${vehicle.model}`
						) : (
							<Skeleton className="h-7 w-48" />
						)}
					</>
				}
				badges={
					<>
						<OrderStatusBadge status={order.status} />
						{order.history_record_id && (
							<span className="inline-flex items-center gap-1 rounded-full bg-seal-soft px-2 py-0.5 text-[11.5px] font-semibold text-seal">
								<BadgeCheck className="size-3.5" />
								Publicada en el historial
							</span>
						)}
					</>
				}
				description={order.reason}
				actions={
					<>
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
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										size="icon"
										aria-label="Más acciones"
									>
										<MoreHorizontal className="size-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onSelect={() => setEditOpen(true)}>
										<Pencil />
										Editar datos de la orden
									</DropdownMenuItem>
									<DropdownMenuItem
										variant="destructive"
										onSelect={() => setCancelOpen(true)}
									>
										<Ban />
										Cancelar orden
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
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
					</>
				}
			/>

			{order.status === "cancelado" ? (
				<Alert variant="destructive">
					<Ban />
					<AlertDescription>
						Orden cancelada
						{order.cancelled_at ? ` el ${date(order.cancelled_at)}` : ""}
						{order.cancel_reason ? `. Motivo: ${order.cancel_reason}` : ""}
					</AlertDescription>
				</Alert>
			) : (
				<div className="space-y-2">
					<ol
						className="grid grid-cols-4 gap-2"
						aria-label="Progreso de la orden"
					>
						{flow.map((s, i) => (
							<li key={s} aria-current={i === step ? "step" : undefined}>
								<div
									className={cn(
										"h-1.5 rounded-full bg-secondary",
										i < step && "bg-seal",
										i === step && (s === "listo" ? "bg-ok" : "bg-seal/60"),
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
					{nextStatus === "listo" && (
						<p className="text-xs text-ink-3">
							Al marcarla como lista se publica en el historial del vehículo y
							ya no se puede editar. Si algo queda mal, se agrega una
							corrección.
						</p>
					)}
				</div>
			)}

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
				<div className="min-w-0 space-y-6">
					<JobsCard workshopID={workshopID} order={order} locked={closed} />
					<OrderQuoteCard
						workshopID={workshopID}
						order={order}
						vehicle={
							vehicle
								? [vehicle.make, vehicle.model, vehicle.year]
										.filter(Boolean)
										.join(" ")
								: undefined
						}
					/>
				</div>
				<div className="space-y-6">
					<SectionCard
						title="Datos de la orden"
						actions={
							!closed && (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setEditOpen(true)}
								>
									<Pencil className="size-3.5" />
									Editar
								</Button>
							)
						}
					>
						<div className="space-y-4">
							<DetailList
								items={[
									{ label: "Motivo", value: order.reason },
									{
										label: "Km de ingreso",
										value:
											order.odometer_km != null && formatKm(order.odometer_km),
										mono: true,
									},
								]}
							/>
							<NoteBlock
								label="Notas para el propietario"
								value={order.public_notes}
							/>
							<NoteBlock
								label={
									<span className="inline-flex items-center gap-1">
										<Lock className="size-3" aria-hidden="true" />
										Notas internas
									</span>
								}
								value={order.internal_notes}
							/>
						</div>
					</SectionCard>
					<SectionCard
						title="Vehículo y contacto"
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
						<DetailList
							items={[
								{ label: "Cliente", value: vehicle?.customer?.full_name },
								{
									label: "Teléfono",
									value: phone(vehicle?.customer?.phone),
									mono: true,
								},
								{ label: "Año", value: vehicle?.year },
							]}
						/>
					</SectionCard>
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

			<EditOrderDialog
				workshopID={workshopID}
				order={order}
				open={editOpen}
				onOpenChange={setEditOpen}
			/>
			<CancelOrderDialog
				workshopID={workshopID}
				order={order}
				open={cancelOpen}
				onOpenChange={setCancelOpen}
			/>
		</PageBody>
	);
}

function NoteBlock({
	label,
	value,
}: {
	label: React.ReactNode;
	value?: string | null;
}) {
	return (
		<div className="border-t pt-3 text-[13px]">
			<p className="text-ink-3">{label}</p>
			<p className="mt-1 whitespace-pre-line">
				{value || <Missing>Sin notas</Missing>}
			</p>
		</div>
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
	const deleteJob = useWorkshopMutation(workshopID, a.deleteJob);
	const deletePart = useWorkshopMutation(workshopID, a.deletePart);
	const [jobOpen, setJobOpen] = useState(false);
	const [partFor, setPartFor] = useState<{
		id: string;
		description: string;
	} | null>(null);
	const [removing, setRemoving] = useState<S["JobDetail"] | null>(null);
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
			description="Lo que se le cobra al cliente en esta orden."
			actions={
				!locked && (
					<Button size="sm" onClick={() => setJobOpen(true)}>
						<Plus className="size-4" />
						Agregar trabajo
					</Button>
				)
			}
			bodyClassName="p-0 sm:p-0"
		>
			{!order.jobs.length ? (
				<EmptyState
					icon={Wrench}
					title="Sin trabajos todavía"
					description="Agregá cada trabajo con su mano de obra; después le sumás las piezas que usaste."
					action={
						!locked && (
							<Button variant="outline" onClick={() => setJobOpen(true)}>
								<Plus className="size-4" />
								Agregar trabajo
							</Button>
						)
					}
				/>
			) : (
				<ul className="divide-y">
					{order.jobs.map((j) => (
						<li key={j.id} className="px-4 py-4 sm:px-5">
							<div className="flex items-start gap-3">
								<div className="min-w-0 flex-1">
									<p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold">
										{j.description}
										{j.category && (
											<span className="rounded bg-secondary px-1.5 py-px text-[10.5px] font-medium text-ink-2">
												{categoryLabels[j.category]}
											</span>
										)}
									</p>
									<p className="text-xs text-ink-3">Mano de obra</p>
								</div>
								<span className="pt-0.5 font-mono text-[13px] tabular-nums">
									{money(j.labor_price || 0)}
								</span>
								{!locked && (
									<Button
										variant="ghost"
										size="icon"
										className="-my-1 size-8 text-ink-3 hover:text-destructive"
										aria-label={`Eliminar trabajo ${j.description}`}
										title="Eliminar trabajo"
										onClick={() => setRemoving(j)}
									>
										<Trash2 className="size-4" />
									</Button>
								)}
							</div>
							{j.parts.length > 0 && (
								<ul className="mt-3 space-y-1.5 border-l-2 pl-3">
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
													className="size-8 text-ink-3 hover:text-destructive"
													aria-label={`Quitar pieza ${p.name}`}
													title="Quitar pieza"
													disabled={deletePart.isPending}
													onClick={() =>
														deletePart.mutate(
															{ jobID: j.id, partID: p.id },
															{
																onSuccess: () => toast.success("Pieza quitada"),
															},
														)
													}
												>
													<X className="size-3.5" />
												</Button>
											)}
										</li>
									))}
								</ul>
							)}
							{!locked && (
								<Button
									variant="ghost"
									size="sm"
									className="mt-2 -ml-2 text-seal hover:text-seal"
									onClick={() => setPartFor(j)}
								>
									<Plus className="size-3.5" />
									Agregar pieza
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
			<div className="flex items-center justify-between border-t bg-secondary/30 px-4 py-3 sm:px-5">
				<span className="text-[13px] font-medium text-ink-2">
					Total a cobrar
				</span>
				<span className="font-display text-xl font-bold tabular-nums">
					{money(formatCents(total))}
				</span>
			</div>

			<JobDialog
				workshopID={workshopID}
				orderID={order.id}
				open={jobOpen}
				onOpenChange={setJobOpen}
			/>
			<PartDialog
				workshopID={workshopID}
				orderID={order.id}
				job={partFor}
				onOpenChange={(open) => !open && setPartFor(null)}
			/>
			<Dialog
				open={!!removing}
				onOpenChange={(open) => !open && setRemoving(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>¿Eliminar «{removing?.description}»?</DialogTitle>
						<DialogDescription>
							{removing?.parts.length
								? `También se quitan sus ${removing.parts.length} pieza(s).`
								: "Se quita de la orden y del total a cobrar."}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRemoving(null)}>
							Volver
						</Button>
						<Button
							variant="destructive"
							disabled={deleteJob.isPending}
							onClick={() =>
								removing &&
								deleteJob.mutate(removing.id, {
									onSuccess: () => {
										toast.success("Trabajo eliminado");
										setRemoving(null);
									},
								})
							}
						>
							Eliminar trabajo
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</SectionCard>
	);
}
