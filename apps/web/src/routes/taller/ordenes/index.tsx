import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ClipboardList, Plus } from "lucide-react";
import { useState } from "react";
import {
	type DateRange,
	DateRangeFilter,
} from "@/components/kilora/date-range-filter";
import { ClearFilters, FacetFilter } from "@/components/kilora/facet-filter";
import { ListPagination } from "@/components/kilora/list-pagination";
import { QueryContent } from "@/components/kilora/query-content";
import { SortableHead, useTableSort } from "@/components/kilora/sortable-table";
import {
	EmptyState,
	ListToolbar,
	OrderStatusBadge,
	orderDot,
	PageBody,
	PageHeader,
	Plate,
} from "@/components/kilora/workshop-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ordersPageQuery } from "@/features/taller/orders";
import {
	useActiveBranch,
	useTallerContext,
	useWorkshopId,
} from "@/features/taller/session";
import { date, shortDate, statusLabel } from "@/lib/format";
import { useListPage } from "@/lib/pagination";

type Status = components["schemas"]["WorkOrderStatus"];
const statusValues: Status[] = [
	"recibido",
	"diagnostico",
	"en_reparacion",
	"listo",
	"cancelado",
];

export const Route = createFileRoute("/taller/ordenes/")({
	// ?estado=recibido,diagnostico: uno o varios estados separados por coma.
	validateSearch: (
		search: Record<string, unknown>,
	): { estado?: string; desde?: string; hasta?: string } => {
		const values = String(search.estado ?? "")
			.split(",")
			.filter((v): v is Status => statusValues.includes(v as Status));
		const day = (v: unknown) =>
			typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
		return {
			estado: values.length ? values.join(",") : undefined,
			desde: day(search.desde),
			hasta: day(search.hasta),
		};
	},
	loader: async ({ context }) => {
		const workshopID = context.me.memberships[0].workshop_id;
		return context.queryClient.ensureQueryData(ordersPageQuery(workshopID));
	},
	component: OrdersPage,
});

