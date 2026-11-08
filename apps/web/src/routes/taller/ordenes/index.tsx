import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ClipboardList, Plus } from "lucide-react";
import { useState } from "react";
import { ListPagination } from "@/components/kilora/list-pagination";
import { QueryContent } from "@/components/kilora/query-content";
import {
	EmptyState,
	OrderStatusBadge,
	PageBody,
	PageHeader,
	Plate,
	relative,
} from "@/components/kilora/workshop-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ordersPageQuery } from "@/features/taller/orders";
import { useTallerContext, useWorkshopId } from "@/features/taller/session";
import { date } from "@/lib/format";
import { useListPage } from "@/lib/pagination";
import { cn } from "@/lib/utils";

type Status = components["schemas"]["WorkOrderStatus"];
const statusValues: Status[] = [
	"recibido",
	"diagnostico",
	"en_reparacion",
	"listo",
	"cancelado",
];

export const Route = createFileRoute("/taller/ordenes/")({
	validateSearch: (search: Record<string, unknown>): { estado?: Status } => ({
		estado: statusValues.includes(search.estado as Status)
			? (search.estado as Status)
			: undefined,
	}),
	loader: async ({ context }) => {
		const workshopID = context.me.memberships[0].workshop_id;
		return context.queryClient.ensureQueryData(ordersPageQuery(workshopID));
	},
	component: OrdersPage,
});

const tabs: [Status | "", string][] = [
	["", "Todas"],
	["recibido", "Recibidas"],
	["diagnostico", "Diagnóstico"],
	["en_reparacion", "En reparación"],
	["listo", "Listas"],
	["cancelado", "Canceladas"],
];

function OrdersPage() {
	const workshopID = useWorkshopId();
	const initial = Route.useLoaderData();
	const { estado } = Route.useSearch();
	const navigate = useNavigate({ from: "/taller/ordenes/" });
	const { me } = useTallerContext();
	const branches = me.memberships.filter((m) => m.workshop_id === workshopID);
	const [branch, setBranch] = useState("");
	const [query, setQuery] = useState("");
	const q = query.trim().toLowerCase();
	const { page, offset, setPage } = useListPage(
		JSON.stringify([workshopID, q, estado, branch]),
	);
	const { data, isLoading, error, isFetching } = useQuery({
		...ordersPageQuery(workshopID, q, estado, offset, branch || undefined),
		initialData:
			!q &&
			!estado &&
			!branch &&
			page === 1 &&
			workshopID === me.memberships[0].workshop_id
				? initial
				: undefined,
	});
	const rows = data?.items ?? [];
	const count = (s: Status | "") => data?.counts[s] ?? 0;

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
				<div className="flex flex-col gap-3 border-b px-3 pt-3 sm:px-4">
					<div className="flex flex-wrap items-center gap-2">
						<SearchInput
							containerClassName="min-w-[220px] flex-1 sm:max-w-sm"
							aria-label="Buscar órdenes"
							placeholder="Buscar por placa, motivo o número"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
						{branches.length > 1 && (
							<Select
								value={branch || "all"}
								onValueChange={(v) => setBranch(v === "all" ? "" : v)}
							>
								<SelectTrigger aria-label="Sucursal" className="w-48">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">Todas las sucursales</SelectItem>
									{branches.map((b) => (
										<SelectItem key={b.branch_id} value={b.branch_id}>
											{b.branch_name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</div>
					<div
						role="tablist"
						aria-label="Estado de la orden"
						className="-mb-px flex gap-1 overflow-x-auto"
					>
						{tabs.map(([value, label]) => {
							const on = (estado ?? "") === value;
							return (
								<button
									key={value || "all"}
									type="button"
									role="tab"
									aria-selected={on}
									onClick={() =>
										navigate({
											search: { estado: value || undefined },
											replace: true,
										})
									}
									className={cn(
										"flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 pt-1 pb-2.5 text-[13px] font-medium text-ink-3 hover:text-foreground",
										on && "border-seal text-foreground",
									)}
								>
									{label}
									<span
										className={cn(
											"rounded-full bg-secondary px-1.5 font-mono text-[10.5px] tabular-nums",
											on && "bg-seal-soft text-seal",
										)}
									>
										{count(value)}
									</span>
								</button>
							);
						})}
					</div>
				</div>
				<QueryContent
					pending={isLoading}
					error={error}
					empty={!rows.length}
					errorClassName="m-4"
					emptyState={
						<EmptyState
							icon={ClipboardList}
							title={
								q || estado
									? "Ninguna orden coincide"
									: "Todavía no hay órdenes"
							}
							description={
								q || estado
									? "Probá con otra búsqueda o cambiá el estado."
									: "Registrá la primera orden para empezar el historial."
							}
						/>
					}
				>
					<Table>
						<TableHeader>
							<TableRow className="bg-secondary/40 hover:bg-secondary/40">
								<TableHead className="w-20 pl-4">Orden</TableHead>
								<TableHead>Vehículo</TableHead>
								<TableHead>Motivo</TableHead>
								<TableHead>Estado</TableHead>
								<TableHead className="pr-4 text-right">Recibida</TableHead>
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
											<span className="text-[13px] text-ink-2">
												{o.make} {o.model}
											</span>
										</div>
									</TableCell>
									<TableCell className="max-w-[280px] truncate text-[13px]">
										{o.reason}
									</TableCell>
									<TableCell>
										<OrderStatusBadge status={o.status} />
									</TableCell>
									<TableCell
										className="pr-4 text-right text-[12.5px] text-ink-3"
										title={date(o.received_at)}
									>
										{relative(o.received_at)}
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
