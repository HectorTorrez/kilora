import { createFileRoute, notFound } from "@tanstack/react-router";
import { BadgeCheck, Printer, Sparkles } from "lucide-react";
import { HistoryTimeline } from "@/components/kilora/history-timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, isNotFound, unwrap } from "@/lib/api";
import { date, day, km } from "@/lib/format";

async function getReport(token: string) {
	try {
		return unwrap(
			await api.GET("/api/v1/public/reports/{token}", {
				params: { path: { token } },
			}),
		);
	} catch (error) {
		if (isNotFound(error)) return null;
		throw error;
	}
}

export const Route = createFileRoute("/r/$token")({
	loader: async ({ params }) => {
		const report = await getReport(params.token);
		if (!report) throw notFound();
		return report;
	},
	head: () => ({
		meta: [
			{ title: "Historial del vehículo · Kilora" },
			{ name: "robots", content: "noindex" },
		],
	}),
	notFoundComponent: () => (
		<main className="p-8 text-center">
			<Alert>
				<AlertTitle>Reporte no disponible</AlertTitle>
				<AlertDescription>
					El enlace puede haber vencido o el propietario lo desactivó.
				</AlertDescription>
			</Alert>
		</main>
	),
	component: PublicReport,
});

function PublicReport() {
	const r = Route.useLoaderData();
	const v = r.vehicle;
	const s = r.stats;
	const facts: [string, string][] = [
		["Servicios", String(s.services)],
		[
			"Periodo",
			s.first_performed_on && s.last_performed_on
				? `${day(s.first_performed_on)} – ${day(s.last_performed_on)}`
				: "—",
		],
		["Último kilometraje", km(s.latest_odometer_km)],
		[
			"En talleres",
			`${s.workshop_records}${s.verified_records ? ` (${s.verified_records} verificados)` : ""}`,
		],
	];
	return (
		<main className="mx-auto max-w-2xl space-y-6 px-5 py-8 print:py-0">
			<header className="flex items-start justify-between gap-4">
				<div>
					<p className="text-xs font-bold tracking-widest">
						KILORA · HISTORIAL DEL VEHÍCULO
					</p>
					<h1 className="mt-3 text-2xl font-bold">
						{[v.make, v.model, v.year].filter(Boolean).join(" ")}
					</h1>
					<p className="font-mono text-sm text-ink-3">
						{v.plate || "Sin placa"}
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					className="print:hidden"
					onClick={() => window.print()}
				>
					<Printer className="size-4" />
					Imprimir o PDF
				</Button>
			</header>
			{r.summary ? (
				<Card className="gap-0 rounded-lg p-5 shadow-none">
					<p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-seal">
						<Sparkles className="size-3.5" aria-hidden />
						Resumen del historial (redactado con IA)
					</p>
					<p className="leading-relaxed">{r.summary}</p>
				</Card>
			) : null}
			<dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-line sm:grid-cols-4">
				{facts.map(([label, value]) => (
					<div key={label} className="bg-card px-3 py-3">
						<dt className="text-[11.5px] text-ink-3">{label}</dt>
						<dd className="mt-0.5 text-sm font-semibold">{value}</dd>
					</div>
				))}
			</dl>
			<Card className="gap-0 rounded-lg p-5 shadow-none">
				<h2 className="mb-4 font-semibold">Servicios</h2>
				<HistoryTimeline records={r.records} />
			</Card>
			{r.odometer_readings.length ? (
				<Card className="gap-0 rounded-lg p-5 shadow-none">
					<h2 className="font-semibold">Lecturas de kilometraje</h2>
					<ul className="mt-3 divide-y text-sm">
						{r.odometer_readings.slice(0, 24).map((o) => (
							<li
								key={`${o.read_at}-${o.km}`}
								className="flex justify-between py-1.5"
							>
								<span className="font-mono tabular-nums">{km(o.km)}</span>
								<span className="text-ink-3">{date(o.read_at)}</span>
							</li>
						))}
					</ul>
				</Card>
			) : null}
			<p className="flex items-start gap-1.5 text-xs text-ink-3">
				<BadgeCheck className="mt-px size-3.5 shrink-0" aria-hidden />
				Compartido por el propietario desde Kilora el {date(r.created_at)}.
				Muestra lo registrado por talleres y por el propietario; no incluye
				montos ni notas privadas, y no certifica el estado actual del vehículo.
				Válido hasta el {date(r.expires_at)}.
			</p>
		</main>
	);
}
