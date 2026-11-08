import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useWorkshopId } from "@/components/kilora/app-shell";
import { VehicleForm } from "@/components/kilora/vehicle-form";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { vehiclesQuery } from "@/lib/workshop";
export const Route = createFileRoute("/taller/")({ component: VehiclesPage });
function VehiclesPage() {
	const workshopID = useWorkshopId();
	const [search, setSearch] = useState("");
	const [open, setOpen] = useState(false);
	const { data, isLoading, error } = useQuery(
		vehiclesQuery(workshopID, search),
	);
	return (
		<main className="mx-auto max-w-7xl space-y-5 px-5 py-7">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="text-xs text-ink-3">TALLER</p>
					<h1 className="font-display text-3xl font-bold">Vehículos</h1>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" onClick={() => setOpen(true)}>
						Registrar vehículo
					</Button>
					<Button asChild>
						<Link to="/taller/ordenes/nueva">Nueva orden</Link>
					</Button>
				</div>
			</div>
			<Input
				aria-label="Buscar placa"
				placeholder="Buscar por placa"
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				className="max-w-sm bg-card"
			/>
			<div className="overflow-hidden rounded-lg border bg-card">
				{isLoading ? (
					<p className="p-6">Cargando vehículos…</p>
				) : error ? (
					<p className="p-6" role="alert">
						{error.message}
					</p>
				) : !data?.length ? (
					<p className="p-8 text-center text-ink-3">
						No hay vehículos{search ? " con esa placa" : " registrados"}.
						Registrá uno para comenzar.
					</p>
				) : (
					data.map((v) => (
						<div
							key={v.id}
							className="flex flex-wrap justify-between gap-3 border-b p-4 last:border-0"
						>
							<div>
								<p className="font-mono font-semibold">
									{v.plate || "Sin placa"}
								</p>
								<p className="text-sm text-ink-3">
									{v.make} {v.model} {v.year}
								</p>
							</div>
							<div className="text-sm">
								{v.contact_name || "Sin contacto"}
								<p className="text-ink-3">{v.contact_phone}</p>
							</div>
							<span className="text-sm text-ink-3">
								{v.last_odometer_km != null
									? `${v.last_odometer_km.toLocaleString("es-SV")} km`
									: "Sin kilometraje"}
							</span>
						</div>
					))
				)}
			</div>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Registrar vehículo provisional</DialogTitle>
					</DialogHeader>
					<VehicleForm
						workshopID={workshopID}
						onCreated={() => setOpen(false)}
					/>
				</DialogContent>
			</Dialog>
		</main>
	);
}
