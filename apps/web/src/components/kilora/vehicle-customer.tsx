import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, UserRound } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
	type CustomerRef,
	setVehicleCustomerAction,
} from "@/features/taller/customers";
import { useWorkshopMutation } from "@/features/taller/mutation";
import { phone } from "@/lib/format";
import {
	CustomerPicker,
	customerPickerDefaults,
	customerPickerSchema,
	toCustomerChoice,
} from "./customer-picker";
import { FormDialog } from "./form-dialog";
import {
	applyFormError,
	FormActions,
	RootError,
	SubmitButton,
} from "./form-fields";
import { DetailList, SectionCard } from "./workshop-ui";

const schema = z.object({ customer: customerPickerSchema });

/** Cliente del taller a cuyo nombre está el vehículo, con opción de cambiarlo. */
export function VehicleCustomerCard({
	workshopID,
	vehicleID,
	customer,
}: {
	workshopID: string;
	vehicleID: string;
	customer: CustomerRef | null;
}) {
	const [open, setOpen] = useState(false);
	return (
		<SectionCard
			title="Cliente"
			description={
				customer
					? undefined
					: "Este vehículo todavía no tiene cliente asignado."
			}
			actions={
				<Button
					type="button"
					variant={customer ? "ghost" : "default"}
					size="sm"
					onClick={() => setOpen(true)}
				>
					{customer ? (
						<>
							<ArrowLeftRight className="size-4" />
							Cambiar
						</>
					) : (
						"Asignar cliente"
					)}
				</Button>
			}
		>
			{customer ? (
				<div className="space-y-3">
					<Link
						to="/taller/clientes/$customerId"
						params={{ customerId: customer.id }}
						className="flex items-center gap-2 text-[14px] font-semibold hover:underline"
					>
						<UserRound className="size-4 text-ink-3" />
						{customer.full_name}
					</Link>
					<DetailList
						items={[
							{
								label: "Teléfono",
								value: phone(customer.phone),
								mono: true,
								empty: "Sin teléfono",
							},
							{ label: "Correo", value: customer.email, empty: "Sin correo" },
						]}
					/>
				</div>
			) : (
				<p className="text-sm text-ink-3">
					Asignale un cliente para poder contactarlo e invitarlo.
				</p>
			)}
			<FormDialog
				open={open}
				onOpenChange={setOpen}
				title={customer ? "Cambiar cliente" : "Asignar cliente"}
				description="Elegí un cliente del taller o registrá uno nuevo."
			>
				<ChangeCustomerForm
					workshopID={workshopID}
					vehicleID={vehicleID}
					onDone={() => setOpen(false)}
				/>
			</FormDialog>
		</SectionCard>
	);
}

function ChangeCustomerForm({
	workshopID,
	vehicleID,
	onDone,
}: {
	workshopID: string;
	vehicleID: string;
	onDone: () => void;
}) {
	const save = useWorkshopMutation(
		workshopID,
		setVehicleCustomerAction(workshopID, vehicleID),
		{ inlineErrors: true },
	);
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(schema),
		defaultValues: { customer: customerPickerDefaults() },
	});
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await save.mutateAsync(toCustomerChoice(values.customer));
			toast.success("Cliente actualizado");
			onDone();
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<Form {...form}>
			<form onSubmit={submit} className="grid gap-5" noValidate>
				<CustomerPicker workshopID={workshopID} autoFocus />
				<RootError />
				<FormActions>
					<SubmitButton pending={save.isPending}>Guardar</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}
