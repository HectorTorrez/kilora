import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MessageCircle, Pencil } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkshopMutation } from "@/features/taller/mutation";
import {
	orderTrackingQuery,
	trackingActions,
} from "@/features/taller/order-tracking";
import { useTallerContext } from "@/features/taller/session";
import {
	trackingDate,
	trackingDateInput,
	trackingInputDate,
} from "@/lib/order-tracking";
import { FormDialog } from "./form-dialog";
import {
	applyFormError,
	FormActions,
	RootError,
	SubmitButton,
	TextareaField,
	TextField,
} from "./form-fields";
import { CopyField, SectionCard } from "./workshop-ui";

type S = components["schemas"];
export function OrderTrackingCard({
	workshopID,
	order,
}: {
	workshopID: string;
	order: S["WorkOrderDetail"];
}) {
	const { me } = useTallerContext();
	const editable = me.memberships.some(
		(m) =>
			m.workshop_id === workshopID &&
			m.branch_id === order.branch_id &&
			(m.role === "admin" || m.role === "recepcion"),
	);
	const tracking = useQuery(orderTrackingQuery(workshopID, order.id));
	const [editing, setEditing] = useState(false);
	const active = tracking.data?.share;
	return (
		<SectionCard
			title="Seguimiento para el cliente"
			description="Un enlace con el estado, tu mensaje y la entrega estimada. No muestra trabajos, precios ni notas internas."
			actions={
				editable &&
				tracking.data && (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => setEditing(true)}
					>
						<Pencil className="size-3.5" />
						Actualizar
					</Button>
				)
			}
		>
			{tracking.isPending ? (
				<Skeleton className="h-24" aria-label="Cargando seguimiento…" />
			) : tracking.isError || !tracking.data ? (
				<Alert variant="destructive">
					<AlertDescription>
						No pudimos cargar el seguimiento.{" "}
						<Button variant="link" onClick={() => tracking.refetch()}>
							Reintentar
						</Button>
					</AlertDescription>
				</Alert>
			) : (
				<div className="space-y-4">
					<p className="break-words text-sm whitespace-pre-line">
						{tracking.data.customer_update ||
							"Todavía no hay un mensaje para el cliente."}
					</p>
					{tracking.data.estimated_ready_at &&
						order.status !== "listo" &&
						order.status !== "cancelado" && (
							<p className="text-sm text-ink-3">
								Entrega estimada:{" "}
								{trackingDate(tracking.data.estimated_ready_at)} (El Salvador).
							</p>
						)}
					{active ? (
						<p className="text-xs text-ink-3">
							Enlace vigente hasta el {trackingDate(active.expires_at)}.
							Cualquiera que lo tenga puede consultar el estado.
						</p>
					) : (
						<p className="text-xs text-ink-3">
							No hay un enlace activo. Crear uno permite consultar esta orden
							sin cuenta durante 30 días.
						</p>
					)}
					{editable && (
						<TrackingLinkControls
							workshopID={workshopID}
							orderID={order.id}
							active={active}
						/>
					)}
				</div>
			)}
			{tracking.data && (
				<FormDialog
					open={editing}
					onOpenChange={setEditing}
					title="Actualización para el cliente"
					description="Este mensaje se muestra a quien tenga el enlace. Escribí solo lo que quieras compartir con el cliente."
				>
					<TrackingEditor
						workshopID={workshopID}
						order={order}
						initial={tracking.data}
						onClose={() => setEditing(false)}
					/>
				</FormDialog>
			)}
		</SectionCard>
	);
}

