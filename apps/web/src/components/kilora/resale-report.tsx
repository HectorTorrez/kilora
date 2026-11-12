import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, MessageCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api";
import { date } from "@/lib/format";
import { ownerActions, ownerReportQuery, useOwnerMutation } from "@/lib/owner";
import { CopyField } from "./workshop-ui";

type Created = Awaited<ReturnType<typeof ownerActions.createReport>>;

/**
 * Reporte para vender el vehículo: un enlace de solo lectura con todo el
 * historial, sin montos ni notas, y un resumen escrito con IA.
 */
export function ResaleReport({ vehicleID }: { vehicleID: string }) {
	const [open, setOpen] = useState(false);
	const [created, setCreated] = useState<Created | null>(null);
	const status = useQuery({ ...ownerReportQuery(vehicleID), enabled: open });
	const create = useOwnerMutation(() => ownerActions.createReport(vehicleID));
	const revoke = useOwnerMutation(() => ownerActions.revokeReport(vehicleID));
	const active = created ?? status.data?.active ?? null;

	const generate = () =>
		create.mutate(undefined, {
			onSuccess: setCreated,
			onError: (e) => toast.error(errorMessage(e)),
		});

	return (
		<>
			<Button type="button" variant="outline" onClick={() => setOpen(true)}>
				<FileText />
				Reporte para venta
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Reporte para venta</DialogTitle>
						<DialogDescription>
							Un enlace con todo el historial del vehículo para compartir con
							quien te lo quiera comprar. Muestra los servicios, fechas,
							kilometraje y talleres; nunca los montos ni las notas. Vale 30
							días.
						</DialogDescription>
					</DialogHeader>
					{create.isPending ? (
						<p className="flex items-center gap-2 text-sm text-ink-3">
							<Sparkles className="size-4 text-primary" aria-hidden />
							Preparando el reporte y su resumen…
						</p>
					) : created ? (
						<div className="grid gap-3">
							<CopyField value={created.url} label="Enlace del reporte" />
							<div className="flex flex-wrap gap-2">
								<Button asChild>
									<a
										href={created.whatsapp_url}
										target="_blank"
										rel="noopener noreferrer"
									>
										<MessageCircle className="size-4" />
										Compartir por WhatsApp
									</a>
								</Button>
								<Button asChild variant="outline">
									<a
										href={created.url}
										target="_blank"
										rel="noopener noreferrer"
									>
										<ExternalLink className="size-4" />
										Ver reporte
									</a>
								</Button>
							</div>
						</div>
					) : active ? (
						<p className="text-sm text-ink-2">
							Hay un enlace activo hasta el {date(active.expires_at)}. Por
							seguridad no se puede volver a mostrar: creá uno nuevo para
							copiarlo (el anterior deja de funcionar).
						</p>
					) : null}
					{active?.summary ? (
						<div className="rounded-md bg-seal-soft/60 p-3 text-sm">
							<p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-seal">
								<Sparkles className="size-3.5" aria-hidden />
								Resumen del historial
							</p>
							<p className="leading-relaxed">{active.summary}</p>
						</div>
					) : null}
					<div className="flex flex-wrap gap-2 border-t pt-4">
						<Button
							type="button"
							variant={created ? "outline" : "default"}
							disabled={create.isPending}
							onClick={generate}
						>
							{active ? "Crear enlace nuevo" : "Crear enlace"}
						</Button>
						{active ? (
							<Button
								type="button"
								variant="ghost"
								className="text-destructive"
								disabled={revoke.isPending}
								onClick={() =>
									revoke.mutate(undefined, {
										onSuccess: () => {
											setCreated(null);
											toast.success("Enlace desactivado");
										},
										onError: (e) => toast.error(errorMessage(e)),
									})
								}
							>
								Desactivar enlace
							</Button>
						) : null}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
