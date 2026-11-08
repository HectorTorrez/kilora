import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { day, km, plural } from "@/lib/format";
import {
	ownerActions,
	ownerVehiclesQuery,
	useOwnerMutation,
} from "@/lib/owner";
export const Route = createFileRoute("/mis-vehiculos/")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(ownerVehiclesQuery()),
	component: Page,
});
function Page() {
	const initial = Route.useLoaderData();
	const { data = [], error } = useQuery({
		...ownerVehiclesQuery(),
		initialData: initial,
	});
	const [open, setOpen] = useState(false);
	const create = useOwnerMutation(ownerActions.create);
	const navigate = useNavigate();
	return (
		<main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="text-sm text-ink-3">Tu historial, siempre a mano</p>
					<h1 className="font-display text-3xl font-bold">Mis vehículos</h1>
				</div>
				<Button onClick={() => setOpen(!open)}>Registrar mi vehículo</Button>
			</div>
			{open && (
				<Card className="gap-0 p-5 shadow-none">
					<form
						className="grid gap-3 sm:grid-cols-2"
						onSubmit={async (e) => {
							e.preventDefault();
							const f = new FormData(e.currentTarget);
							const v = await create.mutateAsync({
								plate: String(f.get("plate") || ""),
								make: String(f.get("make")),
								model: String(f.get("model")),
								...(f.get("year") ? { year: Number(f.get("year")) } : {}),
							});
							if (v.id)
								await navigate({
									to: "/mis-vehiculos/$vehicleId",
									params: { vehicleId: v.id },
								});
						}}
					>
						<Input name="plate" placeholder="Placa (opcional)" />
						<Input name="make" placeholder="Marca" required />
						<Input name="model" placeholder="Modelo" required />
						<Input
							name="year"
							placeholder="Año (opcional)"
							type="number"
							min="1886"
						/>
						<Button disabled={create.isPending}>Guardar vehículo</Button>
						{create.error && (
							<Alert variant="destructive">
								<AlertDescription>{create.error.message}</AlertDescription>
							</Alert>
						)}
					</form>
				</Card>
			)}
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error.message}</AlertDescription>
				</Alert>
			)}
			{!data.length && !error && (
				<Card className="gap-0 p-8 text-center shadow-none">
					<h2 className="font-display text-xl font-bold">
						Todavía no tenés vehículos
					</h2>
					<p className="mt-2 text-ink-3">
						Registrá uno para comenzar tu historial.
					</p>
				</Card>
			)}
			<div className="grid gap-4 sm:grid-cols-2">
				{data.map((v) => (
					<Link
						key={v.id}
						to="/mis-vehiculos/$vehicleId"
						params={{ vehicleId: v.id || "" }}
						className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					>
						<Card className="h-full gap-0 p-5 shadow-none hover:border-seal">
							<p className="font-mono text-sm text-seal">
								{v.plate || "Sin placa"}
							</p>
							<h2 className="mt-2 font-display text-xl font-bold">
								{v.make} {v.model} {v.year}
							</h2>
							<p className="mt-4 text-sm text-ink-3">
								Último servicio:{" "}
								{v.last_service
									? v.last_service.summary ||
										day(v.last_service.performed_on) ||
										"Registrado"
									: "Sin servicios"}
							</p>
							<p className="text-sm text-ink-3">
								{km(v.last_odometer_km)} ·{" "}
								{plural(v.history_count ?? 0, "registro", "registros")}
							</p>
						</Card>
					</Link>
				))}
			</div>
			<Link to="/onboarding" className="text-sm text-ink-3 underline">
				¿Tienes un taller? Regístralo
			</Link>
		</main>
	);
}
