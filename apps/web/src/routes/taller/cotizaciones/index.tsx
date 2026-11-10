import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Plus } from "lucide-react";
import { useState } from "react";
import {
	type DateRange,
	DateRangeFilter,
} from "@/components/kilora/date-range-filter";
import { ClearFilters, FacetFilter } from "@/components/kilora/facet-filter";
import { ListPagination } from "@/components/kilora/list-pagination";
import { QueryContent } from "@/components/kilora/query-content";
import {
	outcomeDot,
	QuoteOutcomeBadge,
} from "@/components/kilora/quote-outcome";
import { SortableHead, useTableSort } from "@/components/kilora/sortable-table";
import {
	EmptyState,
	ListToolbar,
	Missing,
	PageBody,
	PageHeader,
	Plate,
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
import { counterQuotesQuery } from "@/features/taller/quotes";
import { useTallerContext, useWorkshopId } from "@/features/taller/session";
import { quoteOutcomeLabels } from "@/lib/domain";
import { date, money, quoteCode, shortDate } from "@/lib/format";
import { useListPage } from "@/lib/pagination";

export const Route = createFileRoute("/taller/cotizaciones/")({
	loader: async ({ context }) => {
		const workshopID = context.me.memberships[0].workshop_id;
		return context.queryClient.ensureQueryData(counterQuotesQuery(workshopID));
	},
	component: QuotesPage,
});

type Outcome = components["schemas"]["CounterQuote"]["outcome"];
type Row = components["schemas"]["CounterQuoteSummary"];

function vehicleName(row: Row) {
	return [row.vehicle_make, row.vehicle_model, row.vehicle_year]
		.filter(Boolean)
		.join(" ");
}

function QuotesPage() {
	const workshopID = useWorkshopId();
	const initial = Route.useLoaderData();
	const { me } = useTallerContext();
	const [q, setQ] = useState("");
	const [outcomes, setOutcomes] = useState<Outcome[]>([]);
	const [range, setRange] = useState<DateRange>({});
	const { page, offset, setPage } = useListPage(
		JSON.stringify([workshopID, q.trim(), outcomes, range]),
	);
	const { data, isLoading, error, isFetching } = useQuery({
		...counterQuotesQuery(workshopID, q.trim(), outcomes, offset, range),
		initialData:
			!q &&
			!outcomes.length &&
			!range.from &&
			!range.to &&
			page === 1 &&
			workshopID === me.memberships[0].workshop_id
				? initial
				: undefined,
	});
	const { rows, sort, toggle } = useTableSort(data?.items ?? [], {
		number: (r) => r.number,
		customer: (r) => r.customer_name,
		vehicle: (r) => vehicleName(r) || r.vehicle_plate,
		status: (r) => quoteOutcomeLabels[r.outcome],
		total: (r) => Number(r.total),
		created: (r) => r.created_at,
	});
	const filtering =
		q.trim() !== "" || outcomes.length > 0 || !!range.from || !!range.to;
	const clearFilters = () => {
		setQ("");
		setOutcomes([]);
		setRange({});
	};
	return (
		<PageBody>
			<PageHeader
				eyebrow="Operación"
				title="Cotizaciones"
				description="Presupuestos de mostrador para clientes que todavía no dejan el vehículo. Si aceptan, se convierten en orden."
				actions={
					<Button asChild>
						<Link to="/taller/cotizaciones/nueva">
							<Plus className="size-4" />
							Nueva cotización
						</Link>
					</Button>
				}
			/>
			<Card className="gap-0 overflow-hidden py-0 shadow-none">
				<ListToolbar>
					<SearchInput
						containerClassName="min-w-[220px] flex-1 sm:max-w-sm"
						aria-label="Buscar cotizaciones"
						placeholder="Buscar por número, cliente, placa o teléfono"
						value={q}
						onChange={(event) => setQ(event.target.value)}
					/>
					<DateRangeFilter label="Fecha" value={range} onChange={setRange} />
					<ClearFilters show={filtering} onClear={clearFilters} />
				</ListToolbar>
				<QueryContent
					pending={isLoading}
					error={error}
					empty={rows.length === 0}
					errorClassName="m-4"
					loading={
						<div className="space-y-2 p-4">
							<Skeleton className="h-11" aria-label="Cargando cotizaciones…" />
							<Skeleton className="h-11" />
							<Skeleton className="h-11" />
						</div>
					}
					emptyState={
						<EmptyState
							icon={FileText}
							title={
								filtering
									? "Ninguna cotización coincide"
									: "Todavía no hay cotizaciones"
							}
							description={
								filtering
									? "Probá con otra búsqueda o cambiá el filtro."
									: "Armá un presupuesto de mostrador y entregalo impreso en menos de dos minutos."
							}
							action={
								filtering ? (
									<Button variant="outline" onClick={clearFilters}>
										Quitar filtros
									</Button>
								) : (
									<Button asChild>
										<Link to="/taller/cotizaciones/nueva">
											<Plus className="size-4" />
											Nueva cotización
										</Link>
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
									className="w-28 pl-4"
								>
									Número
								</SortableHead>
								<SortableHead sortKey="customer" sort={sort} onSort={toggle}>
									Cliente
								</SortableHead>
								<SortableHead
									sortKey="vehicle"
									sort={sort}
									onSort={toggle}
									className="hidden md:table-cell"
								>
									Vehículo
								</SortableHead>
								<SortableHead
									sortKey="total"
									sort={sort}
									onSort={toggle}
									className="text-right"
									align="right"
								>
									Total
								</SortableHead>
								<SortableHead
									sortKey="created"
									sort={sort}
									onSort={toggle}
									className="hidden text-right lg:table-cell"
									align="right"
								>
									Fecha
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
											selected={outcomes}
											onChange={setOutcomes}
											options={(
												[
													"pendiente",
													"acepto",
													"rechazo",
													"no_respondio",
												] as const
											).map((value) => ({
												value,
												label: quoteOutcomeLabels[value],
												dot: outcomeDot(value),
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
							{rows.map((row) => (
								<TableRow key={row.id} className="relative cursor-pointer">
									<TableCell className="pl-4">
										<Link
											className="font-mono text-[13px] font-semibold text-seal after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
											to="/taller/cotizaciones/$quoteId"
											params={{ quoteId: row.id }}
										>
											{quoteCode(row.number)}
										</Link>
									</TableCell>
									<TableCell className="text-[13px] font-medium">
										{row.customer_name || <Missing>Sin nombre</Missing>}
									</TableCell>
									<TableCell className="hidden md:table-cell">
										<div className="flex items-center gap-2.5">
											{row.vehicle_plate && <Plate value={row.vehicle_plate} />}
											<span className="text-[13px] text-ink-2">
												{vehicleName(row) || <Missing>Sin vehículo</Missing>}
											</span>
										</div>
									</TableCell>
									<TableCell className="text-right font-mono text-[13px] tabular-nums">
										{money(row.total)}
									</TableCell>
									<TableCell
										className="hidden text-right text-[12.5px] text-ink-3 lg:table-cell"
										title={date(row.created_at)}
									>
										{shortDate(row.created_at)}
									</TableCell>
									<TableCell className="pr-4">
										<QuoteOutcomeBadge outcome={row.outcome} />
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
