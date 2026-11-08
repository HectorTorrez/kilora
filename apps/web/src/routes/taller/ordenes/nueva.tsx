import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useWorkshopId } from "@/components/kilora/app-shell";
import { VehicleForm } from "@/components/kilora/vehicle-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { actions, useWorkshopMutation, vehiclesQuery } from "@/lib/workshop";
import { Route as TallerRoute } from "@/routes/taller";
export const Route = createFileRoute("/taller/ordenes/nueva")({
	component: NewOrderPage,
});
function NewOrderPage() {
	const workshopID = useWorkshopId();
	const { me } = TallerRoute.useRouteContext();
	const branches = me.memberships.filter((m) => m.workshop_id === workshopID);
	const navigate = useNavigate();
	const [branch, setBranch] = useState("");
	const [search, setSearch] = useState("");
	const [vehicle, setVehicle] = useState("");
	const [creating, setCreating] = useState(false);
	const [reason, setReason] = useState("");
	const [km, setKm] = useState("");
	const [notes, setNotes] = useState("");
	const { data } = useQuery(vehiclesQuery(workshopID, search));
	const create = useWorkshopMutation(
		workshopID,
		actions(workshopID).createOrder,
	);
	return (
		<main className="mx-auto max-w-4xl space-y-5 px-5 py-7">
			<h1 className="font-display text-3xl font-bold">Registrar orden</h1>
			<section className="space-y-3 rounded-lg border bg-card p-5">
				<h2 className="font-semibold">Vehículo</h2>
				<Input
					placeholder="Buscar por placa"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<select
					aria-label="Vehículo"
					value={vehicle}
					onChange={(e) => setVehicle(e.target.value)}
					className="w-full rounded border p-2"
				>
					<option value="">Elegí un vehículo</option>
					{data?.map((v) => (
						<option key={v.id} value={v.id}>
							{v.plate || "Sin placa"} · {v.make} {v.model}
						</option>
					))}
				</select>
				<Button
					type="button"
					variant="outline"
					onClick={() => setCreating(!creating)}
				>
					{" "}
					{creating ? "Cerrar" : "Registrar vehículo provisional"}
				</Button>
				{creating && (
					<VehicleForm
						workshopID={workshopID}
						onCreated={(id) => {
							setVehicle(id);
							setCreating(false);
							setSearch("");
						}}
					/>
				)}
			</section>
			<form
				className="space-y-4 rounded-lg border bg-card p-5"
				onSubmit={async (e) => {
					e.preventDefault();
					try {
						const order = await create.mutateAsync({
							vehicle_id: vehicle,
							branch_id: branch || branches[0]?.branch_id,
							reason,
							odometer_km: km ? Number(km) : null,
							internal_notes: notes || null,
						});
						await navigate({
							to: "/taller/ordenes/$orderId",
							params: { orderId: order.id },
						});
					} catch {}
				}}
			>
				<label className="block">
					Sucursal
					<select
						required
						value={branch || branches[0]?.branch_id || ""}
						onChange={(e) => setBranch(e.target.value)}
						className="mt-1 w-full rounded border p-2"
					>
						{branches.map((b) => (
							<option key={b.branch_id} value={b.branch_id}>
								{b.branch_name}
							</option>
						))}
					</select>
				</label>
				<label className="block" htmlFor="field-1">
					Motivo
					<Input
						id="field-1"
						required
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
				</label>
				<label className="block" htmlFor="field-2">
					Kilometraje
					<Input
						id="field-2"
						type="number"
						min="0"
						value={km}
						onChange={(e) => setKm(e.target.value)}
					/>
				</label>
				<label className="block" htmlFor="field-3">
					Notas internas · privadas del taller
					<Textarea
						id="field-3"
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
					/>
				</label>
				<Button disabled={!vehicle || create.isPending}>Registrar orden</Button>
			</form>
		</main>
	);
}
