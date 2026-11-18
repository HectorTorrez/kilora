import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errorMessage, unwrap } from "@/lib/api";

const labels = {
	queued: "En cola para enviar por WhatsApp…",
	sending: "Enviando por WhatsApp…",
	accepted: "WhatsApp aceptó el mensaje. Esto no confirma su entrega.",
	failed: "No se pudo enviar. Podés compartir el enlace manualmente.",
	unknown:
		"No pudimos confirmar el envío. Revisá WhatsApp antes de volver a compartir.",
	cancelled:
		"No se envió: el enlace venció, se desactivó o cambió el destinatario.",
};

export function WhatsAppNotification({
	workshopID,
	url,
	kind,
}: {
	workshopID: string;
	url: string;
	kind: "quote" | "tracking" | "invitation";
}) {
	return (
		<NotificationControl
			key={url}
			workshopID={workshopID}
			url={url}
			kind={kind}
		/>
	);
}

function NotificationControl({
	workshopID,
	url,
	kind,
}: {
	workshopID: string;
	url: string;
	kind: "quote" | "tracking" | "invitation";
}) {
	const config = useQuery({
		queryKey: ["workshop", workshopID, "whatsapp-config"],
		queryFn: async ({ signal }) =>
			unwrap(
				await api.GET(
					"/api/v1/workshops/{workshopID}/whatsapp-notifications/config",
					{ params: { path: { workshopID } }, signal },
				),
			),
	});
	const send = useMutation({
		mutationFn: async () =>
			unwrap(
				await api.POST(
					"/api/v1/workshops/{workshopID}/whatsapp-notifications",
					{ params: { path: { workshopID } }, body: { url } },
				),
			),
	});
	const notificationID = send.data?.id;
	const status = useQuery({
		queryKey: ["workshop", workshopID, "whatsapp-notification", notificationID],
		enabled: !!notificationID,
		queryFn: async ({ signal }) => {
			if (!notificationID) throw new Error("Notificación no disponible");
			return unwrap(
				await api.GET(
					"/api/v1/workshops/{workshopID}/whatsapp-notifications/{notificationID}",
					{ params: { path: { workshopID, notificationID } }, signal },
				),
			);
		},
		refetchInterval: (query) =>
			!query.state.data ||
			["queued", "sending"].includes(query.state.data.status)
				? 2000
				: false,
	});
	const current = status.data ?? send.data;
	return (
		<div className="space-y-2">
			<Button
				type="button"
				size="sm"
				loading={send.isPending}
				disabled={!config.data?.[kind] || send.isPending || !!current}
				onClick={() => send.mutate()}
			>
				<MessageCircle className="size-4" />
				{send.isPending ? "Preparando envío…" : "Enviar por WhatsApp"}
			</Button>
			<output className="block text-xs text-ink-3">
				{send.isError
					? errorMessage(send.error)
					: current
						? labels[current.status]
						: config.isError
							? "No pudimos consultar la disponibilidad de WhatsApp."
							: config.isPending
								? "Consultando disponibilidad…"
								: !config.data?.[kind]
									? "El envío directo por WhatsApp todavía no está disponible. Podés compartir el enlace manualmente."
									: "Enviaremos el enlace al teléfono registrado del cliente."}
			</output>
			{status.isError && (
				<p className="text-xs text-destructive">
					No pudimos actualizar el estado.{" "}
					<button
						type="button"
						className="underline"
						onClick={() => status.refetch()}
					>
						Reintentar
					</button>
				</p>
			)}
		</div>
	);
}
