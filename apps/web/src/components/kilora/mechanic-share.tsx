import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MessageCircle, Share2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { date, day, km } from "@/lib/format";
import { mechanicShareActions, mechanicShareQuery } from "@/lib/mechanic-share";
import {
	OWNER_HISTORY_PAGE_SIZE,
	ownerHistoryQuery,
	useOwnerMutation,
} from "@/lib/owner";
import { ListPagination } from "./list-pagination";
import { CopyField } from "./workshop-ui";

type Created = components["schemas"]["MechanicShareCreated"];

export function MechanicShare({ vehicleID }: { vehicleID: string }) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button type="button" variant="outline" onClick={() => setOpen(true)}>
				<Share2 />
				Compartir con mi mecánico
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				{open && <MechanicShareDialog key={vehicleID} vehicleID={vehicleID} />}
			</Dialog>
		</>
	);
}

function MechanicShareDialog({ vehicleID }: { vehicleID: string }) {
	const scope = useId();
	const status = useQuery(mechanicShareQuery(vehicleID));
	const [selected, setSelected] = useState(() => new Set<string>());
	const [includeMaintenance, setIncludeMaintenance] = useState(false);
	const [created, setCreated] = useState<Created | null>(null);
	const create = useOwnerMutation(
		(body: components["schemas"]["MechanicShareInput"]) =>
			mechanicShareActions.create(vehicleID, body),
	);
	const revoke = useOwnerMutation(() => mechanicShareActions.revoke(vehicleID));
	const active = created ?? status.data?.active;
	const pending = create.isPending || revoke.isPending;
	const toggleSelection = (id: string, checked: boolean) =>
		setSelected((previous) => {
			const next = new Set(previous);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	return (
		<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
			<DialogHeader>
				<DialogTitle>Compartir con mi mecánico</DialogTitle>
				<DialogDescription>
					Elegí los servicios que querés mostrar. El enlace dura 7 días y se
					abre sin cuenta. Incluye fechas, kilometraje, trabajos, repuestos y
					talleres; excluye montos, notas y comprobantes. Cualquiera que tenga
					el enlace puede verlo.
				</DialogDescription>
			</DialogHeader>
			{status.isPending ? (
				<Skeleton className="h-16" aria-label="Cargando enlace…" />
			) : status.isError ? (
				<Alert variant="destructive">
					<AlertDescription>
						No pudimos consultar el enlace.{" "}
						<Button variant="link" onClick={() => status.refetch()}>
							Reintentar
						</Button>
					</AlertDescription>
				</Alert>
			) : (
				<>
					{active && (
						<ActiveMechanicLink
							active={active}
							created={created}
							pending={pending}
							revoking={revoke.isPending}
							onRevoke={() =>
								revoke.mutate(undefined, {
									onSuccess: () => {
										setCreated(null);
										toast.success("Enlace desactivado");
									},
									onError: (error) => toast.error(errorMessage(error)),
								})
							}
						/>
					)}
					<fieldset disabled={pending} className="min-w-0 space-y-3">
						<legend className="mb-2 text-sm font-semibold">
							Servicios para compartir
						</legend>
						<p className="text-xs text-ink-3">
							La selección se conserva al cambiar de página. Hasta 200
							servicios; los servicios nuevos no se agregan solos.
						</p>
						<ServiceSelection
							vehicleID={vehicleID}
							selected={selected}
							onToggle={toggleSelection}
						/>
						<label
							htmlFor={`${scope}-maintenance`}
							className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg bg-muted p-3 text-sm"
						>
							<Checkbox
								className="mt-1"
								id={`${scope}-maintenance`}
								checked={includeMaintenance}
								onCheckedChange={(checked) =>
									setIncludeMaintenance(checked === true)
								}
							/>
							<span>
								Incluir próximos mantenimientos
								<span className="mt-1 block text-xs text-ink-3">
									Estimaciones basadas solo en los servicios seleccionados, tus
									intervalos y la última lectura de kilometraje.
								</span>
							</span>
						</label>
					</fieldset>
					<output className="text-sm text-ink-3" aria-live="polite">
						{selected.size} servicios seleccionados
					</output>
					<Button
						type="button"
						disabled={pending || selected.size === 0}
						onClick={() =>
							create.mutate(
								{
									record_ids: [...selected],
									include_maintenance: includeMaintenance,
								},
								{
									onSuccess: setCreated,
									onError: (error) => toast.error(errorMessage(error)),
								},
							)
						}
					>
						{create.isPending
							? "Creando enlace…"
							: active
								? "Crear enlace nuevo con esta selección"
								: "Crear enlace con esta selección"}
					</Button>
				</>
			)}
		</DialogContent>
	);
}

function ServiceSelection({
	vehicleID,
	selected,
	onToggle,
}: {
	vehicleID: string;
	selected: ReadonlySet<string>;
	onToggle: (id: string, checked: boolean) => void;
}) {
	const scope = useId();
	const [page, setPage] = useState(1);
	const history = useQuery(ownerHistoryQuery(vehicleID, page));
	return (
		<>
			{history.isError ? (
				<Alert variant="destructive">
					<AlertDescription>
						No pudimos cargar los servicios.{" "}
						<Button variant="link" onClick={() => history.refetch()}>
							Reintentar
						</Button>
					</AlertDescription>
				</Alert>
			) : history.isPending ? (
				<Skeleton className="h-32" aria-label="Cargando servicios…" />
			) : (
				<>
					{history.data.records.length ? (
						<div
							className="divide-y rounded-lg border"
							aria-busy={history.isFetching}
						>
							{history.data.records.map((record) => (
								<label
									key={record.id}
									htmlFor={`${scope}-${record.id}`}
									className="flex min-h-12 cursor-pointer items-start gap-3 p-3"
								>
									<Checkbox
										id={`${scope}-${record.id}`}
										className="mt-1"
										checked={selected.has(record.id)}
										disabled={
											history.isPlaceholderData ||
											(!selected.has(record.id) && selected.size >= 200)
										}
										onCheckedChange={(checked) =>
											onToggle(record.id, checked === true)
										}
									/>
									<span className="min-w-0 break-words text-sm">
										<span className="block font-medium">{record.summary}</span>
										<span className="text-xs text-ink-3">
											{day(record.performed_on)} ·{" "}
											{record.odometer_km != null
												? km(record.odometer_km)
												: "Sin kilometraje"}
										</span>
									</span>
								</label>
							))}
						</div>
					) : (
						<p className="rounded-lg border border-dashed p-4 text-sm text-ink-3">
							Guardá un servicio para poder compartirlo.
						</p>
					)}
					<ListPagination
						page={page}
						total={history.data.total}
						pageSize={OWNER_HISTORY_PAGE_SIZE}
						onPageChange={setPage}
						pending={history.isFetching}
					/>
				</>
			)}
		</>
	);
}

function ActiveMechanicLink({
	active,
	created,
	pending,
	revoking,
	onRevoke,
}: {
	active: components["schemas"]["MechanicShareStatus"];
	created: Created | null;
	pending: boolean;
	revoking: boolean;
	onRevoke: () => void;
}) {
	return (
		<div className="space-y-3 rounded-lg border p-3">
			<p className="text-sm">
				Enlace activo hasta el {date(active.expires_at)}. Crear otro desactiva
				el anterior.
			</p>
			{created ? (
				<>
					<CopyField value={created.url} label="Enlace para el mecánico" />
					<div className="flex flex-wrap gap-2">
						<Button asChild>
							<a
								href={created.whatsapp_url}
								target="_blank"
								rel="noopener noreferrer"
							>
								<MessageCircle />
								WhatsApp
							</a>
						</Button>
						<Button asChild variant="outline">
							<a href={created.url} target="_blank" rel="noopener noreferrer">
								<ExternalLink />
								Ver lo compartido
							</a>
						</Button>
					</div>
				</>
			) : (
				<p className="text-xs text-ink-3">
					El enlace no se puede recuperar. Seleccioná servicios para crear uno
					nuevo.
				</p>
			)}
			<Button
				type="button"
				variant="outline"
				disabled={pending}
				onClick={onRevoke}
			>
				{revoking ? "Desactivando…" : "Desactivar enlace"}
			</Button>
		</div>
	);
}
