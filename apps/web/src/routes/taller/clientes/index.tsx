import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { CustomerForm } from "@/components/kilora/customer-form";
import { ClearFilters } from "@/components/kilora/facet-filter";
import { FormDialog } from "@/components/kilora/form-dialog";
import { ListPagination } from "@/components/kilora/list-pagination";
import { QueryContent } from "@/components/kilora/query-content";
import { SortableHead, useTableSort } from "@/components/kilora/sortable-table";
import {
	EmptyState,
	ListToolbar,
	Missing,
	PageBody,
	PageHeader,
} from "@/components/kilora/workshop-ui";
import { Badge } from "@/components/ui/badge";
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
import { customersPageQuery } from "@/features/taller/customers";
import { useWorkshopId } from "@/features/taller/session";
import { phone, shortDate } from "@/lib/format";
import { useListPage } from "@/lib/pagination";

export const Route = createFileRoute("/taller/clientes/")({
	component: CustomersPage,
});

function CustomersPage() {
	const workshopID = useWorkshopId();
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const q = query.trim().toLowerCase().replace(/[\s-]/g, "");
	const { page, offset, setPage } = useListPage(
		JSON.stringify([workshopID, q]),
	);
	const { data, isLoading, error, isFetching } = useQuery({
		...customersPageQuery(workshopID, q, offset),
		enabled: !!workshopID,
	});
	const { rows, sort, toggle } = useTableSort(data?.items ?? [], {
		name: (c) => c.full_name.toLowerCase(),
		phone: (c) => c.phone,
		vehicles: (c) => c.vehicle_count ?? 0,
		created: (c) => c.created_at,
	});
	const openCustomer = (customerId: string) =>
		navigate({ to: "/taller/clientes/$customerId", params: { customerId } });

	return (
		<PageBody>
			<PageHeader
				eyebrow="Operación"
				title="Clientes"
				description="Las personas que traen vehículos al taller. Cada vehículo queda a nombre de un cliente."
				actions={
					<Button onClick={() => setOpen(true)}>
						<Plus className="size-4" />
						Registrar cliente
					</Button>
				}
			/>

			<Card className="gap-0 overflow-hidden py-0 shadow-none">
				<ListToolbar>
					<SearchInput
						containerClassName="min-w-[220px] flex-1 sm:max-w-sm"
						aria-label="Buscar clientes"
						placeholder="Buscar por nombre, teléfono o correo"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<ClearFilters show={!!q} onClear={() => setQuery("")} />
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
							icon={Users}
							title={q ? "Ningún cliente coincide" : "Todavía no hay clientes"}
							description={
								q
									? "Probá con otro nombre o teléfono."
									: "Se registran al dar de alta un vehículo, o desde aquí."
							}
							action={
								q ? (
									<Button variant="outline" onClick={() => setQuery("")}>
										Quitar búsqueda
									</Button>
								) : (
									<Button onClick={() => setOpen(true)}>
										Registrar cliente
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
									sortKey="name"
									sort={sort}
									onSort={toggle}
									className="pl-4"
								>
									Cliente
								</SortableHead>
								<SortableHead
									sortKey="phone"
									sort={sort}
									onSort={toggle}
									className="hidden sm:table-cell"
								>
									Teléfono
								</SortableHead>
								<SortableHead
									sortKey="vehicles"
									sort={sort}
									onSort={toggle}
									className="text-right"
									align="right"
								>
									Vehículos
								</SortableHead>
								<SortableHead
									sortKey="created"
									sort={sort}
									onSort={toggle}
									className="hidden pr-4 text-right lg:table-cell"
									align="right"
								>
									Cliente desde
								</SortableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((c) => (
								<TableRow
									key={c.id}
									className="cursor-pointer"
									onClick={() => openCustomer(c.id)}
								>
									<TableCell className="pl-4">
										<Link
											to="/taller/clientes/$customerId"
											params={{ customerId: c.id }}
											onClick={(e) => e.stopPropagation()}
											className="rounded text-[13px] font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
										>
											{c.full_name}
										</Link>
										<p className="flex items-center gap-1.5 text-xs text-ink-3">
											<span className="truncate">{c.email}</span>
											{c.has_account && (
												<Badge
													variant="secondary"
													className="h-4 px-1.5 text-[10px]"
												>
													Con cuenta
												</Badge>
											)}
										</p>
										<p className="font-mono text-xs text-ink-3 sm:hidden">
											{phone(c.phone)}
										</p>
									</TableCell>
									<TableCell className="hidden font-mono text-[12.5px] sm:table-cell">
										{c.phone ? phone(c.phone) : <Missing>Sin teléfono</Missing>}
									</TableCell>
									<TableCell className="text-right font-mono text-[12.5px] tabular-nums">
										{c.vehicle_count ?? 0}
									</TableCell>
									<TableCell className="hidden pr-4 text-right text-[12.5px] text-ink-3 lg:table-cell">
										{shortDate(c.created_at)}
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
				title="Registrar cliente"
				description="Nombre y teléfono son obligatorios. Después podés registrar sus vehículos."
			>
				<CustomerForm
					workshopID={workshopID}
					onSaved={(created) => {
						setOpen(false);
						void openCustomer(created.id);
					}}
				/>
			</FormDialog>
		</PageBody>
	);
}
