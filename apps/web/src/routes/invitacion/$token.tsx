import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { meQuery } from "@/lib/auth";
import { date } from "@/lib/format";
import { invitationQuery, ownerActions, useOwnerMutation } from "@/lib/owner";
export const Route = createFileRoute("/invitacion/$token")({
	loader: async ({ context, params }) => {
		const [inv, me] = await Promise.all([
			context.queryClient
				.ensureQueryData(invitationQuery(params.token))
				.catch(() => null),
			context.queryClient.ensureQueryData(meQuery()),
		]);
		if (!inv) throw notFound();
		return { inv, me };
	},
	notFoundComponent: () => (
		<main className="mx-auto max-w-lg p-8">
			<h1 className="font-display text-2xl font-bold">
				Invitación no disponible
			</h1>
			<p className="mt-3">
				Puede haber vencido o ya no estar disponible. Pedí un nuevo enlace al
				taller.
			</p>
		</main>
	),
	component: Page,
});
function Page() {
	const { token } = Route.useParams();
	const initial = Route.useLoaderData();
	const { data: inv, isLoading } = useQuery({
		...invitationQuery(token),
		initialData: initial.inv,
	});
	const { data: me } = useQuery({ ...meQuery(), initialData: initial.me });
	const [consent, setConsent] = useState(false);
	const accept = useOwnerMutation(ownerActions.accept);
	const navigate = useNavigate();
	const redirect = `/invitacion/${encodeURIComponent(token)}`;
	return (
		<main className="mx-auto min-h-dvh max-w-lg px-5 py-10">
			<Link to="/" className="font-display text-xl font-bold tracking-widest">
				KILORA
			</Link>
			{isLoading ? (
				<p className="mt-10">Cargando invitación…</p>
			) : !inv ? (
				<section className="mt-12">
					<h1 className="font-display text-2xl font-bold">
						Invitación no disponible
					</h1>
					<p className="mt-3 text-ink-3">
						Puede haber vencido o ya no estar disponible. Pedí un nuevo enlace
						al taller.
					</p>
				</section>
			) : (
				<section className="mt-12 space-y-5">
					<p className="text-sm text-seal">INVITACIÓN AL HISTORIAL</p>
					<h1 className="font-display text-3xl font-bold">
						{inv.workshop_name} te invita a Kilora
					</h1>
					{inv.workshop_verified_at && (
						<p className="text-sm text-seal">✓ Taller verificado</p>
					)}
					<div className="rounded-xl border bg-card p-5">
						<p className="font-mono">{inv.vehicle?.plate || "Sin placa"}</p>
						<p className="mt-2 text-xl font-bold">
							{inv.vehicle?.make} {inv.vehicle?.model} {inv.vehicle?.year}
						</p>
						<p className="mt-3 text-sm text-ink-3">
							Para {inv.email_hint} · Vence{" "}
							{inv.expires_at ? date(inv.expires_at) : "—"}
						</p>
					</div>
					{!me ? (
						<div className="grid gap-3">
							<Button asChild>
								<Link to="/registro" search={{ redirect }}>
									Crear cuenta
								</Link>
							</Button>
							<Button variant="outline" asChild>
								<Link to="/login" search={{ redirect }}>
									Ya tengo cuenta
								</Link>
							</Button>
						</div>
					) : (
						<div className="space-y-4">
							<label className="flex items-start gap-3 text-sm">
								<input
									type="checkbox"
									checked={consent}
									onChange={(e) => setConsent(e.target.checked)}
									className="mt-1"
								/>
								Autorizo que {inv.workshop_name} registre los servicios de este
								vehículo en mi historial Kilora y acceda a la información
								compartida con talleres vinculados.
							</label>
							<Button
								disabled={!consent || accept.isPending}
								onClick={async () => {
									try {
										const v = await accept.mutateAsync(token);
										if (v.id)
											await navigate({
												to: "/mis-vehiculos/$vehicleId",
												params: { vehicleId: v.id },
											});
									} catch {}
								}}
							>
								Aceptar invitación
							</Button>
							{accept.error && (
								<p role="alert" className="text-destructive">
									{accept.error.message}
								</p>
							)}
						</div>
					)}
				</section>
			)}
		</main>
	);
}
