import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useWorkshopMutation } from "@/features/taller/mutation";
import { adminActions } from "@/features/taller/team";
import {
	applyFormError,
	FormActions,
	NitField,
	RootError,
	SubmitButton,
	TextField,
} from "./form-fields";
import { formatNit, optionalNit, workshopName } from "./form-schemas";

const schema = z.object({ name: workshopName, nit: optionalNit });

type Workshop = {
	name: string;
	nit?: string | null;
	verified_at?: string | null;
};

export function EditWorkshopDialog({
	workshopID,
	workshop,
	open,
	onOpenChange,
}: {
	workshopID: string;
	workshop: Workshop;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Editar datos del taller</DialogTitle>
					<DialogDescription>
						Así aparece tu taller en órdenes, cotizaciones y en el historial de
						los vehículos.
					</DialogDescription>
				</DialogHeader>
				{open && (
					<WorkshopForm
						workshopID={workshopID}
						workshop={workshop}
						onDone={() => onOpenChange(false)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function WorkshopForm({
	workshopID,
	workshop,
	onDone,
}: {
	workshopID: string;
	workshop: Workshop;
	onDone: () => void;
}) {
	const qc = useQueryClient();
	const update = useWorkshopMutation(
		workshopID,
		adminActions(workshopID).updateWorkshop,
		{ inlineErrors: true },
	);
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(schema),
		defaultValues: { name: workshop.name, nit: formatNit(workshop.nit ?? "") },
	});
	const [name, nit] = form.watch(["name", "nit"]);
	const losesVerification =
		!!workshop.verified_at &&
		(name.trim() !== workshop.name ||
			nit.trim() !== formatNit(workshop.nit ?? ""));

	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await update.mutateAsync({ name: values.name, nit: values.nit || null });
			await qc.invalidateQueries({ queryKey: ["me"] });
			toast.success("Datos del taller actualizados");
			onDone();
		} catch (error) {
			applyFormError(form, error);
		}
	});

	return (
		<Form {...form}>
			<form onSubmit={submit} className="grid gap-4" noValidate>
				<TextField
					name="name"
					label="Nombre comercial"
					maxLength={100}
					autoFocus
					required
				/>
				<NitField optional />
				{losesVerification && (
					<Alert>
						<AlertDescription>
							Si cambiás el nombre o el NIT, el taller pierde el sello de
							verificado hasta que lo confirmemos de nuevo.
						</AlertDescription>
					</Alert>
				)}
				<RootError />
				<FormActions>
					<Button type="button" variant="outline" onClick={onDone}>
						Cancelar
					</Button>
					<SubmitButton pending={update.isPending}>
						Guardar cambios
					</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}
