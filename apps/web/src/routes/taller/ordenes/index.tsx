import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useWorkshopId } from "@/components/kilora/app-shell";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
			<div className="overflow-hidden rounded-lg border bg-card">
				{isLoading ? (
					<p className="p-6">Cargando órdenes…</p>
				) : error ? (
					<p className="p-6" role="alert">
						{error.message}
					</p>
				) : !data?.length ? (
					<p className="p-8 text-center text-ink-3">
						No hay órdenes con este filtro.
					</p>
				) : (
					data.map((o) => (
						<Link
							key={o.id}
							to="/taller/ordenes/$orderId"
							params={{ orderId: o.id }}
							className="grid gap-2 border-b p-4 hover:bg-paper sm:grid-cols-4"
						>
							<span className="font-mono">#{o.number}</span>
							<span>
								{o.plate || "Sin placa"} · {o.make} {o.model}
							</span>
							<span>{o.reason}</span>
							<span className="text-sm text-ink-3">
								{o.status.replaceAll("_", " ")} · {date(o.received_at)}
							</span>
						</Link>
					))
				)}
			</div>
		</main>
	);
}