function OrdersPage() {
	const workshopID = useWorkshopId();
	const initial = Route.useLoaderData();
	const { estado, desde, hasta } = Route.useSearch();
	const range = { from: desde, to: hasta };
	const statuses = (estado ? estado.split(",") : []) as Status[];
	const navigate = useNavigate({ from: "/taller/ordenes/" });
	const { me } = useTallerContext();
	const branches = me.memberships.filter((m) => m.workshop_id === workshopID);
	const { id: branch, setId: setBranch } = useActiveBranch();
	const [query, setQuery] = useState("");
	const q = query.trim().toLowerCase();
	const { page, offset, setPage } = useListPage(
		JSON.stringify([workshopID, q, estado, branch, desde, hasta]),
	);
	const { data, isLoading, error, isFetching } = useQuery({
		...ordersPageQuery(
			workshopID,
			q,
			statuses,
			offset,
			branch || undefined,
			range,
		),
		initialData:
			!q &&
			!estado &&
			!desde &&
			!hasta &&
			!branch &&
			page === 1 &&
			workshopID === me.memberships[0].workshop_id
				? initial
				: undefined,
	});
	const { rows, sort, toggle } = useTableSort(data?.items ?? [], {
		number: (o) => o.number,
		vehicle: (o) => o.plate ?? `${o.make} ${o.model}`,
		reason: (o) => o.reason,
		status: (o) => statusValues.indexOf(o.status),
		received: (o) => o.received_at,
	});
	const setStatuses = (values: Status[]) =>
		navigate({
			search: (prev) => ({
				...prev,
				estado: values.length ? values.join(",") : undefined,
			}),
			replace: true,
		});
	const setRange = (next: DateRange) =>
		navigate({
			search: (prev) => ({ ...prev, desde: next.from, hasta: next.to }),
			replace: true,
		});
	const filtering = !!q || statuses.length > 0 || !!desde || !!hasta;

	const clearFilters = () => {
		setQuery("");
		navigate({ search: {}, replace: true });
	};
	return (
		<PageBody>
			<PageHeader
				eyebrow="Operación"
				title="Órdenes de trabajo"
				description="Seguimiento de cada vehículo desde que entra hasta que se publica en su historial."
				actions={
					<Button asChild>
						<Link to="/taller/ordenes/nueva" search={{ vehiculo: undefined }}>
							<Plus className="size-4" />
							Nueva orden
						</Link>
					</Button>
				}
			/>

			<Card className="gap-0 overflow-hidden py-0 shadow-none">
				<ListToolbar>
					<SearchInput
						containerClassName="min-w-[220px] flex-1 sm:max-w-sm"
						aria-label="Buscar órdenes"
						placeholder="Buscar por placa, motivo o número"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<DateRangeFilter label="Recibida" value={range} onChange={setRange} />
					{branches.length > 1 && (
						<FacetFilter
							label="Sucursal"
							multiple={false}
							selected={branch ? [branch] : []}
							onChange={(values) => setBranch(values[0] ?? "")}
							options={branches.map((b) => ({
								value: b.branch_id,
								label: b.branch_name,
							}))}
						/>
					)}
					<ClearFilters show={filtering} onClear={clearFilters} />
				</ListToolbar>
				<QueryContent
					pending={isLoading}
					error={error}
					empty={!rows.length}
					errorClassName="m-4"
					emptyState={
						<EmptyState
							icon={ClipboardList}
							title={
								filtering ? "Ninguna orden coincide" : "Todavía no hay órdenes"
							}
							description={
								filtering
									? "Probá con otra búsqueda o quitá algún filtro."
									: "Registrá la primera orden para empezar el historial."
							}
							action={
								filtering && (
									<Button variant="outline" onClick={clearFilters}>
										Quitar filtros
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
									sortKey="number"
									sort={sort}
									onSort={toggle}
									className="w-20 pl-4"
								>
									Orden
								</SortableHead>
								<SortableHead sortKey="vehicle" sort={sort} onSort={toggle}>
									Vehículo
								</SortableHead>
								<SortableHead
									sortKey="reason"
									sort={sort}
									onSort={toggle}
									className="hidden md:table-cell"
								>
									Motivo
								</SortableHead>
								<SortableHead
									sortKey="received"
									sort={sort}
									onSort={toggle}
									className="hidden text-right sm:table-cell"
									align="right"
								>
									Recibida
								</SortableHead>
								<SortableHead
									sortKey="status"
									sort={sort}
									onSort={toggle}
									className="pr-4"
									filter={
										<FacetFilter
											compact
											label="Estado"
											selected={statuses}
											onChange={setStatuses}
											options={statusValues.map((value) => ({
												value,
												label: statusLabel(value),
												dot: orderDot(value),
												count: data?.counts[value] ?? 0,
											}))}
										/>
									}
								>
									Estado
								</SortableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((o) => (
								<TableRow key={o.id} className="relative cursor-pointer">
									<TableCell className="pl-4">
										<Link
											className="font-mono text-[13px] font-semibold text-seal after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
											to="/taller/ordenes/$orderId"
											params={{ orderId: o.id }}
										>
											#{o.number}
										</Link>
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2.5">
											<Plate value={o.plate} />
											<span className="hidden text-[13px] text-ink-2 lg:inline">
												{o.make} {o.model}
											</span>
										</div>
										<p className="mt-1 max-w-[180px] truncate text-xs text-ink-3 md:hidden">
											{o.reason}
										</p>
									</TableCell>
									<TableCell className="hidden max-w-[280px] truncate text-[13px] md:table-cell">
										{o.reason}
									</TableCell>
									<TableCell
										className="hidden text-right text-[12.5px] text-ink-3 sm:table-cell"
										title={date(o.received_at)}
									>
										{shortDate(o.received_at)}
									</TableCell>
									<TableCell className="pr-4">
										<OrderStatusBadge status={o.status} />
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
		</PageBody>
	);
}
