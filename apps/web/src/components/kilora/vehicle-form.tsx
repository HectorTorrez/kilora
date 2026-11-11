import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Form } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import type { CustomerRef } from "@/features/taller/customers";
import { useWorkshopMutation } from "@/features/taller/mutation";
import { createVehicleAction } from "@/features/taller/vehicles";
import {
	CustomerPicker,
	customerPickerDefaults,
	customerPickerSchema,
	toCustomerChoice,
} from "./customer-picker";
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
	optionalYearField,
	plateField,
	vehicleText,
	yearBounds,
} from "./form-schemas";

const schema = z.object({
	customer: customerPickerSchema,
	make: vehicleText,
	model: vehicleText,
	year: optionalYearField(),
	plate: plateField,
});

export function VehicleForm({
	workshopID,
	customer,
	onCreated,
}: {
	workshopID: string;
	/** Cliente fijo: el vehículo se registra a su nombre sin poder cambiarlo. */
	customer?: CustomerRef;
	onCreated: (vehicle: {
		id: string;
		plate: string | null;
		make: string;
		model: string;
		year: number | null;
	}) => void;
}) {
	const bounds = yearBounds();
	const create = useWorkshopMutation(
		workshopID,
		createVehicleAction(workshopID),
		{ inlineErrors: true },
	);
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(schema),
		defaultValues: {
			customer: customerPickerDefaults(customer),
			make: "",
			model: "",
			year: "",
			plate: "",
		},
	});
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			const vehicle = await create.mutateAsync({
				...toCustomerChoice(values.customer),
				plate: values.plate.toUpperCase() || null,
				make: values.make,
				model: values.model,
				year: values.year ? Number(values.year) : null,
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
				<div className="sm:col-span-2">
					<CustomerPicker
						workshopID={workshopID}
						initial={customer}
						locked={!!customer}
						autoFocus={!customer}
					/>
				</div>
				<Separator className="sm:col-span-2" />
				<TextField name="make" label="Marca" autoFocus={!!customer} required />
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
				<RootError className="sm:col-span-2" />
				<FormActions>
					<SubmitButton pending={create.isPending}>
						Registrar vehículo
					</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}
