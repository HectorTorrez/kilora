import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useWorkshopId } from "@/components/kilora/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { date } from "@/lib/format";
import { ordersQuery } from "@/lib/workshop";
import { Route as TallerRoute } from "@/routes/taller";
export const Route = createFileRoute("/taller/ordenes/")({
	loader: async ({ context }) => {
		const workshopID = context.me.memberships[0].workshop_id;
		return context.queryClient.ensureQueryData(ordersQuery(workshopID));
	},
	component: OrdersPage,
});
const statuses = [
	["", "Todas"],
	["recibido", "Recibidas"],
	["diagnostico", "Diagnóstico"],
	["en_reparacion", "En reparación"],
	["listo", "Listas"],
	["cancelado", "Canceladas"],
] as const;
function OrdersPage() {
	const workshopID = useWorkshopId();
	const initial = Route.useLoaderData();
	const { me } = TallerRoute.useRouteContext();
	const branches = me.memberships.filter((m) => m.workshop_id === workshopID);
	const [status, setStatus] = useState<
		components["schemas"]["WorkOrderStatus"] | ""
	>("");
	const [branch, setBranch] = useState("");
	const { data, isLoading, error } = useQuery({
		...ordersQuery(workshopID, status || undefined, branch || undefined),
		initialData:
			!status && !branch && workshopID === me.memberships[0].workshop_id
				? initial
				: undefined,
	});
	return (
		<main className="mx-auto max-w-7xl space-y-5 px-5 py-7">
			<div className="flex justify-between">
				<h1 className="font-display text-3xl font-bold">Órdenes</h1>
				<Button asChild>
					<Link to="/taller/ordenes/nueva">Nueva orden</Link>
				</Button>
			</div>
			<div className="flex flex-wrap gap-2">
				<ToggleGroup
					type="single"
					value={status || "all"}
					onValueChange={(value) => {
						if (value)
							setStatus(
								value === "all"
									? ""
									: (value as components["schemas"]["WorkOrderStatus"]),
							);
					}}
					className="flex flex-wrap justify-start gap-2"
					aria-label="Estado de la orden"
				>
					{statuses.map(([value, label]) => (
						<ToggleGroupItem
							key={value}
							value={value || "all"}
							className="rounded-full border px-3 text-sm data-[state=on]:bg-foreground data-[state=on]:text-background"
						>
							{label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				{branches.length > 1 && (
					<Select
						value={branch || "all"}
						onValueChange={(value) => setBranch(value === "all" ? "" : value)}
					>
						<SelectTrigger aria-label="Sucursal">
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
			<Card className="gap-0 overflow-hidden py-0 shadow-none">
				{isLoading ? (
					<Skeleton className="m-6 h-20" aria-label="Cargando órdenes…" />
				) : error ? (
					<Alert variant="destructive">
						<AlertDescription>{error.message}</AlertDescription>
					</Alert>
				) : !data?.length ? (
					<p className="p-8 text-center text-ink-3">
						No hay órdenes con este filtro.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Orden</TableHead>
								<TableHead>Vehículo</TableHead>
								<TableHead>Motivo</TableHead>
								<TableHead>Estado</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.map((o) => (
								<TableRow key={o.id} className="relative cursor-pointer">
									<TableCell>
										<Link
											className="font-mono underline after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
											to="/taller/ordenes/$orderId"
											params={{ orderId: o.id }}
										>
											#{o.number}
										</Link>
									</TableCell>
									<TableCell>
										{o.plate || "Sin placa"} · {o.make} {o.model}
									</TableCell>
									<TableCell>{o.reason}</TableCell>
									<TableCell className="text-ink-3">
										{o.status.replaceAll("_", " ")} · {date(o.received_at)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</Card>
		</main>
	);
}
