import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ClipboardList, Plus, Search } from "lucide-react";
import { useState } from "react";
import {
	EmptyState,
	OrderStatusBadge,
	PageBody,
	PageHeader,
	Plate,
	relative,
} from "@/components/kilora/workshop-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ordersQuery } from "@/features/taller/orders";
import { useTallerContext, useWorkshopId } from "@/features/taller/session";
import { date } from "@/lib/format";
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
		return context.queryClient.ensureQueryData(ordersQuery(workshopID));
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
	// Se pide la lista completa y se filtra en el cliente para mostrar conteos por estado.
	const { data, isLoading, error } = useQuery({
		...ordersQuery(workshopID, undefined, branch || undefined),
		initialData:
			!branch && workshopID === me.memberships[0].workshop_id
				? initial
				: undefined,
	});
	const all = data ?? [];
	const q = query.trim().toLowerCase();
	const searched = q
		? all.filter((o) =>
				[o.plate, o.reason, o.make, o.model, `#${o.number}`, String(o.number)]
					.filter(Boolean)
					.some((v) => String(v).toLowerCase().includes(q)),
			)
		: all;
	const rows = estado ? searched.filter((o) => o.status === estado) : searched;
	const count = (s: Status | "") =>
		s ? searched.filter((o) => o.status === s).length : searched.length;

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
						<div className="relative min-w-[220px] flex-1 sm:max-w-sm">
							<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
							<Input
								aria-label="Buscar órdenes"
								placeholder="Buscar por placa, motivo o número"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								className="pl-9"
							/>
						</div>
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
				{isLoading ? (
					<div className="space-y-2 p-4">
						<Skeleton className="h-10" />
						<Skeleton className="h-10" />
						<Skeleton className="h-10" />
					</div>
				) : error ? (
					<Alert variant="destructive" className="m-4">
						<AlertDescription>{error.message}</AlertDescription>
					</Alert>
				) : !rows.length ? (
					<EmptyState
						icon={ClipboardList}
						title={
							q || estado ? "Ninguna orden coincide" : "Todavía no hay órdenes"
						}
						description={
							q || estado
								? "Probá con otra búsqueda o cambiá el estado."
								: "Registrá la primera orden para empezar el historial."
						}
					/>
				) : (
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
				)}
			</Card>
		</PageBody>
	);
}