function TrackingLinkControls({
	workshopID,
	orderID,
	active,
}: {
	workshopID: string;
	orderID: string;
	active: S["OrderTrackingSettings"]["share"] | undefined;
}) {
	const [created, setCreated] = useState<S["SharedOrderTrackingLink"] | null>(
		null,
	);
	const actions = trackingActions(workshopID, orderID);
	const share = useWorkshopMutation(workshopID, actions.share);
	const revoke = useWorkshopMutation(workshopID, actions.revoke);
	const visibleLink =
		created &&
		active &&
		created.shared_at === active.shared_at &&
		created.expires_at === active.expires_at
			? created
			: null;
	const busy = share.isPending || revoke.isPending;
	return (
		<>
			{visibleLink && (
				<div className="space-y-3">
					<CopyField value={visibleLink.url} label="Enlace de seguimiento" />
					<div className="flex flex-wrap gap-2">
						<Button asChild size="sm">
							<a
								href={visibleLink.whatsapp_url}
								target="_blank"
								rel="noopener noreferrer"
							>
								<MessageCircle className="size-4" />
								Compartir por WhatsApp
							</a>
						</Button>
						<Button asChild size="sm" variant="outline">
							<a
								href={visibleLink.url}
								target="_blank"
								rel="noopener noreferrer"
							>
								<ExternalLink className="size-4" />
								Ver seguimiento
							</a>
						</Button>
					</div>
				</div>
			)}
			{active && !visibleLink && (
				<p className="text-xs text-ink-3">
					Por seguridad, el enlace solo se muestra al crearlo. Creá uno nuevo
					para copiarlo.
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={busy}
					onClick={() =>
						share.mutate(undefined, {
							onSuccess: (link) => {
								setCreated(link);
								toast.success("Enlace de seguimiento creado");
							},
						})
					}
				>
					{share.isPending
						? "Creando…"
						: active
							? "Crear enlace nuevo"
							: "Crear enlace de seguimiento"}
				</Button>
				{active && (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						disabled={busy}
						onClick={() =>
							revoke.mutate(undefined, {
								onSuccess: () => {
									setCreated(null);
									toast.success("Enlace desactivado");
								},
							})
						}
					>
						Desactivar enlace
					</Button>
				)}
			</div>
			{active && (
				<p className="text-xs text-ink-3">
					Crear un enlace nuevo desactiva el anterior. Actualizar el mensaje no
					cambia el enlace.
				</p>
			)}
		</>
	);
}

const trackingSchema = z.object({
	message: z.string().trim().max(1000, "Usá como máximo 1000 caracteres"),
	estimate: z
		.string()
		.refine(
			(value) => !value || !Number.isNaN(trackingInputDate(value).getTime()),
			"Ingresá una fecha y hora válidas",
		),
});
function TrackingEditor({
	workshopID,
	order,
	initial,
	onClose,
}: {
	workshopID: string;
	order: S["WorkOrderDetail"];
	initial: S["OrderTrackingSettings"];
	onClose: () => void;
}) {
	const closed = order.status === "listo" || order.status === "cancelado";
	const initialEstimate = closed
		? ""
		: trackingDateInput(initial.estimated_ready_at);
	const form = useForm({
		resolver: zodResolver(trackingSchema),
		defaultValues: {
			message: initial.customer_update ?? "",
			estimate: initialEstimate,
		},
	});
	const update = useWorkshopMutation(
		workshopID,
		trackingActions(workshopID, order.id).update,
		{ inlineErrors: true },
	);
	return (
		<Form {...form}>
			<form
				className="space-y-4"
				noValidate
				onSubmit={form.handleSubmit(async (values) => {
					try {
						const estimate =
							closed || !values.estimate
								? null
								: values.estimate === initialEstimate
									? initial.estimated_ready_at
									: trackingInputDate(values.estimate).toISOString();
						await update.mutateAsync({
							customer_update: values.message || null,
							estimated_ready_at: estimate,
						});
						toast.success("Seguimiento actualizado");
						onClose();
					} catch (error) {
						applyFormError(form, error);
					}
				})}
			>
				<fieldset disabled={update.isPending} className="space-y-4">
					<TextareaField
						name="message"
						label="Mensaje que verá el cliente"
						placeholder="Ej. Ya llegaron los repuestos y estamos terminando la reparación."
						optional
						maxLength={1000}
					/>
					{!closed && (
						<TextField
							name="estimate"
							label="Entrega estimada (hora de El Salvador)"
							type="datetime-local"
							optional
						/>
					)}
					<p className="text-xs text-ink-3">
						{closed
							? "La orden está cerrada. Podés actualizar el mensaje, pero no se mostrará una fecha estimada."
							: "La fecha es una estimación. Dejá el campo vacío para quitarla."}
					</p>
					<RootError />
					<FormActions>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancelar
						</Button>
						<SubmitButton pending={update.isPending}>
							Guardar actualización
						</SubmitButton>
					</FormActions>
				</fieldset>
			</form>
		</Form>
	);
}
