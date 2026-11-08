import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { useState } from "react";
import { QuoteOutcomeBadge } from "@/components/kilora/quote-outcome";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { counterQuotesQuery } from "@/features/taller/quotes";
import { useTallerContext, useWorkshopId } from "@/features/taller/session";
import { date, money, quoteCode } from "@/lib/format";

export const Route = createFileRoute("/taller/cotizaciones/")({
	loader: async ({ context }) => {
		const workshopID = context.me.memberships[0].workshop_id;
		return context.queryClient.ensureQueryData(counterQuotesQuery(workshopID));
	},
	component: QuotesPage,
});

const filters = [
	["", "Todas"],
	["pendiente", "Pendiente"],
	["acepto", "Aceptó"],
	["rechazo", "Rechazó"],
	["no_respondio", "No respondió"],
] as const;

type Outcome = components["schemas"]["CounterQuote"]["outcome"];
type Row = components["schemas"]["CounterQuoteSummary"];

function vehicleLabel(row: Row) {
	const name = [row.vehicle_make, row.vehicle_model, row.vehicle_year]
		.filter(Boolean)
		.join(" ");
	if (row.vehicle_plate && name) return `${row.vehicle_plate} · ${name}`;
	return row.vehicle_plate || name || "Sin vehículo";
}

function QuotesPage() {
	const workshopID = useWorkshopId();
	const initial = Route.useLoaderData();
	const { me } = useTallerContext();
	const [q, setQ] = useState("");
	const [outcome, setOutcome] = useState<Outcome | "">("");
	const { data, isLoading, error, isFetching } = useQuery({
		...counterQuotesQuery(workshopID, q.trim(), outcome || undefined),
		initialData:
			!q && !outcome && workshopID === me.memberships[0].workshop_id
				? initial
				: undefined,
	});
	const rows = data?.items ?? [];
	const filtering = q.trim() !== "" || outcome !== "";
	return (
		<main className="mx-auto max-w-7xl space-y-5 px-5 py-7">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<h1 className="font-display text-3xl font-bold">Cotizaciones</h1>
				<Button asChild>
					<Link to="/taller/cotizaciones/nueva">Nueva cotización</Link>
				</Button>
			</div>
			<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
				<div className="grid gap-2">
					<Label htmlFor="quote-search">Buscar</Label>
					<Input
						id="quote-search"
						value={q}
						placeholder="Número, cliente, placa o teléfono"
						onChange={(event) => setQ(event.target.value)}
					/>
				</div>
				<div className="grid gap-2">
					<Label>Estado</Label>
					<Select
						value={outcome || "all"}
						onValueChange={(value) =>
							setOutcome(value === "all" ? "" : (value as Outcome))
						}
					>
						<SelectTrigger
							aria-label="Estado de la cotización"
							className="w-full"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{filters.map(([value, label]) => (
								<SelectItem key={value || "all"} value={value || "all"}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			{isLoading ? (
				<div className="grid gap-2">
					<Skeleton className="h-12" aria-label="Cargando cotizaciones…" />
					<Skeleton className="h-12" />
					<Skeleton className="h-12" />
				</div>
			) : error ? (
				<Alert variant="destructive">
					<AlertDescription>{error.message}</AlertDescription>
				</Alert>
			) : rows.length === 0 ? (
				<Card className="items-center gap-3 px-6 py-16 text-center shadow-none">
					<FileText className="size-8 text-ink-3" />
					<p className="font-medium">
						{filtering
							? "Ninguna cotización coincide con la búsqueda"
							: "Todavía no hay cotizaciones"}
					</p>
					<p className="max-w-sm text-sm text-ink-3">
						Armá un presupuesto de mostrador y entregalo impreso en menos de dos
						minutos.
					</p>
					{filtering ? null : (
						<Button asChild>
							<Link to="/taller/cotizaciones/nueva">Nueva cotización</Link>
						</Button>
					)}
				</Card>
			) : (
				<>
					<Card className="hidden gap-0 overflow-hidden py-0 shadow-none md:block">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Cotización</TableHead>
									<TableHead>Cliente</TableHead>
									<TableHead>Vehículo</TableHead>
									<TableHead className="text-right">Total</TableHead>
									<TableHead>Fecha</TableHead>
									<TableHead>Estado</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={row.id} className="relative">
										<TableCell>
											<Link
												className="font-mono underline after:absolute after:inset-0"
												to="/taller/cotizaciones/$quoteId"
												params={{ quoteId: row.id }}
											>
												{quoteCode(row.number)}
											</Link>
										</TableCell>
										<TableCell>{row.customer_name || "Sin nombre"}</TableCell>
										<TableCell>{vehicleLabel(row)}</TableCell>
										<TableCell className="text-right tabular-nums">
											{money(row.total)}
										</TableCell>
										<TableCell>{date(row.created_at)}</TableCell>
										<TableCell>
											<QuoteOutcomeBadge outcome={row.outcome} />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</Card>
					<ul className="grid gap-3 md:hidden">
						{rows.map((row) => (
							<li key={row.id}>
								<Link
									to="/taller/cotizaciones/$quoteId"
									params={{ quoteId: row.id }}
									className="block rounded-lg border bg-card p-4"
								>
									<div className="flex items-start justify-between gap-3">
										<p className="font-mono font-medium">
											{quoteCode(row.number)}
										</p>
										<QuoteOutcomeBadge outcome={row.outcome} />
									</div>
									<p className="mt-2 font-medium">
										{row.customer_name || "Sin nombre"}
									</p>
									<p className="text-sm text-ink-3">{vehicleLabel(row)}</p>
									<div className="mt-3 flex items-center justify-between text-sm">
										<span className="font-semibold tabular-nums">
											{money(row.total)}
										</span>
										<span className="text-ink-3">{date(row.created_at)}</span>
									</div>
								</Link>
							</li>
						))}
					</ul>
					{isFetching ? (
						<p className="text-sm text-ink-3">Actualizando…</p>
					) : null}
				</>
			)}
		</main>
	);
}
