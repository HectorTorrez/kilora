import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Archive,
	Building2,
	EyeOff,
	FileText,
	MapPin,
	ShieldCheck,
	UserRound,
} from "lucide-react";
import { useWorkshopId } from "@/components/kilora/app-shell";
import {
	PageBody,
	PageHeader,
	SectionCard,
} from "@/components/kilora/workshop-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { workshopQuery } from "@/lib/workshop";
import { Route as TallerRoute } from "@/routes/taller";

export const Route = createFileRoute("/taller/configuracion")({
	component: SettingsPage,
});

const roleLabel: Record<string, string> = {
	admin: "Administrador",
	recepcion: "Recepción",
	mecanico: "Mecánico",
};

const projection = [
	{
		who: "Propietario",
		sees: "Todo: trabajos, fecha, kilometraje, taller, costo y notas públicas.",
		tone: "bg-seal-soft text-seal",
	},
	{
		who: "Tu taller",
		sees: "Todo lo de tus órdenes, incluidos costos internos y notas privadas.",
		tone: "bg-ok-soft text-ok",
	},
	{
		who: "Otro taller",
		sees: "Vista ciega: trabajo, fecha y kilometraje. Sin autor, costo ni notas.",
		tone: "bg-secondary text-ink-2",
	},
];

function SettingsPage() {
	const workshopID = useWorkshopId();
	const { me } = TallerRoute.useRouteContext();
	const { data, isLoading, error } = useQuery(workshopQuery(workshopID));
	const mine = me.memberships.filter((m) => m.workshop_id === workshopID);

	return (
		<PageBody className="max-w-5xl">
			<PageHeader
				eyebrow="Administración"
				title="Mi taller"
				description="Datos del taller, sucursales, tu acceso y las reglas con las que Kilora protege tu información."
			/>
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error.message}</AlertDescription>
				</Alert>
			)}

			<div className="grid items-start gap-6 lg:grid-cols-2">
				<SectionCard title="Datos del taller">
					{isLoading ? (
						<Skeleton className="h-24" />
					) : (
						<div className="flex items-start gap-4">
							<span className="grid size-12 shrink-0 place-items-center rounded-lg bg-seal text-white">
								<Building2 className="size-5" />
							</span>
							<dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
								<dt className="text-ink-3">Nombre comercial</dt>
								<dd className="text-right font-semibold">
									{data?.workshop.name}
								</dd>
								<dt className="text-ink-3">NIT</dt>
								<dd className="text-right font-mono">
									{data?.workshop.nit || "Sin registrar"}
								</dd>
								<dt className="text-ink-3">Sucursales</dt>
								<dd className="text-right">{data?.branches.length ?? 0}</dd>
							</dl>
						</div>
					)}
				</SectionCard>

				<SectionCard title="Tu acceso" description={me.user.email}>
					<ul className="divide-y text-[13px]">
						{mine.map((m) => (
							<li
								key={m.branch_id}
								className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
							>
								<span className="flex items-center gap-2">
									<UserRound className="size-4 text-ink-3" />
									{m.branch_name}
								</span>
								<span className="rounded-full bg-seal-soft px-2 py-0.5 text-[11.5px] font-semibold text-seal">
									{roleLabel[m.role] ?? m.role}
								</span>
							</li>
						))}
					</ul>
				</SectionCard>

				<SectionCard
					title="Sucursales"
					description="Las órdenes se registran por sucursal"
					bodyClassName="p-0 sm:p-0"
				>
					{isLoading ? (
						<Skeleton className="m-5 h-20" />
					) : (
						<ul className="divide-y">
							{data?.branches.map((b) => {
								const role = mine.find((m) => m.branch_id === b.id)?.role;
								return (
									<li
										key={b.id}
										className="flex items-center gap-3 px-4 py-3 text-[13px] sm:px-5"
									>
										<MapPin className="size-4 text-ink-3" />
										<span className="flex-1 font-medium">{b.name}</span>
										<span className="text-xs text-ink-3">
											{role ? roleLabel[role] : "Sin acceso"}
										</span>
									</li>
								);
							})}
						</ul>
					)}
				</SectionCard>

				<SectionCard
					title="Políticas de datos"
					description="Aplicadas en el servidor, no configurables"
				>
					<ul className="space-y-3 text-[13px]">
						<li className="flex gap-3">
							<FileText className="mt-0.5 size-4 shrink-0 text-ink-3" />
							<span>
								<strong className="font-semibold">
									Historial append-only.
								</strong>{" "}
								<span className="text-ink-2">
									Un servicio publicado no se edita; se agrega una corrección
									fechada.
								</span>
							</span>
						</li>
						<li className="flex gap-3">
							<Archive className="mt-0.5 size-4 shrink-0 text-ink-3" />
							<span>
								<strong className="font-semibold">Provisionales.</strong>{" "}
								<span className="text-ink-2">
									Sin actividad en 90 días se archivan; a los 12 meses se
									purgan, salvo que tengan orden abierta o historial.
								</span>
							</span>
						</li>
						<li className="flex gap-3">
							<ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-3" />
							<span>
								<strong className="font-semibold">Auditoría.</strong>{" "}
								<span className="text-ink-2">
									Cada cambio sensible queda registrado con autor y fecha.
								</span>
							</span>
						</li>
					</ul>
				</SectionCard>
			</div>

			<SectionCard
				title={
					<span className="flex items-center gap-2">
						<EyeOff className="size-4 text-ink-3" />
						Quién ve qué del historial
					</span>
				}
				description="El mismo registro se proyecta distinto según quién lo mira. Tu competencia nunca ve lo que cobrás."
				bodyClassName="p-0 sm:p-0"
			>
				<ul className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
					{projection.map((p) => (
						<li key={p.who} className="p-4 sm:p-5">
							<span
								className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${p.tone}`}
							>
								{p.who}
							</span>
							<p className="mt-3 text-[13px] text-ink-2">{p.sees}</p>
						</li>
					))}
				</ul>
			</SectionCard>
		</PageBody>
	);
}
