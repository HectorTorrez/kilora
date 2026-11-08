import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ClipboardList, MessageCircle, Plus } from "lucide-react";
import {
	HistoryTimeline,
	lastByCategory,
} from "@/components/kilora/history-timeline";
import { OwnerInvitation } from "@/components/kilora/owner-invitation";
import { RecommendationsCard } from "@/components/kilora/recommendations";
import {
	OrderStatusBadge,
	PageBody,
	Plate,
	relative,
	SectionCard,
	VehicleStatusBadge,
} from "@/components/kilora/workshop-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ordersQuery } from "@/features/taller/orders";
import { useWorkshopId } from "@/features/taller/session";
import { historyQuery, vehicleQuery } from "@/features/taller/vehicles";
import { date, day, km } from "@/lib/format";

export const Route = createFileRoute("/taller/vehiculos/$vehicleId")({
	component: VehiclePage,
});

function VehiclePage() {
	const { vehicleId } = Route.useParams();
	const workshopID = useWorkshopId();
	const vehicle = useQuery({
		...vehicleQuery(workshopID, vehicleId),
		enabled: !!workshopID,
	});
	const history = useQuery({
		...historyQuery(workshopID, vehicleId),
		enabled: !!workshopID,
	});
	const orders = useQuery({
		...ordersQuery(workshopID),
		enabled: !!workshopID,
	});

	if (vehicle.isLoading)
		return (
			<PageBody>
				<Skeleton className="h-24" />
				<div className="grid gap-6 lg:grid-cols-[1fr_340px]">
					<Skeleton className="h-80" />
					<Skeleton className="h-80" />
				</div>
			</PageBody>
		);
	if (vehicle.error || !vehicle.data)
		return (
			<PageBody>
				<Alert variant="destructive">
					<AlertDescription>
						{vehicle.error?.message || "Vehículo no disponible"}
					</AlertDescription>
				</Alert>
			</PageBody>
		);

	const v = vehicle.data;
	const records = history.data?.records ?? [];
	const vehicleOrders = (orders.data ?? []).filter(
		(o) => o.vehicle_id === v.id,
	);
	const openOrder = vehicleOrders.find(
		(o) => o.status !== "listo" && o.status !== "cancelado",
	);
	const phone = v.contact_phone?.replace(/\D/g, "");

	return (
		<PageBody>
			<div>
				<Link
					to="/taller/vehiculos"
					className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-foreground"
				>
					<ArrowLeft className="size-3.5" />
					Vehículos
				</Link>
				<div className="mt-3 flex flex-wrap items-end justify-between gap-4">
					<div className="flex flex-wrap items-center gap-4">
						<Plate value={v.plate} className="px-3 py-1.5 text-xl" />
						<div>
							<h1 className="font-display text-[26px] leading-tight font-bold">
								{v.make} {v.model}
								{v.year && (
									<span className="ml-2 font-normal text-ink-3">{v.year}</span>
								)}
							</h1>
							<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-3">
								<VehicleStatusBadge status={v.status} />
								<span>Registrado el {date(v.created_at)}</span>
							</div>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						{phone && (
							<Button asChild variant="outline">
								<a
									href={`https://wa.me/${phone}`}
									target="_blank"
									rel="noreferrer"
								>
									<MessageCircle className="size-4" />
									WhatsApp
								</a>
							</Button>
						)}
						{openOrder ? (
							<Button asChild>
								<Link
									to="/taller/ordenes/$orderId"
									params={{ orderId: openOrder.id }}
								>
									<ClipboardList className="size-4" />
									Ver orden abierta #{openOrder.number}
								</Link>
							</Button>
						) : (
							<Button asChild>
								<Link to="/taller/ordenes/nueva" search={{ vehiculo: v.id }}>
									<Plus className="size-4" />
									Nueva orden
								</Link>
							</Button>
						)}
					</div>
				</div>
			</div>

			<dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-line md:grid-cols-4">
				{[
					["Kilometraje", km(v.last_odometer_km)],
					["Servicios publicados", String(records.length)],
					["Órdenes en el taller", String(vehicleOrders.length)],
					["Última actividad", relative(v.last_activity_at)],
				].map(([label, value]) => (
					<div key={label} className="bg-card px-4 py-3">
						<dt className="text-xs text-ink-3">{label}</dt>
						<dd className="mt-1 font-display text-lg font-bold tabular-nums">
							{value}
						</dd>
					</div>
				))}
			</dl>

			<div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
				<div className="space-y-6">
					<SectionCard
						title="Historial del vehículo"
						description="Proyección para tu taller: ves tus costos y notas; de otros talleres, solo trabajo, fecha y kilometraje."
					>
						{history.isLoading ? (
							<Skeleton className="h-40" />
						) : history.error ? (
							<Alert variant="destructive">
								<AlertDescription>{history.error.message}</AlertDescription>
							</Alert>
						) : (
							<HistoryTimeline records={records} />
						)}
					</SectionCard>

					<SectionCard
						title="Órdenes de este vehículo"
						bodyClassName="p-0 sm:p-0"
					>
						{!vehicleOrders.length ? (
							<p className="p-6 text-center text-sm text-ink-3">
								Sin órdenes registradas en este taller.
							</p>
						) : (
							<ul className="divide-y">
								{vehicleOrders.map((o) => (
									<li key={o.id}>
										<Link
											to="/taller/ordenes/$orderId"
											params={{ orderId: o.id }}
											className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 sm:px-5"
										>
											<span className="w-12 font-mono text-[13px] font-semibold text-seal">
												#{o.number}
											</span>
											<span className="min-w-0 flex-1 truncate text-[13px]">
												{o.reason}
											</span>
											<OrderStatusBadge status={o.status} />
											<span className="hidden w-28 text-right text-xs text-ink-3 sm:block">
												{relative(o.received_at)}
											</span>
										</Link>
									</li>
								))}
							</ul>
						)}
					</SectionCard>
				</div>

				<div className="space-y-6">
					<RecommendationsCard
						workshopID={workshopID}
						vehicleID={v.id}
						currentKm={v.last_odometer_km}
					/>

					<SectionCard title="Ficha">
						<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[13px]">
							<dt className="text-ink-3">Contacto</dt>
							<dd className="text-right font-medium">
								{v.contact_name || "—"}
							</dd>
							<dt className="text-ink-3">Teléfono</dt>
							<dd className="text-right font-mono">{v.contact_phone || "—"}</dd>
							<dt className="text-ink-3">VIN</dt>
							<dd className="truncate text-right font-mono">{v.vin || "—"}</dd>
							<dt className="text-ink-3">Año</dt>
							<dd className="text-right">{v.year ?? "—"}</dd>
						</dl>
					</SectionCard>

					<SectionCard
						title="Último cambio por pieza"
						description="Útil para la hoja del mecánico"
						bodyClassName="p-0 sm:p-0"
					>
						<ul className="divide-y text-[13px]">
							{lastByCategory(records).map(({ category, label, record }) => (
								<li
									key={category}
									className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
								>
									<span className="font-medium">{label}</span>
									{record ? (
										<span className="text-right font-mono text-xs text-ink-2">
											{day(record.performed_on)}
											{record.odometer_km != null && (
												<span className="block text-ink-3">
													{km(record.odometer_km)}
												</span>
											)}
										</span>
									) : (
										<span className="text-xs text-ink-3">Sin registro</span>
									)}
								</li>
							))}
						</ul>
					</SectionCard>

					<OwnerInvitation
						workshopID={workshopID}
						vehicleID={v.id}
						linked={v.owner_linked ?? v.status === "vinculado"}
						name={v.owner_name}
					/>
				</div>
			</div>
		</PageBody>
	);
}
