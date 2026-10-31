import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ChevronRight,
	Download,
	History,
	MessageCircle,
	Plus,
	Search,
	ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { StatusPill } from "@/components/kilora/status-pill";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	getHistory,
	km,
	money,
	plateSlug,
	type Vehicle,
	type VehicleStatus,
	vehicles,
} from "@/lib/demo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/taller/")({
	component: VehiclesPage,
	head: () => ({ meta: [{ title: "Vehículos · Kilora" }] }),
});

type Filter = "todos" | VehicleStatus;

const filters: { value: Filter; label: string }[] = [
	{ value: "todos", label: "Todos" },
	{ value: "ok", label: "Al día" },
	{ value: "due", label: "Con recordatorio" },
	{ value: "shop", label: "En taller" },
];

const stats = [
	{ value: "128", label: "Vehículos activos" },
	{ value: "64", label: "Órdenes este mes" },
	{ value: "12", label: "Recordatorios pendientes" },
	{ value: "3.2", label: "Días promedio por orden" },
];

function VehiclesPage() {
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<Filter>("todos");
	const [selected, setSelected] = useState<Vehicle | null>(null);

	const filtered = useMemo(() => {
		const term = query.trim().toLowerCase();

		return vehicles.filter((vehicle) => {
			const matchesFilter = filter === "todos" || vehicle.status === filter;
			const matchesTerm =
				term.length === 0 ||
				`${vehicle.plate} ${vehicle.model} ${vehicle.owner}`
					.toLowerCase()
					.includes(term);

			return matchesFilter && matchesTerm;
		});
	}, [filter, query]);

	const followUp = vehicles.filter((vehicle) => vehicle.status === "due");

	return (
		<>
			<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[18px] px-5 py-6 lg:px-8 lg:py-7">
				<div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
					<div>
						<p className="text-[9.5px] font-semibold tracking-[0.14em] text-ink-3 uppercase">
							Taller Rivas · Sucursal Centro
						</p>
						<h1 className="mt-1.5 flex items-center gap-2.5 font-display text-[29px] leading-none font-bold tracking-[-0.025em]">
							Vehículos
							<span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-normal tracking-normal text-ink-2">
								128
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
								placeholder="Buscar placa o cliente"
								aria-label="Buscar placa o cliente"
								type="search"
								enterKeyHint="search"
								className="h-9 w-[220px] bg-card pl-9 text-[16px] sm:text-[13px]"
							/>
						</div>
						<Button
							variant="outline"
							className="h-9 gap-2 bg-card px-3.5 text-[13px]"
							onClick={() => toast("La exportación llega con el API")}
						>
							<Download className="size-[15px]" aria-hidden="true" />
							Exportar
						</Button>
						<Button asChild className="h-9 gap-2 px-3.5 text-[13px]">
							<Link to="/taller/ordenes/nueva">
								<Plus className="size-[15px]" aria-hidden="true" />
								Nueva orden
							</Link>
						</Button>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4">
					{stats.map((stat) => (
						<div
							key={stat.label}
							className="flex flex-col gap-1 bg-card px-4 py-3.5"
						>
							<span className="font-display text-[23px] leading-none font-semibold tracking-[-0.02em] tabular-nums">
								{stat.value}
							</span>
							<span className="text-[11px] text-ink-3">{stat.label}</span>
						</div>
					))}
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
					<span className="ml-auto hidden text-[11px] text-ink-3 sm:block">
						Ordenado por{" "}
						<span className="font-medium text-ink-2">último servicio</span>
					</span>
				</div>

				<div className="overflow-hidden rounded-lg border bg-card">
					<div className="overflow-x-auto">
						<table className="w-full min-w-[840px] table-fixed border-collapse text-left">
							<thead>
								<tr className="border-b bg-paper">
									<th className="w-[26%] px-5 py-2.5 text-[9.5px] font-semibold tracking-[0.09em] text-ink-3">
										PLACA / VEHÍCULO
									</th>
									<th className="w-[22%] px-4 py-2.5 text-[9.5px] font-semibold tracking-[0.09em] text-ink-3">
										PROPIETARIO
									</th>
									<th className="w-[22%] px-4 py-2.5 text-[9.5px] font-semibold tracking-[0.09em] text-ink-3">
										ÚLTIMO SERVICIO
									</th>
									<th className="w-[10%] px-4 py-2.5 text-right text-[9.5px] font-semibold tracking-[0.09em] text-ink-3">
										KM
									</th>
									<th className="w-[14%] px-4 py-2.5 text-center text-[9.5px] font-semibold tracking-[0.09em] text-ink-3">
										ESTADO
									</th>
									<th className="w-10 px-2 py-2.5">
										<span className="sr-only">Abrir</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{filtered.map((vehicle) => (
									<tr
										key={vehicle.plate}
										tabIndex={0}
										onClick={() => setSelected(vehicle)}
										onKeyDown={(event) => {
											if (event.key === "Enter" || event.key === " ") {
												event.preventDefault();
												setSelected(vehicle);
											}
										}}
										className="group h-[58px] cursor-pointer border-b transition-colors last:border-0 hover:bg-paper focus-visible:bg-paper focus-visible:outline-none active:bg-secondary/60"
									>
										<td className="px-5">
											<p className="font-mono text-[12.5px] font-semibold">
												{vehicle.plate}
											</p>
											<p className="mt-0.5 truncate text-[10.5px] text-ink-3">
												{vehicle.model} {vehicle.year}
											</p>
										</td>
										<td className="px-4">
											<p className="truncate text-[12.5px] font-medium">
												{vehicle.owner}
											</p>
											<p className="mt-0.5 font-mono text-[10px] text-ink-3">
												{vehicle.phone}
											</p>
										</td>
										<td className="px-4">
											<p className="truncate text-[12.5px]">
												{vehicle.lastService}
											</p>
											<p className="mt-0.5 font-mono text-[10px] text-ink-3">
												{vehicle.lastDate}
											</p>
										</td>
										<td className="px-4 text-right font-mono text-[11px] tabular-nums text-ink-2">
											{km(vehicle.km)}
										</td>
										<td className="px-4 text-center">
											<StatusPill status={vehicle.status} />
										</td>
										<td className="px-2">
											<ChevronRight
												className="size-4 text-line transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-ink-3"
												aria-hidden="true"
											/>
										</td>
									</tr>
								))}
								{filtered.length === 0 ? (
									<tr>
										<td colSpan={6} className="px-5 py-14 text-center">
											<p className="text-[13px] font-medium">
												No hay vehículos con este filtro
											</p>
											<p className="mt-1 text-[12px] text-ink-3">
												Probá con otra búsqueda o volvé a todos.
											</p>
											<Button
												variant="outline"
												size="sm"
												className="mt-4"
												onClick={() => {
													setQuery("");
													setFilter("todos");
												}}
											>
												Ver todos
											</Button>
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>

					<div className="flex items-center justify-between border-t px-5 py-2.5 text-[10.5px] text-ink-3">
						<span>
							{filtered.length} de 128 vehículos ·{" "}
							<span className="font-mono">página 1 de 13</span>
						</span>
						<span className="hidden font-mono sm:inline">
							Última sincronización 9:41
						</span>
					</div>
				</div>

				{followUp.length > 0 ? (
					<div className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 sm:flex-row sm:items-center">
						<div className="w-full shrink-0 sm:w-[170px]">
							<p className="text-[9.5px] font-semibold tracking-[0.12em] text-ink-3">
								SEGUIMIENTO
							</p>
							<p className="mt-0.5 text-[13px] font-semibold">
								{followUp.length} vehículos sin servicio
							</p>
						</div>
						{followUp.slice(0, 2).map((vehicle) => (
							<div
								key={vehicle.plate}
								className="flex min-w-0 flex-1 items-center gap-3 border-t pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4"
							>
								<div className="min-w-0 flex-1">
									<p className="font-mono text-[11px] font-semibold">
										{vehicle.plate}
									</p>
									<p className="truncate text-[10px] text-ink-3">
										{vehicle.model} {vehicle.year} · {vehicle.lastDate}
									</p>
								</div>
								<Button
									variant="secondary"
									size="sm"
									className="h-7 gap-1.5 px-2.5 text-[10.5px]"
									onClick={() =>
										toast.success(`Recordatorio enviado a ${vehicle.owner}`)
									}
								>
									<MessageCircle className="size-3" aria-hidden="true" />
									Recordar
								</Button>
							</div>
						))}
					</div>
				) : null}
			</div>

			<VehicleDialog vehicle={selected} onClose={() => setSelected(null)} />
		</>
	);
}

function VehicleDialog({
	vehicle,
	onClose,
}: {
	vehicle: Vehicle | null;
	onClose: () => void;
}) {
	const history = vehicle ? getHistory(vehicle) : [];

	return (
		<Dialog open={vehicle !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-[520px]">
				{vehicle ? (
					<>
						<DialogHeader>
							<DialogTitle className="font-display text-[26px] font-bold tracking-[-0.02em]">
								{vehicle.plate}
							</DialogTitle>
							<DialogDescription>
								{vehicle.model} {vehicle.year} · {vehicle.owner}
							</DialogDescription>
						</DialogHeader>

						<div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-border">
							<div className="bg-card px-3 py-2.5">
								<p className="text-[9px] tracking-[0.1em] text-ink-3">
									KILOMETRAJE
								</p>
								<p className="mt-0.5 font-mono text-[12px] font-medium">
									{km(vehicle.km)} km
								</p>
							</div>
							<div className="bg-card px-3 py-2.5">
								<p className="text-[9px] tracking-[0.1em] text-ink-3">ÚLTIMO</p>
								<p className="mt-0.5 text-[12px]">{vehicle.lastDate}</p>
							</div>
							<div className="bg-card px-3 py-2.5">
								<p className="text-[9px] tracking-[0.1em] text-ink-3">ESTADO</p>
								<div className="mt-1">
									<StatusPill status={vehicle.status} />
								</div>
							</div>
						</div>

						<div>
							<div className="flex items-center gap-2 pb-2">
								<History className="size-3.5 text-ink-3" aria-hidden="true" />
								<p className="text-[11px] font-semibold tracking-[0.08em] text-ink-3">
									HISTORIAL RECIENTE
								</p>
							</div>
							<div className="divide-y rounded-md border">
								{history.slice(0, 3).map((entry) => (
									<div
										key={`${entry.date}-${entry.work}`}
										className="flex items-center gap-3 px-3 py-2.5"
									>
										<div className="min-w-0 flex-1">
											<p className="truncate text-[12px] font-medium">
												{entry.work}
											</p>
											<p className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-3">
												<ShieldCheck className="size-3" aria-hidden="true" />
												{entry.shop} · {entry.date}
											</p>
										</div>
										<div className="text-right">
											<p className="font-mono text-[10px] text-ink-2">
												{km(entry.km)} km
											</p>
											<p className="font-mono text-[10px] text-ink-3">
												{entry.price === 0 ? "—" : money.format(entry.price)}
											</p>
										</div>
									</div>
								))}
							</div>
						</div>

						<DialogFooter className="gap-2">
							<Button variant="outline" onClick={onClose}>
								Cerrar
							</Button>
							<Button asChild>
								<Link
									to="/h/$placa"
									params={{ placa: plateSlug(vehicle.plate) }}
								>
									Ver como propietario
								</Link>
							</Button>
						</DialogFooter>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
