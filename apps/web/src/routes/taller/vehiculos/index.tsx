import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Car, Plus } from "lucide-react";
import { useState } from "react";
import {
	type DateRange,
	DateRangeFilter,
} from "@/components/kilora/date-range-filter";
import { ClearFilters, FacetFilter } from "@/components/kilora/facet-filter";
import { FormDialog } from "@/components/kilora/form-dialog";
import { ListPagination } from "@/components/kilora/list-pagination";
import { QueryContent } from "@/components/kilora/query-content";
import { SortableHead, useTableSort } from "@/components/kilora/sortable-table";
import { VehicleForm } from "@/components/kilora/vehicle-form";
import {
	EmptyState,
	ListToolbar,
	Missing,
	PageBody,
	PageHeader,
	Plate,
	VehicleStatusBadge,
} from "@/components/kilora/workshop-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useWorkshopId } from "@/features/taller/session";
import { vehiclesPageQuery } from "@/features/taller/vehicles";
import { km, phone, shortDate } from "@/lib/format";
import { useListPage } from "@/lib/pagination";

type VStatus = Exclude<components["schemas"]["VehicleStatus"], "archivado">;

export const Route = createFileRoute("/taller/vehiculos/")({
	component: VehiclesPage,
});

const statusOptions: { value: VStatus; label: string; dot: string }[] = [
	{ value: "provisional", label: "Provisional", dot: "bg-ink-3" },
	{ value: "vinculado", label: "Vinculado", dot: "bg-seal" },
];

