import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { Check, Clock, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isNotFound } from "@/lib/api";
import { statusLabel } from "@/lib/format";
import { publicOrderTrackingQuery, trackingDate } from "@/lib/order-tracking";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/estado/$token")({
	loader: async ({ context, params }) => {
		try {
			return await context.queryClient.ensureQueryData(
				publicOrderTrackingQuery(params.token),
			);
		} catch (error) {
			if (isNotFound(error)) throw notFound();
			throw error;
		}
	},
	head: () => ({
		meta: [
			{ title: "Estado de tu reparación · Kilora" },
			{ name: "robots", content: "noindex, nofollow, noarchive" },
			{ name: "referrer", content: "no-referrer" },
		],
	}),
	headers: () => ({
		"Cache-Control": "no-store",
		"Referrer-Policy": "no-referrer",
		"X-Robots-Tag": "noindex, nofollow, noarchive",
	}),
	notFoundComponent: TrackingUnavailable,
	errorComponent: TrackingLoadError,
	component: PublicOrderTracking,
});

function TrackingUnavailable() {
	return (
		<main className="mx-auto max-w-xl px-5 py-16">
			<Card className="p-6 shadow-none">
				<p className="text-xs font-semibold tracking-widest text-seal">
					KILORA
				</p>
				<h1 className="font-display text-2xl font-bold">
					Seguimiento no disponible
				</h1>
				<p className="text-sm text-ink-3">
					El enlace puede haber vencido o el taller lo desactivó. Pedile un
					enlace nuevo al taller.
				</p>
			</Card>
		</main>
	);
}
function TrackingLoadError() {
	const router = useRouter();
	return (
		<main className="mx-auto max-w-xl px-5 py-16">
			<Alert variant="destructive">
				<AlertTitle>No pudimos cargar el seguimiento</AlertTitle>
				<AlertDescription>
					Intentá de nuevo en un momento.
					<Button
						type="button"
						variant="outline"
						className="mt-3"
						onClick={() => router.invalidate()}
					>
						Reintentar
					</Button>
				</AlertDescription>
			</Alert>
		</main>
	);
}
function PublicOrderTracking() {
	const { token } = Route.useParams();
	const initial = Route.useLoaderData();
	const query = useQuery({
		...publicOrderTrackingQuery(token),
		initialData: initial,
	});
	if (query.error && isNotFound(query.error)) return <TrackingUnavailable />;
	const data = query.data;
	return (
		<main className="mx-auto max-w-2xl space-y-6 px-5 py-8 sm:py-12">
			<header className="space-y-2">
				<p className="text-xs font-bold tracking-widest text-seal">
					KILORA · SEGUIMIENTO DE REPARACIÓN
				</p>
				<h1 className="break-words font-display text-3xl font-bold">
					{data.vehicle.make} {data.vehicle.model}
					{data.vehicle.year ? ` ${data.vehicle.year}` : ""}
				</h1>
				<p className="break-words text-sm text-ink-3">
					{data.workshop_name} · {data.branch_name} · Orden #{data.number}
				</p>
			</header>
			<Card className="gap-5 p-5 shadow-none sm:p-6">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<p className="text-xs text-ink-3">Estado actual</p>
						<h2 className="mt-1 font-display text-2xl font-bold">
							{data.status === "listo"
								? "Listo para retirar"
								: statusLabel(data.status)}
						</h2>
					</div>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={query.isFetching}
						onClick={() => query.refetch()}
					>
						<RefreshCw className="size-4" aria-hidden />
						Actualizar
					</Button>
				</div>
				{data.status === "cancelado" ? (
					<Alert>
						<AlertTitle>La orden fue cancelada</AlertTitle>
						<AlertDescription>
							Contactá al taller para conocer los siguientes pasos.
						</AlertDescription>
					</Alert>
				) : (
					<RepairProgress status={data.status} />
				)}
				{data.status === "listo" && (
					<p className="flex items-center gap-2 text-sm font-medium text-seal">
						<Check className="size-4" aria-hidden />
						El taller marcó tu vehículo como listo. Coordiná la entrega con el
						taller.
					</p>
				)}
				<p className="text-xs text-ink-3">
					Última actualización del taller: {trackingDate(data.updated_at)}.
				</p>
				<output className="text-xs text-ink-3">
					{query.isFetching
						? "Consultando el estado…"
						: "El estado se consulta automáticamente cada 30 segundos mientras esta página está visible."}
				</output>
				{query.isError && (
					<Alert variant="destructive">
						<AlertDescription>
							No pudimos actualizar el estado. Se muestra la última información
							disponible; usá Actualizar para volver a intentarlo.
						</AlertDescription>
					</Alert>
				)}
			</Card>
			<Card className="gap-3 p-5 shadow-none sm:p-6">
				<h2 className="font-display text-xl font-bold">Mensaje del taller</h2>
				<p className="break-words text-sm leading-relaxed whitespace-pre-line">
					{data.customer_update ||
						"El taller todavía no publicó un mensaje. El estado de la reparación se muestra arriba."}
				</p>
			</Card>
			{data.estimated_ready_at && (
				<Card className="gap-2 p-5 shadow-none sm:p-6">
					<h2 className="flex items-center gap-2 font-display text-xl font-bold">
						<Clock className="size-5 text-seal" aria-hidden />
						Entrega estimada
					</h2>
					<p className="text-lg font-medium">
						{trackingDate(data.estimated_ready_at)}
					</p>
					<p className="text-xs text-ink-3">
						Hora de El Salvador. Es una estimación del taller; puede cambiar
						durante la reparación.
					</p>
				</Card>
			)}
			<footer className="space-y-2 text-xs text-ink-3">
				<p>
					Ingresó al taller el {trackingDate(data.received_at)}
					{data.completed_at
						? `. Marcado como listo el ${trackingDate(data.completed_at)}`
						: ""}
					{data.cancelled_at
						? `. Cancelado el ${trackingDate(data.cancelled_at)}`
						: ""}
					.
				</p>
				<p>
					Enlace válido hasta el {trackingDate(data.expires_at)}. Compartido por
					el taller para consultar el estado sin crear una cuenta.
				</p>
			</footer>
		</main>
	);
}

const stages: components["schemas"]["WorkOrderStatus"][] = [
	"recibido",
	"diagnostico",
	"en_reparacion",
	"listo",
];
function RepairProgress({
	status,
}: {
	status: components["schemas"]["WorkOrderStatus"];
}) {
	const current = stages.indexOf(status);
	return (
		<ol
			className="grid grid-cols-4 gap-2"
			aria-label="Progreso de la reparación"
		>
			{stages.map((stage, index) => (
				<li key={stage} aria-current={index === current ? "step" : undefined}>
					<div
						aria-hidden
						className={cn(
							"h-1.5 rounded-full bg-secondary",
							index <= current && "bg-seal",
						)}
					/>
					<p
						className={cn(
							"mt-2 text-xs text-ink-3",
							index === current && "font-semibold text-foreground",
						)}
					>
						{statusLabel(stage)}
						{index === current && (
							<span className="sr-only"> · Etapa actual</span>
						)}
					</p>
				</li>
			))}
		</ol>
	);
}
