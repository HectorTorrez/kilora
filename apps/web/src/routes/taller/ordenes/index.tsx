import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money, type Order, orders } from "@/lib/demo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/taller/ordenes/")({
	component: OrdersPage,
	head: () => ({ meta: [{ title: "Órdenes · Kilora" }] }),
});

const filters = [
	{ value: "todas", label: "Todas" },
	{ value: "registrada", label: "Registradas" },
	{ value: "cotizacion", label: "Cotizaciones" },
	{ value: "borrador", label: "Borradores" },
] as const;

const statusStyles: Record<Order["status"], string> = {
	registrada: "bg-ok-soft text-ok",
	cotizacion: "bg-warn-soft text-warn",
	borrador: "bg-secondary text-ink-2",
};

const statusLabels: Record<Order["status"], string> = {
	registrada: "Registrada",
	cotizacion: "Cotización",
	borrador: "Borrador",
};

function OrdersPage() {
	const [query, setQuery] = useState("");
	const [filter, setFilter] =
		useState<(typeof filters)[number]["value"]>("todas");

	const filtered = useMemo(() => {
		const term = query.trim().toLowerCase();

		return orders.filter((order) => {
			const matchesFilter = filter === "todas" || order.status === filter;
			const matchesTerm =
				term.length === 0 ||
				`${order.number} ${order.plate} ${order.owner} ${order.service}`
					.toLowerCase()
					.includes(term);

			return matchesFilter && matchesTerm;
		});
	}, [filter, query]);

	return (
		<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[18px] px-5 py-6 lg:px-8 lg:py-7">
			<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
				<div>
					<p className="text-[9.5px] font-semibold tracking-[0.14em] text-ink-3 uppercase">
						Taller Rivas · Sucursal Centro
					</p>
					<h1 className="mt-1.5 flex items-center gap-2.5 font-display text-[29px] leading-none font-bold tracking-[-0.025em]">
						Órdenes
						<span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-normal tracking-normal text-ink-2">
							64
						</span>
					</h1>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<div className="relative">
						<Search
							className="pointer-events-none absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-ink-3"
							aria-hidden="true"
						/>
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Buscar orden, placa o cliente"
							aria-label="Buscar orden"
							type="search"
							enterKeyHint="search"
							className="h-9 w-[250px] bg-card pl-9 text-[16px] sm:text-[13px]"
						/>
					</div>
					<Button asChild className="h-9 gap-2 px-3.5 text-[13px]">
						<Link to="/taller/ordenes/nueva">
							<Plus className="size-[15px]" aria-hidden="true" />
							Nueva orden
						</Link>
					</Button>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-1.5">
				{filters.map((item) => (
					<button
						key={item.value}
						type="button"
						aria-pressed={filter === item.value}
						onClick={() => setFilter(item.value)}
						className={cn(
							"pressable rounded-full border px-3 py-1.5 text-[11.5px] font-medium",
							filter === item.value
								? "border-foreground bg-foreground font-semibold text-background"
								: "border-line bg-card text-ink-2 hover:border-input hover:text-foreground",
						)}
					>
						{item.label}
					</button>
				))}
			</div>

			<div className="overflow-hidden rounded-lg border bg-card">
				<div className="overflow-x-auto">
					<table className="w-full min-w-[820px] table-fixed border-collapse text-left">
						<thead>
							<tr className="border-b bg-paper">
								<th className="w-[13%] px-5 py-2.5 text-[9.5px] font-semibold tracking-[0.09em] text-ink-3">
									ORDEN
								</th>
								<th className="w-[22%] px-4 py-2.5 text-[9.5px] font-semibold tracking-[0.09em] text-ink-3">
									VEHÍCULO
								</th>
								<th className="w-[27%] px-4 py-2.5 text-[9.5px] font-semibold tracking-[0.09em] text-ink-3">
									TRABAJO
								</th>
								<th className="w-[14%] px-4 py-2.5 text-[9.5px] font-semibold tracking-[0.09em] text-ink-3">
									FECHA
								</th>
								<th className="w-[11%] px-4 py-2.5 text-right text-[9.5px] font-semibold tracking-[0.09em] text-ink-3">
									TOTAL
								</th>
								<th className="w-[13%] px-4 py-2.5 text-center text-[9.5px] font-semibold tracking-[0.09em] text-ink-3">
									ESTADO
								</th>
							</tr>
						</thead>
						<tbody>
							{filtered.map((order) => (
								<tr
									key={order.number}
									className="h-[58px] border-b last:border-0"
								>
									<td className="px-5 font-mono text-[11px] text-ink-2">
										{order.number}
									</td>
									<td className="px-4">
										<p className="font-mono text-[12px] font-semibold">
											{order.plate}
										</p>
										<p className="mt-0.5 truncate text-[10.5px] text-ink-3">
											{order.owner}
										</p>
									</td>
									<td className="truncate px-4 text-[12.5px]">
										{order.service}
									</td>
									<td className="px-4 font-mono text-[10.5px] text-ink-3">
										{order.date}
									</td>
									<td className="px-4 text-right font-mono text-[11px] tabular-nums text-ink-2">
										{money.format(order.total)}
									</td>
									<td className="px-4 text-center">
										<span
											className={cn(
												"inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold",
												statusStyles[order.status],
											)}
										>
											{statusLabels[order.status]}
										</span>
									</td>
								</tr>
							))}
							{filtered.length === 0 ? (
								<tr>
									<td colSpan={6} className="px-5 py-14 text-center">
										<p className="text-[13px] font-medium">
											No hay órdenes con este filtro
										</p>
										<p className="mt-1 text-[12px] text-ink-3">
											Probá con otra búsqueda.
										</p>
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>
				<div className="flex items-center justify-between border-t px-5 py-2.5 text-[10.5px] text-ink-3">
					<span>{filtered.length} órdenes mostradas</span>
					<span className="font-mono">Página 1 de 8</span>
				</div>
			</div>
		</div>
	);
}