function VehiclesPage() {
	const workshopID = useWorkshopId();
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [statuses, setStatuses] = useState<VStatus[]>([]);
	const [range, setRange] = useState<DateRange>({});
	const [open, setOpen] = useState(false);
	const q = query.trim().toLowerCase().replace(/[\s-]/g, "");
	const { page, offset, setPage } = useListPage(
		JSON.stringify([workshopID, q, statuses, range]),
	);
	const { data, isLoading, error, isFetching } = useQuery({
		...vehiclesPageQuery(workshopID, q, statuses, offset, range),
		enabled: !!workshopID,
	});
	const { rows, sort, toggle } = useTableSort(data?.items ?? [], {
		plate: (v) => v.plate,
		vehicle: (v) => `${v.make} ${v.model} ${v.year ?? ""}`,
		customer: (v) => v.customer?.full_name.toLowerCase(),
		km: (v) => v.last_odometer_km,
		status: (v) => v.status,
		activity: (v) => v.last_activity_at,
	});
	const filtering = !!q || statuses.length > 0 || !!range.from || !!range.to;

	const clearFilters = () => {
		setQuery("");
		setStatuses([]);
		setRange({});
	};
	return (
		<PageBody>
			<PageHeader
				eyebrow="Operación"
				title="Vehículos"
				description="Todos los vehículos que atendió el taller. Los provisionales pasan a vinculados cuando el propietario acepta la invitación."
				actions={
					<Button onClick={() => setOpen(true)}>
						<Plus className="size-4" />
						Registrar vehículo
					</Button>
				}
			/>

			<Card className="gap-0 overflow-hidden py-0 shadow-none">
				<ListToolbar>
					<SearchInput
						containerClassName="min-w-[220px] flex-1 sm:max-w-sm"
						aria-label="Buscar vehículos"
						placeholder="Buscar por placa, marca, cliente o teléfono"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<DateRangeFilter
						label="Última actividad"
						value={range}
						onChange={setRange}
					/>
					<ClearFilters show={filtering} onClear={clearFilters} />
				</ListToolbar>
				<QueryContent
					pending={isLoading}
					error={error}
					empty={!rows.length}
					errorClassName="m-4"
					loading={
						<div className="space-y-2 p-4">
							<Skeleton className="h-11" />
							<Skeleton className="h-11" />
							<Skeleton className="h-11" />
						</div>
					}
					emptyState={
						<EmptyState
							icon={Car}
							title={
								filtering
									? "Ningún vehículo coincide"
									: "Todavía no hay vehículos"
							}
							description={
								filtering
									? "Probá con otra búsqueda o quitá el filtro."
									: "Registrá un vehículo provisional; no hace falta que el cliente tenga cuenta."
							}
							action={
								filtering ? (
									<Button variant="outline" onClick={clearFilters}>
										Quitar filtros
									</Button>
								) : (
									<Button onClick={() => setOpen(true)}>
										Registrar vehículo
									</Button>
								)
							}
						/>
					}
				>
					<Table>
						<TableHeader>
							<TableRow className="bg-secondary/40 hover:bg-secondary/40">
								<SortableHead
									sortKey="plate"
									sort={sort}
									onSort={toggle}
									className="pl-3 sm:pl-4"
								>
									Placa
								</SortableHead>
								<SortableHead sortKey="vehicle" sort={sort} onSort={toggle}>
									Vehículo
								</SortableHead>
								<SortableHead
									sortKey="customer"
									sort={sort}
									onSort={toggle}
									className="hidden md:table-cell"
								>
									Cliente
								</SortableHead>
								<SortableHead
									sortKey="km"
									sort={sort}
									onSort={toggle}
									className="hidden text-right sm:table-cell"
									align="right"
								>
									Kilometraje
								</SortableHead>
								<SortableHead
									sortKey="activity"
									sort={sort}
									onSort={toggle}
									className="hidden text-right lg:table-cell"
									align="right"
								>
									Última actividad
								</SortableHead>
								<SortableHead
									sortKey="status"
									sort={sort}
									onSort={toggle}
									className="pr-3 sm:pr-4"
									filter={
										<FacetFilter
											compact
											label="Estado"
											selected={statuses}
											onChange={setStatuses}
											options={statusOptions.map((o) => ({
												...o,
												count: data?.counts[o.value] ?? 0,
											}))}
										/>
									}
								>
									Estado
								</SortableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((v) => (
								<TableRow
									key={v.id}
									className="cursor-pointer"
									onClick={() =>
										navigate({
											to: "/taller/vehiculos/$vehicleId",
											params: { vehicleId: v.id },
										})
									}
								>
									<TableCell className="pl-3 sm:pl-4">
										<Link
											to="/taller/vehiculos/$vehicleId"
											params={{ vehicleId: v.id }}
											onClick={(e) => e.stopPropagation()}
											className="rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
										>
											<Plate value={v.plate} />
										</Link>
									</TableCell>
									<TableCell>
										<p className="text-[13px] font-medium">
											{v.make} {v.model}
										</p>
										{v.year ? (
											<p className="text-xs text-ink-3">{v.year}</p>
										) : null}
									</TableCell>
									<TableCell className="hidden md:table-cell">
										<p className="text-[13px]">
											{v.customer ? (
												<Link
													to="/taller/clientes/$customerId"
													params={{ customerId: v.customer.id }}
													onClick={(e) => e.stopPropagation()}
													className="hover:underline"
												>
													{v.customer.full_name}
												</Link>
											) : (
												<Missing>Sin cliente</Missing>
											)}
										</p>
										<p className="font-mono text-xs text-ink-3">
											{phone(v.customer?.phone)}
										</p>
									</TableCell>
									<TableCell className="hidden text-right font-mono text-[12.5px] tabular-nums sm:table-cell">
										{v.last_odometer_km != null ? (
											km(v.last_odometer_km)
										) : (
											<Missing />
										)}
									</TableCell>
									<TableCell className="hidden text-right text-[12.5px] text-ink-3 lg:table-cell">
										{shortDate(v.last_activity_at)}
									</TableCell>
									<TableCell className="pr-3 sm:pr-4">
										<VehicleStatusBadge status={v.status} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</QueryContent>
				<ListPagination
					page={page}
					total={data?.total}
					onPageChange={setPage}
					pending={isFetching}
				/>
			</Card>

			<FormDialog
				open={open}
				onOpenChange={setOpen}
				title="Registrar vehículo provisional"
				description="Cliente, marca y modelo son obligatorios. Podés invitar al propietario después."
			>
				<VehicleForm
					workshopID={workshopID}
					onCreated={(created) => {
						setOpen(false);
						void navigate({
							to: "/taller/vehiculos/$vehicleId",
							params: { vehicleId: created.id },
						});
					}}
				/>
			</FormDialog>
		</PageBody>
	);
}
