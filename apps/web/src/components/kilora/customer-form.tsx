import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Form } from "@/components/ui/form";
import {
	type Customer,
	createCustomerAction,
	updateCustomerAction,
} from "@/features/taller/customers";
import { useWorkshopMutation } from "@/features/taller/mutation";
import {
	applyFormError,
	FormActions,
	PhoneField,
	RequiredLegend,
	RootError,
	SubmitButton,
	TextField,
} from "./form-fields";
import { emailField, optionalPhone, personName } from "./form-schemas";

const schema = z.object({
	full_name: personName,
	phone: optionalPhone.refine(Boolean, "Ingresá el teléfono del cliente"),
	email: z.union([z.literal(""), emailField]),
});

/** Alta o edición de un cliente del taller. */
export function CustomerForm({
	workshopID,
	customer,
	onSaved,
}: {
	workshopID: string;
	customer?: Pick<Customer, "id" | "full_name" | "phone" | "email">;
	onSaved: (customer: Customer) => void;
}) {
	const save = useWorkshopMutation(
		workshopID,
		customer
			? updateCustomerAction(workshopID, customer.id)
			: createCustomerAction(workshopID),
		{ inlineErrors: true },
	);
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(schema),
		defaultValues: {
			full_name: customer?.full_name ?? "",
			phone: customer?.phone ?? "",
			email: customer?.email ?? "",
		},
	});
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			const saved = await save.mutateAsync({
				full_name: values.full_name,
				phone: values.phone,
				email: values.email || null,
			});
			toast.success(customer ? "Cliente actualizado" : "Cliente registrado");
			onSaved(saved);
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<Form {...form}>
			<form onSubmit={submit} className="grid gap-5 sm:grid-cols-2" noValidate>
				<RequiredLegend className="sm:col-span-2" />
				<TextField
					name="full_name"
					label="Nombre completo"
					required
					autoFocus
					maxLength={100}
					inputPattern={/^[\p{L}\p{M} ’'.-]*$/u}
					className="sm:col-span-2"
				/>
				<PhoneField name="phone" label="Teléfono" required />
				<TextField
					name="email"
					label="Correo"
					type="email"
					optional
					description="Sirve para invitarlo a ver el historial."
				/>
				<RootError className="sm:col-span-2" />
				<FormActions>
					<SubmitButton pending={save.isPending}>
						{customer ? "Guardar cambios" : "Registrar cliente"}
					</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}
