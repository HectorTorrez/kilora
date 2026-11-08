import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useWorkshopId } from "@/components/kilora/app-shell";
import { VehicleForm } from "@/components/kilora/vehicle-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
			<Card className="space-y-3 gap-0 rounded-lg p-5 shadow-none">
				<h2 className="font-semibold">Vehículo</h2>
				<Input
					placeholder="Buscar por placa"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<Select value={vehicle} onValueChange={setVehicle}>
					<SelectTrigger aria-label="Vehículo" className="w-full">
						<SelectValue placeholder="Elegí un vehículo" />
					</SelectTrigger>
					<SelectContent>
						{data?.map((v) => (
							<SelectItem key={v.id} value={v.id}>
								{v.plate || "Sin placa"} · {v.make} {v.model}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
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
			</Card>
			<Card className="gap-0 rounded-lg p-5 shadow-none">
				<form
					className="space-y-4"
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
					<div>
						<Label htmlFor="branch">Sucursal</Label>
						<Select
							value={branch || branches[0]?.branch_id || ""}
							onValueChange={setBranch}
							required
						>
							<SelectTrigger id="branch" className="mt-1 w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{branches.map((b) => (
									<SelectItem key={b.branch_id} value={b.branch_id}>
										{b.branch_name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<Label className="block" htmlFor="field-1">
						Motivo
						<Input
							id="field-1"
							required
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
					</Label>
					<Label className="block" htmlFor="field-2">
						Kilometraje
						<Input
							id="field-2"
							type="number"
							min="0"
							value={km}
							onChange={(e) => setKm(e.target.value)}
						/>
					</Label>
					<Label className="block" htmlFor="field-3">
						Notas internas · privadas del taller
						<Textarea
							id="field-3"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
						/>
					</Label>
					<Button disabled={!vehicle || create.isPending}>
						Registrar orden
					</Button>
				</form>
			</Card>
		</main>
	);
}
