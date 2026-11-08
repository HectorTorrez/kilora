import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { invitationsQuery, ownerActions, useOwnerMutation } from "@/lib/owner";
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
	useEffect(() => {
		if (invite.data?.url) void QRCode.toDataURL(invite.data.url).then(setQr);
	}, [invite.data?.url]);
	return (
		<Card className="space-y-3 gap-0 p-5 shadow-none">
			<h2 className="font-display text-xl font-bold">Propietario</h2>
			{linked ? (
				<p>Vinculado a {name || "propietario"}</p>
			) : (
				<form
					className="flex flex-wrap gap-2"
					onSubmit={async (e) => {
						e.preventDefault();
						const f = new FormData(e.currentTarget);
						try {
							await invite.mutateAsync(String(f.get("email")));
						} catch {}
					}}
				>
					<Input
						type="email"
						name="email"
						placeholder="Correo del propietario"
						required
					/>
					<Button disabled={invite.isPending}>Invitar al propietario</Button>
				</form>
			)}
			{invite.error && (
				<Alert variant="destructive" className="text-destructive">
					<AlertDescription>{invite.error.message}</AlertDescription>
				</Alert>
			)}
			{invite.data && (
				<div className="space-y-3">
					<p className="break-all text-sm">{invite.data.url}</p>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							onClick={() =>
								void navigator.clipboard.writeText(invite.data.url)
							}
						>
							Copiar enlace
						</Button>
						<Button asChild variant="outline">
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
						/>
					)}
				</div>
			)}
			{data.length > 0 && (
				<div>
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
