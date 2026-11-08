import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { invitationsQuery, ownerActions, useOwnerMutation } from "@/lib/owner";
import {
	applyFormError,
	RootError,
	SubmitButton,
	TextField,
} from "./form-fields";
import { emailField } from "./form-schemas";

const schema = z.object({ email: emailField });

export function OwnerInvitation({
	workshopID,
	vehicleID,
	linked,
	name,
}: {
	workshopID: string;
	vehicleID: string;
	linked?: boolean;
	name?: string | null;
}) {
	const { data = [] } = useQuery(invitationsQuery(workshopID, vehicleID));
	const invite = useOwnerMutation((email: string) =>
		ownerActions.invite(workshopID, vehicleID, email),
	);
	const [qr, setQr] = useState("");
	const form = useForm({
		resolver: zodResolver(schema),
		defaultValues: { email: "" },
	});
	useEffect(() => {
		if (invite.data?.url) void QRCode.toDataURL(invite.data.url).then(setQr);
	}, [invite.data?.url]);
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await invite.mutateAsync(values.email);
			toast.success("Invitación enviada");
			form.reset();
		} catch (error) {
			applyFormError(form, error, { toast: true });
		}
	});
	return (
		<Card className="gap-0 space-y-4 p-5 shadow-none">
			<h2 className="font-display text-xl font-bold">Propietario</h2>
			{linked ? (
				<p>Vinculado a {name || "propietario"}</p>
			) : (
				<Form {...form}>
					<form
						onSubmit={submit}
						className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end"
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
							Invitar al propietario
						</SubmitButton>
						<RootError className="sm:col-span-2" />
					</form>
				</Form>
			)}
			{invite.data && (
				<div className="space-y-3">
					<p className="text-sm font-medium">Enlace de invitación</p>
					<p className="break-all text-sm text-ink-3">{invite.data.url}</p>
					<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
						<Button
							variant="outline"
							className="w-full sm:w-auto"
							onClick={() => {
								void navigator.clipboard.writeText(invite.data.url);
								toast.success("Enlace copiado");
							}}
						>
							Copiar enlace
						</Button>
						<Button asChild variant="outline" className="w-full sm:w-auto">
							<a
								href={invite.data.whatsapp_url}
								target="_blank"
								rel="noreferrer"
							>
								Compartir por WhatsApp
							</a>
						</Button>
					</div>
					{qr && (
						<img
							src={qr}
							alt="Código QR de la invitación"
							width="180"
							height="180"
							className="rounded-lg border bg-white p-2"
						/>
					)}
				</div>
			)}
			{data.length > 0 && (
				<div className="space-y-1">
					<h3 className="font-semibold">Invitaciones</h3>
					{data.map((i) => (
						<p key={i.id} className="text-sm text-ink-3">
							{i.email} · {i.status}
						</p>
					))}
				</div>
			)}
		</Card>
	);
}
