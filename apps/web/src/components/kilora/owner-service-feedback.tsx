import type { components } from "@kilora/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { day, money, shortDate } from "@/lib/format";
import type { SavedServiceDraft } from "@/lib/service-drafts";
import { FormDialog } from "./form-dialog";

type Duplicate = components["schemas"]["DuplicateService"];
export function ServiceDraftNotice({
	phase,
	status,
	saved,
	pending,
	closeFailed,
	onResume,
	onDiscard,
	onCloseWithoutSaving,
}: {
	phase: "loading" | "restore" | "editing";
	status: "idle" | "saving" | "saved" | "error";
	saved: SavedServiceDraft | null;
	pending: boolean;
	closeFailed: boolean;
	onResume: () => void;
	onDiscard: () => void;
	onCloseWithoutSaving: () => void;
}) {
	if (phase === "loading")
		return (
			<output className="block text-sm text-ink-3">Buscando borrador…</output>
		);
	if (saved)
		return (
			<Alert>
				<AlertDescription>
					<p className="font-medium">Tenés un servicio sin terminar</p>
					<p className="mt-1">
						{saved.values.summary || "Borrador del servicio"} ·{" "}
						{shortDate(new Date(saved.updatedAt).toISOString())}
						{saved.receipt ? " · Con comprobante" : ""}
					</p>
					<p className="mt-1">
						Podés retomarlo o descartarlo y empezar de nuevo.
					</p>
					{status === "error" && (
						<p className="mt-1 text-destructive">
							No pudimos descartar el borrador. Intentá de nuevo.
						</p>
					)}
					<div className="mt-3 flex flex-wrap gap-2">
						<Button
							type="button"
							size="sm"
							disabled={pending}
							onClick={onResume}
						>
							Retomar borrador
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={pending}
							onClick={onDiscard}
						>
							Descartar borrador
						</Button>
					</div>
				</AlertDescription>
			</Alert>
		);
	if (status === "error")
		return (
			<Alert variant="destructive">
				<AlertDescription>
					<p>
						No pudimos conservar el borrador en este navegador. Podés guardar el
						servicio normalmente.
					</p>
					{closeFailed && (
						<Button
							type="button"
							variant="outline"
							className="mt-3"
							disabled={pending}
							onClick={onCloseWithoutSaving}
						>
							Cerrar sin conservar cambios
						</Button>
					)}
				</AlertDescription>
			</Alert>
		);
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
			<output>
				{status === "saving"
					? "Guardando borrador…"
					: status === "saved"
						? "Borrador guardado en este navegador, incluido el comprobante."
						: "Tus cambios se guardan como borrador en este navegador."}
			</output>
			{status !== "idle" && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={pending}
					onClick={onDiscard}
				>
					Descartar borrador
				</Button>
			)}
		</div>
	);
}

export function DuplicateServiceDialog({
	duplicates,
	pending,
	onCancel,
	onConfirm,
}: {
	duplicates: Duplicate[] | null;
	pending: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<FormDialog
			open={duplicates !== null}
			onOpenChange={(open) => {
				if (!open && !pending) onCancel();
			}}
			title="¿Este servicio ya está guardado?"
			description="Encontramos servicios parecidos en este vehículo. No guardamos el nuevo servicio ni su comprobante todavía."
			className="sm:max-w-lg"
		>
			<ul className="space-y-3">
				{duplicates?.map((record) => (
					<li key={record.id} className="rounded-lg border p-3 text-sm">
						<p className="font-medium">{record.summary}</p>
						<p className="mt-1 text-ink-3">
							{day(record.performed_on)}
							{record.workshop_name ? ` · ${record.workshop_name}` : ""}
							{record.total ? ` · ${money(record.total)}` : ""}
						</p>
						<p className="mt-1 text-xs text-seal">
							{record.reason === "receipt"
								? "El mismo archivo de comprobante ya está adjunto a este servicio."
								: "Coinciden la fecha, el taller y el total."}
						</p>
					</li>
				))}
			</ul>
			<p className="text-sm text-ink-3">
				Si se trata de otro servicio, podés guardarlo de todos modos.
			</p>
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button
					type="button"
					variant="outline"
					disabled={pending}
					onClick={onCancel}
				>
					Volver y revisar
				</Button>
				<Button type="button" disabled={pending} onClick={onConfirm}>
					{pending ? "Guardando…" : "Guardar de todos modos"}
				</Button>
			</div>
		</FormDialog>
	);
}
