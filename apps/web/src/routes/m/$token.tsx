import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { Printer, Wrench } from "lucide-react";
import { HistoryItems } from "@/components/kilora/history-record";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isNotFound } from "@/lib/api";
import { date, day, km } from "@/lib/format";
import { publicMechanicShareQuery } from "@/lib/mechanic-share";

export const Route = createFileRoute("/m/$token")({
	loader: async ({ context, params }) => {
		try {
			return await context.queryClient.ensureQueryData(
				publicMechanicShareQuery(params.token),
			);
		} catch (error) {
			if (isNotFound(error)) throw notFound();
			throw error;
		}
	},
	head: () => ({
		meta: [
			{ title: "Antecedentes para el mecánico · Kilora" },
			{ name: "robots", content: "noindex, nofollow, noarchive" },
			{ name: "referrer", content: "no-referrer" },
		],
	}),
	headers: () => ({
		"Cache-Control": "no-store",
		"Referrer-Policy": "no-referrer",
		"X-Robots-Tag": "noindex, nofollow, noarchive",
	}),
	notFoundComponent: Unavailable,
	errorComponent: LoadError,
	component: PublicMechanicShare,
});

function Unavailable() {
	return (
		<main className="mx-auto max-w-xl px-5 py-16">
			<Alert>
				<AlertTitle>Enlace para el mecánico no disponible</AlertTitle>
				<AlertDescription>
					El enlace venció o fue desactivado. Pedile uno nuevo al propietario.
				</AlertDescription>
			</Alert>
		</main>
	);
}

function LoadError() {
	const router = useRouter();
	return (
		<main className="mx-auto max-w-xl px-5 py-16">
			<Alert variant="destructive">
				<AlertTitle>No pudimos cargar los antecedentes</AlertTitle>
				<AlertDescription>
					Intentá de nuevo en un momento.
					<Button variant="link" onClick={() => router.invalidate()}>
						Reintentar
					</Button>
				</AlertDescription>
			</Alert>
		</main>
	);
}

function PublicMechanicShare() {
	const { token } = Route.useParams();
	const initial = Route.useLoaderData();
	const query = useQuery({
		...publicMechanicShareQuery(token),
		initialData: initial,
	});
	if (query.isError)
		return isNotFound(query.error) ? <Unavailable /> : <LoadError />;
	const share = query.data;
	const v = share.vehicle;
	return (
		<main className="mx-auto max-w-3xl space-y-6 px-5 py-8 print:py-0">
			<header className="space-y-3">
				<p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-seal">
					<Wrench className="size-4" aria-hidden />
					KILORA · PARA EL MECÁNICO
				</p>
				<h1 className="font-display text-2xl font-bold">
					{[v.make, v.model, v.year].filter(Boolean).join(" ")}
				</h1>
				<p className="text-sm text-ink-3">
					{v.plate || "Sin placa"}
					{share.current_odometer_km != null
						? ` · Última lectura: ${km(share.current_odometer_km)}`
						: ""}
				</p>
				<Button
					variant="outline"
					className="print:hidden"
					onClick={() => window.print()}
				>
					<Printer />
					Imprimir o PDF
				</Button>
			</header>
			<Alert>
				<AlertDescription>
					El propietario eligió los servicios que aparecen acá. Esta vista puede
					estar incompleta y no certifica el estado del vehículo. No incluye
					montos, notas ni comprobantes.
				</AlertDescription>
			</Alert>
			<section aria-labelledby="shared-services" className="space-y-3">
				<h2 id="shared-services" className="font-display text-xl font-bold">
					Antecedentes compartidos
				</h2>
				{share.records.map((record) => (
					<Card key={record.id} className="gap-2 break-words p-5 shadow-none">
						<p className="text-xs text-ink-3">
							{day(record.performed_on)} ·{" "}
							{record.odometer_km != null
								? km(record.odometer_km)
								: "Sin kilometraje"}
						</p>
						<h3 className="font-semibold">{record.summary}</h3>
						<p className="text-xs text-ink-3">
							{record.workshop_name ??
								(record.source === "propietario"
									? "Registrado por el propietario"
									: "Registrado por un taller")}
						</p>
						<HistoryItems items={record.items} appearance="categorized" />
						{!!record.corrections?.length && (
							<p className="text-xs text-ink-3">
								Incluye las correcciones registradas.
							</p>
						)}
					</Card>
				))}
			</section>
			{share.maintenance !== null && (
				<section aria-labelledby="shared-maintenance" className="space-y-3">
					<h2
						id="shared-maintenance"
						className="font-display text-xl font-bold"
					>
						Próximos mantenimientos
					</h2>
					<p className="text-sm text-ink-3">
						Estimaciones según los servicios compartidos, los intervalos
						elegidos por el propietario y su última lectura. Seguí el manual del
						fabricante y el criterio del taller.
					</p>
					{share.maintenance.length ? (
						<div className="grid gap-3 sm:grid-cols-2">
							{share.maintenance.map((item) => (
								<Maintenance key={item.category} item={item} />
							))}
						</div>
					) : (
						<p className="text-sm text-ink-3">
							Los servicios compartidos no permiten estimar próximos
							mantenimientos.
						</p>
					)}
				</section>
			)}
			<footer className="border-t pt-4 text-xs text-ink-3">
				Compartido el {date(share.created_at)}. Válido hasta el{" "}
				{date(share.expires_at)}. Las correcciones de los servicios
				seleccionados se reflejan en este enlace; los servicios nuevos no se
				agregan solos.
			</footer>
		</main>
	);
}

const statuses: Record<
	components["schemas"]["OwnerMaintenanceItem"]["status"],
	string
> = {
	sin_historial: "Sin registro",
	sin_kilometraje: "Falta kilometraje",
	programado: "Programado",
	proximo: "Próximo",
	vencido: "Revisión pendiente",
};
function Maintenance({
	item,
}: {
	item: components["schemas"]["OwnerMaintenanceItem"];
}) {
	return (
		<Card className="gap-2 p-4 shadow-none">
			<h3 className="font-semibold">{item.label}</h3>
			<p className="text-sm">{statuses[item.status]}</p>
			<p className="text-sm text-ink-2">
				{[
					item.due_date ? day(item.due_date) : null,
					item.due_km != null ? km(item.due_km) : null,
				]
					.filter(Boolean)
					.join(" o ") ||
					"Actualizá los datos para estimar la próxima revisión"}
			</p>
			{item.last_performed_on && (
				<p className="text-xs text-ink-3">
					Último servicio: {day(item.last_performed_on)}
				</p>
			)}
		</Card>
	);
}
