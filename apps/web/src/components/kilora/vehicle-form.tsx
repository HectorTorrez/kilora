import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actions, useWorkshopMutation } from "@/lib/workshop";

export function VehicleForm({
	workshopID,
	onCreated,
}: {
	workshopID: string;
	onCreated: (id: string) => void;
}) {
	const [plate, setPlate] = useState("");
	const [make, setMake] = useState("");
	const [model, setModel] = useState("");
	const [year, setYear] = useState("");
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const create = useWorkshopMutation(
		workshopID,
		actions(workshopID).createVehicle,
	);
	return (
		<form
			className="grid gap-3 sm:grid-cols-2"
			onSubmit={async (e) => {
				e.preventDefault();
				try {
					const vehicle = await create.mutateAsync({
						plate: plate || null,
						make,
						model,
						year: year ? Number(year) : null,
						contact_name: name || null,
						contact_phone: phone
							? phone.startsWith("+503")
								? phone
								: `+503${phone}`
							: null,
					});
					onCreated(vehicle.id);
				} catch {}
			}}
		>
			<label htmlFor="field-1">
				Placa (opcional)
				<Input
					id="field-1"
					value={plate}
					onChange={(e) => setPlate(e.target.value)}
				/>
			</label>
			<label htmlFor="field-2">
				Marca
				<Input
					id="field-2"
					required
					value={make}
					onChange={(e) => setMake(e.target.value)}
				/>
			</label>
			<label htmlFor="field-3">
				Modelo
				<Input
					id="field-3"
					required
					value={model}
					onChange={(e) => setModel(e.target.value)}
				/>
			</label>
			<label htmlFor="field-4">
				Año
				<Input
					id="field-4"
					type="number"
					value={year}
					onChange={(e) => setYear(e.target.value)}
				/>
			</label>
			<label htmlFor="field-5">
				Nombre de contacto
				<Input
					id="field-5"
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
			</label>
			<label htmlFor="field-6">
				Teléfono (+503)
				<Input
					id="field-6"
					type="tel"
					value={phone}
					onChange={(e) => setPhone(e.target.value)}
				/>
			</label>
			<Button disabled={create.isPending} type="submit">
				Registrar vehículo
			</Button>
		</form>
	);
}
