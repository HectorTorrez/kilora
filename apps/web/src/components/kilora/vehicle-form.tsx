import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { actions, useWorkshopMutation } from "@/lib/workshop";
import {
	applyFormError,
	FormActions,
	NumberField,
	RequiredLegend,
	RootError,
	SubmitButton,
	TextField,
} from "./form-fields";
import {
	maskSvPhone,
	optionalPhone,
	optionalText,
	requiredText,
	toSvPhone,
	yearBounds,
	yearField,
} from "./form-schemas";

const schema = z.object({
	make: requiredText("Ingresá la marca"),
	model: requiredText("Ingresá el modelo"),
	year: yearField(false),
	plate: optionalText,
	contact_name: optionalText,
	contact_phone: optionalPhone,
});

export function VehicleForm({
	workshopID,
	onCreated,
	onCancel,
}: {
	workshopID: string;
	onCreated: (vehicle: {
		id: string;
		plate: string | null;
		make: string;
		model: string;
		year: number | null;
	}) => void;
	onCancel?: () => void;
}) {
	const bounds = yearBounds();
	const create = useWorkshopMutation(
		workshopID,
		actions(workshopID).createVehicle,
	);
	const form = useForm({
		resolver: zodResolver(schema),
		defaultValues: {
			make: "",
			model: "",
			year: "",
			plate: "",
			contact_name: "",
			contact_phone: "",
		},
	});
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			const vehicle = await create.mutateAsync({
				plate: values.plate.toUpperCase() || null,
				make: values.make,
				model: values.model,
				year: values.year ? Number(values.year) : null,
				contact_name: values.contact_name || null,
				contact_phone: toSvPhone(values.contact_phone),
			});
			toast.success("Vehículo registrado");
			onCreated(vehicle);
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<Form {...form}>
			<form onSubmit={submit} className="grid gap-5 sm:grid-cols-2" noValidate>
				<RequiredLegend className="sm:col-span-2" />
				<TextField name="make" label="Marca" autoFocus required />
				<TextField name="model" label="Modelo" required />
				<NumberField
					name="year"
					label="Año"
					optional
					min={bounds.min}
					max={bounds.max}
					step={1}
				/>
				<TextField
					name="plate"
					label="Placa"
					optional
					uppercase
					placeholder="P123456"
				/>
				<TextField name="contact_name" label="Nombre de contacto" optional />
				<TextField
					name="contact_phone"
					label="Teléfono"
					optional
					prefix="+503"
					inputMode="numeric"
					autoComplete="tel"
					normalize={maskSvPhone}
					description="8 dígitos, sin el código de país"
				/>
				<RootError />
				<FormActions>
					{onCancel ? (
						<Button
							type="button"
							variant="outline"
							className="w-full sm:w-auto"
							onClick={onCancel}
						>
							Cancelar
						</Button>
					) : null}
					<SubmitButton pending={create.isPending}>
						Registrar vehículo
					</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}
