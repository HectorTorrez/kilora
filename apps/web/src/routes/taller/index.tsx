import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Car,
	CheckCircle2,
	ClipboardList,
	Mail,
	Plus,
	Wrench,
} from "lucide-react";
import { useWorkshopId } from "@/components/kilora/app-shell";
import {
	EmptyState,
	OrderStatusBadge,
	orderDot,
	PageBody,
	PageHeader,
	Plate,
	relative,
	SectionCard,
	StatCard,
} from "@/components/kilora/workshop-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ordersQuery, vehiclesQuery } from "@/lib/workshop";
import { Route as TallerRoute } from "@/routes/taller";

type S = components["schemas"];

export const Route = createFileRoute("/taller/")({ component: DashboardPage });

const board: S["WorkOrderStatus"][] = [
	"recibido",
	"diagnostico",
	"en_reparacion",
	"listo",
];

const greeting = () => {
	const hour = Number(
		new Intl.DateTimeFormat("es-SV", {
			hour: "numeric",
			hour12: false,
			timeZone: "America/El_Salvador",
		}).format(new Date()),
	);
	return hour < 12
		? "Buenos días"
		: hour < 19
			? "Buenas tardes"
			: "Buenas noches";
};

function DashboardPage() {
	const workshopID = useWorkshopId();
	const { me } = TallerRoute.useRouteContext();
	const orders = useQuery({
		...ordersQuery(workshopID),
		enabled: !!workshopID,
	});
	const vehicles = useQuery({
		...vehiclesQuery(workshopID),
		enabled: !!workshopID,
	});
	const list = orders.data ?? [];
	const open = list.filter(
		(o) => o.status !== "listo" && o.status !== "cancelado",
	);
	const repairing = list.filter((o) => o.status === "en_reparacion");
	const done = list.filter((o) => o.status === "listo");
	const vlist = vehicles.data ?? [];
	const linked = vlist.filter((v) => v.status === "vinculado");
	const provisional = vlist.filter((v) => v.status === "provisional");
	const loading = orders.isLoading || vehicles.isLoading;
	const firstName = me.user.full_name.split(" ")[0];
	const today = new Intl.DateTimeFormat("es-SV", {
		weekday: "long",
		day: "numeric",
		month: "long",
		timeZone: "America/El_Salvador",
	}).format(new Date());

	return (
		<PageBody>
			<PageHeader
				eyebrow={today}
				title={`${greeting()}, ${firstName}`}
				description="Así está el taller hoy: órdenes en curso, vehículos y clientes por vincular."
				actions={
					<>
						<Button asChild variant="outline">
							<Link to="/taller/vehiculos">
								<Car className="size-4" />
								Vehículos
							</Link>
						</Button>
						<Button asChild>
							<Link to="/taller/ordenes/nueva" search={{ vehiculo: undefined }}>
								<Plus className="size-4" />
								Nueva orden
							</Link>
						</Button>
					</>
				}
			/>

			{(orders.error || vehicles.error) && (
				<Alert variant="destructive">
					<AlertDescription>
						{(orders.error ?? vehicles.error)?.message}
					</AlertDescription>
				</Alert>
			)}

			<section
				aria-label="Indicadores"
				className="grid grid-cols-2 gap-3 lg:grid-cols-4"
			>
				{loading ? (
					Array.from({ length: 4 }, (_, i) => (
						<Skeleton
							// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders.
							key={i}
							className="h-[118px] rounded-lg"
						/>
					))
				) : (
					<>
						<StatCard
							label="Órdenes abiertas"
							value={open.length}
							hint="Recibidas, en diagnóstico o reparación"
							icon={ClipboardList}
							tone="seal"
						/>
						<StatCard
							label="En reparación"
							value={repairing.length}
							hint="Trabajo activo en el taller"
							icon={Wrench}
							tone="warn"
						/>
						<StatCard
							label="Completadas"
							value={done.length}
							hint="Publicadas en el historial"
							icon={CheckCircle2}
							tone="ok"
						/>
						<StatCard
							label="Vehículos"
							value={vlist.length}
							hint={`${linked.length} vinculados · ${provisional.length} provisionales`}
							icon={Car}
						/>
					</>
				)}
			</section>

			<SectionCard
				title="Tablero de órdenes"
				description="Cada columna es un estado. Abrí una tarjeta para avanzarla."
				actions={
					<Button asChild variant="ghost" size="sm">
						<Link to="/taller/ordenes">
							Ver todas
							<ArrowRight className="size-3.5" />
						</Link>
					</Button>
				}
				bodyClassName="p-0 sm:p-0"
			>
				{loading ? (
					<Skeleton className="m-5 h-40" />
				) : !list.length ? (
					<EmptyState
						icon={ClipboardList}
						title="Todavía no hay órdenes"
						description="Registrá la primera orden y aparecerá acá según su estado."
						action={
							<Button asChild>
								<Link
									to="/taller/ordenes/nueva"
									search={{ vehiculo: undefined }}
								>
									Nueva orden
								</Link>
							</Button>
						}
					/>
				) : (
					<div className="grid divide-y md:grid-cols-4 md:divide-x md:divide-y-0">
						{board.map((status) => {
							const items = list.filter((o) => o.status === status);
							return (
								<div key={status} className="flex min-w-0 flex-col">
									<div className="flex items-center gap-2 px-4 pt-4 pb-2">
										<span
											className={cn("size-2 rounded-full", orderDot(status))}
										/>
										<p className="text-[12.5px] font-semibold">
											{statusLabel(status)}
										</p>
										<span className="ml-auto rounded-full bg-secondary px-1.5 font-mono text-[11px] text-ink-2 tabular-nums">
											{items.length}
										</span>
									</div>
									<ul className="flex flex-col gap-2 px-3 pb-4">
										{items.slice(0, 4).map((o) => (
											<li key={o.id}>
												<Link
													to="/taller/ordenes/$orderId"
													params={{ orderId: o.id }}
													className="pressable block rounded-md border bg-background/50 p-3 hover:border-seal/40 hover:bg-seal-soft/40"
												>
													<div className="flex items-center justify-between gap-2">
														<Plate value={o.plate} />
														<span className="font-mono text-[11px] text-ink-3">
															#{o.number}
														</span>
													</div>
													<p className="mt-2 truncate text-[13px] font-medium">
														{o.reason}
													</p>
													<p className="mt-0.5 truncate text-xs text-ink-3">
														{o.make} {o.model} · {relative(o.received_at)}
													</p>
												</Link>
											</li>
										))}
										{items.length === 0 && (
											<li className="rounded-md border border-dashed px-3 py-5 text-center text-xs text-ink-3">
												Sin órdenes
											</li>
										)}
										{items.length > 4 && (
											<li>
												<Link
													to="/taller/ordenes"
													search={{ estado: status }}
													className="block px-1 text-xs font-semibold text-seal hover:underline"
												>
													+{items.length - 4} más
												</Link>
											</li>
										)}
									</ul>
								</div>
							);
						})}
					</div>
				)}
			</SectionCard>

			<div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
				<SectionCard
					title="Actividad reciente"
					description="Últimas órdenes recibidas"
					bodyClassName="p-0 sm:p-0"
				>
					{loading ? (
						<Skeleton className="m-5 h-32" />
					) : !list.length ? (
						<p className="p-6 text-center text-sm text-ink-3">
							Sin actividad todavía.
						</p>
					) : (
						<ul className="divide-y">
							{list.slice(0, 6).map((o) => (
								<li key={o.id}>
									<Link
										to="/taller/ordenes/$orderId"
										params={{ orderId: o.id }}
										className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 sm:px-5"
									>
										<Plate value={o.plate} />
										<div className="min-w-0 flex-1">
											<p className="truncate text-[13px] font-medium">
												{o.reason}
											</p>
											<p className="truncate text-xs text-ink-3">
												#{o.number} · {o.make} {o.model}
											</p>
										</div>
										<div className="hidden text-right sm:block">
											<OrderStatusBadge status={o.status} />
											<p className="mt-1 text-[11px] text-ink-3">
												{relative(o.received_at)}
											</p>
										</div>
									</Link>
								</li>
							))}
						</ul>
					)}
				</SectionCard>

				<SectionCard
					title="Clientes por vincular"
					description="Vehículos provisionales sin propietario con cuenta"
					bodyClassName="p-0 sm:p-0"
				>
					{loading ? (
						<Skeleton className="m-5 h-32" />
					) : !provisional.length ? (
						<EmptyState
							icon={CheckCircle2}
							title="Todo vinculado"
							description="Cada vehículo tiene a su propietario invitado."
						/>
					) : (
						<ul className="divide-y">
							{provisional.slice(0, 5).map((v) => (
								<li key={v.id}>
									<Link
										to="/taller/vehiculos/$vehicleId"
										params={{ vehicleId: v.id }}
										className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 sm:px-5"
									>
										<Plate value={v.plate} />
										<div className="min-w-0 flex-1">
											<p className="truncate text-[13px] font-medium">
												{v.make} {v.model} {v.year ?? ""}
											</p>
											<p className="truncate text-xs text-ink-3">
												{v.contact_name || "Sin contacto"}
											</p>
										</div>
										<span className="inline-flex items-center gap-1 text-xs font-semibold text-seal">
											<Mail className="size-3.5" />
											Invitar
										</span>
									</Link>
								</li>
							))}
						</ul>
					)}
				</SectionCard>
			</div>
		</PageBody>
	);
}
