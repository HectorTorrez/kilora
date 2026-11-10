import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Car, Plus } from "lucide-react";
import { useState } from "react";
import { ListPagination } from "@/components/kilora/list-pagination";
import { QueryContent } from "@/components/kilora/query-content";
import { VehicleForm } from "@/components/kilora/vehicle-form";
import {
	EmptyState,
	PageBody,
	PageHeader,
	Plate,
	relative,
	VehicleStatusBadge,
} from "@/components/kilora/workshop-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useWorkshopId } from "@/features/taller/session";
import { vehiclesPageQuery } from "@/features/taller/vehicles";
import { km, phone } from "@/lib/format";
import { useListPage } from "@/lib/pagination";
import { cn } from "@/lib/utils";

type VStatus = Exclude<components["schemas"]["VehicleStatus"], "archivado">;

export const Route = createFileRoute("/taller/vehiculos/")({
	component: VehiclesPage,
});

const filters: [VStatus | "", string][] = [
	["", "Todos"],
	["provisional", "Provisionales"],
	["vinculado", "Vinculados"],
];

function VehiclesPage() {
	const workshopID = useWorkshopId();
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<VStatus | "">("");
	const [open, setOpen] = useState(false);
	const q = query.trim().toLowerCase().replace(/[\s-]/g, "");
	const { page, offset, setPage } = useListPage(
		JSON.stringify([workshopID, q, filter]),
	);
	const { data, isLoading, error, isFetching } = useQuery({
		...vehiclesPageQuery(workshopID, q, filter || undefined, offset),
		enabled: !!workshopID,
	});
	const rows = data?.items ?? [];

	return (
		<PageBody>
			<PageHeader
				eyebrow="Operación"
				title="Vehículos"
				description="Todos los vehículos que atendió el taller. Los provisionales pasan a vinculados cuando el propietario acepta la invitación."
				actions={
					<>
						<Button variant="outline" onClick={() => setOpen(true)}>
							<Plus className="size-4" />
							Registrar vehículo
						</Button>
						<Button asChild>
							<Link to="/taller/ordenes/nueva" search={{ vehiculo: undefined }}>
								Nueva orden
							</Link>
						</Button>
					</>
				}
			/>

			<Card className="gap-0 overflow-hidden py-0 shadow-none">
				<div className="flex flex-wrap items-center gap-3 border-b p-3 sm:px-4">
					<SearchInput
						containerClassName="min-w-[220px] flex-1 sm:max-w-sm"
						aria-label="Buscar vehículos"
						placeholder="Placa, marca, contacto o teléfono"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<fieldset className="inline-flex rounded-md border bg-background p-0.5">
						<legend className="sr-only">Filtrar por estado</legend>
						{filters.map(([value, label]) => (
							<button
								key={value || "all"}
								type="button"
								aria-pressed={filter === value}
								onClick={() => setFilter(value)}
								className={cn(
									"rounded px-2.5 py-1 text-[12.5px] font-medium text-ink-3 hover:text-foreground",
									filter === value && "bg-card text-foreground shadow-xs",
								)}
							>
								{label}
								<span className="ml-1.5 font-mono text-[10.5px] text-ink-3 tabular-nums">
									{data?.counts[value] ?? 0}
								</span>
							</button>
						))}
					</fieldset>
				</div>

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
								q || filter
									? "Ningún vehículo coincide"
									: "Todavía no hay vehículos"
							}
							description={
								q || filter
									? "Probá con otra búsqueda o quitá el filtro."
									: "Registrá un vehículo provisional; no hace falta que el cliente tenga cuenta."
							}
							action={
								!q &&
								!filter && (
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
								<TableHead className="pl-4">Placa</TableHead>
								<TableHead>Vehículo</TableHead>
								<TableHead className="hidden md:table-cell">Contacto</TableHead>
								<TableHead className="text-right">Kilometraje</TableHead>
								<TableHead>Estado</TableHead>
								<TableHead className="hidden pr-4 text-right lg:table-cell">
									Última actividad
								</TableHead>
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
									<TableCell className="pl-4">
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
										<p className="text-xs text-ink-3">{v.year ?? "—"}</p>
									</TableCell>
									<TableCell className="hidden md:table-cell">
										<p className="text-[13px]">{v.contact_name || "—"}</p>
										<p className="font-mono text-xs text-ink-3">
											{phone(v.contact_phone)}
										</p>
									</TableCell>
									<TableCell className="text-right font-mono text-[12.5px] tabular-nums">
										{km(v.last_odometer_km)}
									</TableCell>
									<TableCell>
										<VehicleStatusBadge status={v.status} />
									</TableCell>
									<TableCell className="hidden pr-4 text-right text-[12.5px] text-ink-3 lg:table-cell">
										{relative(v.last_activity_at)}
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

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Registrar vehículo provisional</DialogTitle>
						<DialogDescription>
							Solo marca y modelo son obligatorios. Podés invitar al propietario
							después.
						</DialogDescription>
					</DialogHeader>
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
				</DialogContent>
			</Dialog>
		</PageBody>
	);
}
