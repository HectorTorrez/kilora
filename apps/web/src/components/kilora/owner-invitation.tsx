import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, MessageCircle, Send } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
	applyFormError,
	RootError,
	SubmitButton,
	TextField,
} from "@/components/kilora/form-fields";
import { emailField } from "@/components/kilora/form-schemas";
import { ListPagination } from "@/components/kilora/list-pagination";
import { CopyField, SectionCard } from "@/components/kilora/workshop-ui";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useWorkshopMutation } from "@/features/taller/mutation";
import {
	invitationsQuery,
	inviteOwnerAction,
} from "@/features/taller/vehicles";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const INVITATIONS_PAGE_SIZE = 5;

const schema = z.object({ email: emailField });

const invitationStatus: Record<string, string> = {
	pendiente: "Pendiente",
	aceptada: "Aceptada",
	expirada: "Vencida",
	revocada: "Revocada",
};

export function OwnerInvitation({
	workshopID,
	vehicleID,
	linked,
	name,
	suggestedEmail,
}: {
	workshopID: string;
	vehicleID: string;
	linked?: boolean;
	name?: string | null;
	/** Correo del cliente del taller, para no tener que escribirlo de nuevo. */
	suggestedEmail?: string | null;
}) {
	const { data = [] } = useQuery(invitationsQuery(workshopID, vehicleID));
	const invite = useWorkshopMutation(
		workshopID,
		inviteOwnerAction(workshopID, vehicleID),
		{ inlineErrors: true },
	);
	const [qr, setQr] = useState("");
	const [page, setPage] = useState(1);
	const invitations = useMemo(
		() => [...data].sort((a, b) => b.created_at.localeCompare(a.created_at)),
		[data],
	);
	const visible = invitations.slice(
		(page - 1) * INVITATIONS_PAGE_SIZE,
		page * INVITATIONS_PAGE_SIZE,
	);
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(schema),
		defaultValues: { email: suggestedEmail ?? "" },
	});
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await invite.mutateAsync(values.email);
			toast.success("Invitación enviada");
			setPage(1);
			form.reset();
		} catch (error) {
			applyFormError(form, error);
		}
	});
	useEffect(() => {
		if (invite.data?.url)
			void QRCode.toDataURL(invite.data.url, { margin: 1 }).then(setQr);
	}, [invite.data?.url]);

	return (
		<SectionCard
			title="Propietario"
			description={
				linked
					? "Ve el historial completo desde su cuenta"
					: "Invitalo para que conserve el historial aunque cambie de taller"
			}
		>
			<div className="space-y-4">
				{linked ? (
					<div className="flex items-center gap-3 rounded-md bg-seal-soft p-3 text-seal">
						<BadgeCheck className="size-5 shrink-0" />
						<div className="text-[13px] leading-tight">
							<p className="font-semibold">Vinculado</p>
							<p className="opacity-80">{name || "Propietario con cuenta"}</p>
						</div>
					</div>
				) : (
					<Form {...form}>
						<form
							onSubmit={submit}
							className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
							noValidate
						>
							<TextField
								name="email"
								label="Correo del propietario"
								type="email"
								autoComplete="email"
								placeholder="correo@ejemplo.com"
								required
							/>
							<SubmitButton pending={invite.isPending} pendingLabel="Enviando…">
								<Send className="size-4" />
								Invitar
							</SubmitButton>
							<RootError />
						</form>
					</Form>
				)}
				{invite.data && (
					<div className="space-y-3 rounded-md border bg-background/50 p-3">
						<p className="text-xs font-medium text-ok">
							Invitación creada. Compartila por WhatsApp o mostrá el QR.
						</p>
						<CopyField value={invite.data.url} label="Enlace de invitación" />
						<Button asChild variant="outline" className="w-full">
							<a
								href={invite.data.whatsapp_url}
								target="_blank"
								rel="noreferrer"
							>
								<MessageCircle className="size-4" />
								Compartir por WhatsApp
							</a>
						</Button>
						{qr && (
							<img
								src={qr}
								alt="Código QR de la invitación"
								width="160"
								height="160"
								className="mx-auto rounded"
							/>
						)}
					</div>
				)}
				{invitations.length > 0 && (
					<div>
						<p className="mb-1.5 text-xs font-medium text-ink-3">
							Invitaciones enviadas
							<span className="ml-1 tabular-nums">({invitations.length})</span>
						</p>
						<div className="overflow-hidden rounded-md border">
							<ul className="divide-y text-[13px]">
								{visible.map((i) => (
									<li
										key={i.id}
										className="flex items-center justify-between gap-2 px-3 py-2"
									>
										<div className="min-w-0">
											<p className="truncate">{i.email}</p>
											<p className="text-[11px] text-ink-3">
												Enviada {shortDate(i.created_at)}
											</p>
										</div>
										<span
											className={cn(
												"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
												i.status === "aceptada"
													? "bg-ok-soft text-ok"
													: "bg-secondary text-ink-2",
											)}
										>
											{invitationStatus[i.status] ?? i.status}
										</span>
									</li>
								))}
							</ul>
							{invitations.length > INVITATIONS_PAGE_SIZE && (
								<ListPagination
									page={page}
									total={invitations.length}
									pageSize={INVITATIONS_PAGE_SIZE}
									onPageChange={setPage}
									className="px-3 py-2"
								/>
							)}
						</div>
					</div>
				)}
			</div>
		</SectionCard>
	);
}
