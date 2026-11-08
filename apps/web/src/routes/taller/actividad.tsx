import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Car,
	ClipboardList,
	FileText,
	History,
	Lightbulb,
	Mail,
	ShieldCheck,
	Users,
} from "lucide-react";
import { useState } from "react";
import {
	EmptyState,
	PageBody,
	PageHeader,
	relative,
} from "@/components/kilora/workshop-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkshopId } from "@/features/taller/session";
import { auditQuery } from "@/features/taller/team";
import { TIME_ZONE } from "@/lib/format";

type Event = components["schemas"]["AuditEvent"];

export const Route = createFileRoute("/taller/actividad")({
	component: ActivityPage,
});

const actions: Record<string, string> = {
	"workshop.create": "creó el taller",
	"vehicle.create": "registró un vehículo",
	"work_order.create": "abrió una orden",
	"work_order.status": "cambió el estado de una orden",
	"work_order.update": "editó una orden",
	"history.publish": "publicó un servicio en el historial",
	"job.create": "agregó un trabajo a una orden",
	"job.delete": "quitó un trabajo de una orden",
	"part.create": "agregó una pieza a una orden",
	"part.delete": "quitó una pieza de una orden",
	"history.manual": "agregó un servicio manual al historial",
	"history.correct": "corrigió un registro del historial",
	"quote.create": "creó una cotización",
	"quote.update": "editó una cotización",
	"quote.convert": "convirtió una cotización en orden",
	"quote.save": "guardó una cotización",
	"quote.share": "compartió una cotización",
	"quote.outcome": "marcó la respuesta de una cotización",
	"invitation.create": "invitó a un propietario",
	"invitation.accept": "aceptó una invitación",
	"recommendation.create": "registró una recomendación",
	"recommendation.hecha": "marcó una recomendación como hecha",
	"recommendation.descartada": "descartó una recomendación",
	"membership.create": "agregó un miembro al equipo",
	"membership.delete": "quitó un miembro del equipo",
};

const icons: Record<string, typeof Car> = {
	vehicle: Car,
	work_order: ClipboardList,
	history_record: History,
	quote: FileText,
	invitation: Mail,
	recommendation: Lightbulb,
	membership: Users,
};

const dayKey = (value: string) =>
	new Intl.DateTimeFormat("es-SV", {
		weekday: "long",
		day: "numeric",
		month: "long",
		timeZone: TIME_ZONE,
	}).format(new Date(value));

const time = (value: string) =>
	new Intl.DateTimeFormat("es-SV", {
		hour: "numeric",
		minute: "2-digit",
		timeZone: TIME_ZONE,
	}).format(new Date(value));

function ActivityPage() {
	const workshopID = useWorkshopId();
	const [pages, setPages] = useState<(number | undefined)[]>([undefined]);
	return (
		<PageBody className="max-w-4xl">
			<PageHeader
				eyebrow="Administración"
				title="Actividad"
				description="Bitácora de auditoría del taller. Es de solo lectura: ningún registro se puede editar ni borrar."
			/>
			<Card className="gap-0 overflow-hidden py-0 shadow-none">
				{pages.map((before, i) => (
					<AuditPage
						key={before ?? "first"}
						workshopID={workshopID}
						before={before}
						last={i === pages.length - 1}
						onMore={(id) => setPages((p) => [...p, id])}
					/>
				))}
			</Card>
		</PageBody>
	);
}

function AuditPage({
	workshopID,
	before,
	last,
	onMore,
}: {
	workshopID: string;
	before?: number;
	last: boolean;
	onMore: (before: number) => void;
}) {
	const { data, isLoading, error } = useQuery(auditQuery(workshopID, before));
	if (isLoading)
		return (
			<div className="space-y-2 p-4">
				<Skeleton className="h-10" />
				<Skeleton className="h-10" />
				<Skeleton className="h-10" />
			</div>
		);
	if (error)
		return (
			<Alert variant="destructive" className="m-4">
				<AlertDescription>
					{error.message.includes("administrador")
						? "Solo los administradores pueden ver la bitácora."
						: error.message}
				</AlertDescription>
			</Alert>
		);
	const events = data ?? [];
	if (!events.length && before === undefined)
		return (
			<EmptyState
				icon={ShieldCheck}
				title="Sin actividad registrada"
				description="Cada cambio sensible del taller aparecerá acá."
			/>
		);
	const groups: [string, Event[]][] = [];
	for (const ev of events) {
		const key = dayKey(ev.created_at);
		const g = groups.at(-1);
		if (g && g[0] === key) g[1].push(ev);
		else groups.push([key, [ev]]);
	}
	return (
		<>
			{groups.map(([label, items]) => (
				<section key={`${before}-${label}`}>
					<h2 className="sticky top-0 border-b bg-secondary/60 px-4 py-1.5 text-[11.5px] font-semibold text-ink-2 first-letter:uppercase backdrop-blur sm:px-5">
						{label}
					</h2>
					<ul className="divide-y">
						{items.map((ev) => {
							const Icon = icons[ev.entity] ?? ShieldCheck;
							return (
								<li
									key={ev.id}
									className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
								>
									<span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-ink-2">
										<Icon className="size-3.5" />
									</span>
									<p className="min-w-0 flex-1 text-[13px]">
										<span className="font-semibold">
											{ev.actor_name ?? "Sistema"}
										</span>{" "}
										<span className="text-ink-2">
											{actions[ev.action] ?? ev.action}
										</span>
										{ev.entity === "work_order" && ev.entity_id && (
											<>
												{" · "}
												<Link
													to="/taller/ordenes/$orderId"
													params={{ orderId: ev.entity_id }}
													className="font-medium text-seal hover:underline"
												>
													ver orden
												</Link>
											</>
										)}
										{ev.entity === "vehicle" && ev.entity_id && (
											<>
												{" · "}
												<Link
													to="/taller/vehiculos/$vehicleId"
													params={{ vehicleId: ev.entity_id }}
													className="font-medium text-seal hover:underline"
												>
													ver vehículo
												</Link>
											</>
										)}
									</p>
									<span
										className="shrink-0 font-mono text-[11.5px] text-ink-3"
										title={relative(ev.created_at)}
									>
										{time(ev.created_at)}
									</span>
								</li>
							);
						})}
					</ul>
				</section>
			))}
			{last && events.length === 50 && (
				<div className="border-t p-3 text-center">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onMore(events[events.length - 1].id)}
					>
						Cargar más
					</Button>
				</div>
			)}
		</>
	);
}
