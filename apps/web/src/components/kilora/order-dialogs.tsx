import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useWorkshopMutation } from "@/features/taller/mutation";
import { orderActions } from "@/features/taller/orders";
import { categoryLabels } from "@/lib/domain";
import { FormDialog } from "./form-dialog";
import {
	applyFormError,
	FormActions,
	NumberField,
	RequiredLegend,
	RootError,
	SelectField,
	SubmitButton,
	TextareaField,
	TextField,
} from "./form-fields";
import {
	kmField,
	moneyField,
	optionalText,
	quantityField,
	requiredText,
} from "./form-schemas";

type S = components["schemas"];

const categoryOptions = [
	{ value: "none", label: "Sin categoría" },
	...Object.entries(categoryLabels).map(([value, label]) => ({ value, label })),
];

function Cancel({ onClick }: { onClick: () => void }) {
	return (
		<Button
			type="button"
			variant="outline"
			className="w-full sm:w-auto"
			onClick={onClick}
		>
			Cancelar
		</Button>
	);
}

const jobSchema = z.object({
	description: requiredText("Ingresá el trabajo realizado").max(
		200,
		"Usá como máximo 200 caracteres",
	),
	category: z.string(),
	labor_price: moneyField(),
});

export function JobDialog({
	workshopID,
	orderID,
	open,
	onOpenChange,
}: {
	workshopID: string;
	orderID: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<FormDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Agregar trabajo"
			description="Un trabajo es lo que se cobra como mano de obra. Las piezas se agregan dentro de cada trabajo."
		>
			<JobForm
				workshopID={workshopID}
				orderID={orderID}
				onDone={() => onOpenChange(false)}
			/>
		</FormDialog>
	);
}

function JobForm({
	workshopID,
	orderID,
	onDone,
}: {
	workshopID: string;
	orderID: string;
	onDone: () => void;
}) {
	const job = useWorkshopMutation(
		workshopID,
		orderActions(workshopID, orderID).job,
		{ inlineErrors: true },
	);
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(jobSchema),
		defaultValues: { description: "", category: "none", labor_price: "" },
	});
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await job.mutateAsync({
				description: values.description,
				labor_price: values.labor_price || "0",
				category:
					values.category === "none"
						? null
						: (values.category as S["PartCategory"]),
			});
			toast.success("Trabajo agregado");
			onDone();
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<Form {...form}>
			<form onSubmit={submit} className="grid gap-5" noValidate>
				<RequiredLegend />
				<TextField
					name="description"
					label="Trabajo realizado"
					placeholder="Ej. Cambio de pastillas de freno"
					maxLength={200}
					autoFocus
					required
				/>
				<div className="grid gap-5 sm:grid-cols-2">
					<NumberField
						name="labor_price"
						label="Mano de obra"
						prefix="$"
						min={0}
						step="0.01"
						placeholder="0.00"
						optional
					/>
					<SelectField
						name="category"
						label="Categoría"
						options={categoryOptions}
						optional
					/>
				</div>
				<p className="-mt-2 text-xs text-ink-3">
					La categoría sirve para que la ficha del vehículo recuerde el último
					cambio de aceite, frenos, batería, etc.
				</p>
				<RootError />
				<FormActions>
					<Cancel onClick={onDone} />
					<SubmitButton pending={job.isPending}>Agregar trabajo</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}

const partSchema = z.object({
	name: requiredText("Ingresá el nombre de la pieza").max(
		200,
		"Usá como máximo 200 caracteres",
	),
	brand: optionalText.max(100, "Usá como máximo 100 caracteres"),
	quantity: quantityField,
	unit_price: moneyField(),
});

export function PartDialog({
	workshopID,
	orderID,
	job,
	onOpenChange,
}: {
	workshopID: string;
	orderID: string;
	job: { id: string; description: string } | null;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<FormDialog
			open={!!job}
			onOpenChange={onOpenChange}
			title="Agregar pieza"
			description={job ? `Pieza usada en «${job.description}».` : undefined}
		>
			{job && (
				<PartForm
					workshopID={workshopID}
					orderID={orderID}
					jobID={job.id}
					onDone={() => onOpenChange(false)}
				/>
			)}
		</FormDialog>
	);
}

function PartForm({
	workshopID,
	orderID,
	jobID,
	onDone,
}: {
	workshopID: string;
	orderID: string;
	jobID: string;
	onDone: () => void;
}) {
	const part = useWorkshopMutation(
		workshopID,
		orderActions(workshopID, orderID).part,
		{ inlineErrors: true },
	);
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(partSchema),
		defaultValues: { name: "", brand: "", quantity: "1", unit_price: "" },
	});
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await part.mutateAsync({
				jobID,
				body: {
					name: values.name,
					brand: values.brand || null,
					quantity: values.quantity,
					unit_price: values.unit_price || "0",
				},
			});
			toast.success("Pieza agregada");
			onDone();
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<Form {...form}>
			<form onSubmit={submit} className="grid gap-5" noValidate>
				<RequiredLegend />
				<div className="grid gap-5 sm:grid-cols-2">
					<TextField
						name="name"
						label="Pieza"
						placeholder="Ej. Pastillas delanteras"
						maxLength={200}
						autoFocus
						required
					/>
					<TextField
						name="brand"
						label="Marca"
						placeholder="Ej. Bosch"
						maxLength={100}
						optional
					/>
					<NumberField
						name="quantity"
						label="Cantidad"
						min={0.01}
						step="0.01"
						required
					/>
					<NumberField
						name="unit_price"
						label="Precio unitario"
						prefix="$"
						min={0}
						step="0.01"
						placeholder="0.00"
						optional
					/>
				</div>
				<RootError />
				<FormActions>
					<Cancel onClick={onDone} />
					<SubmitButton pending={part.isPending}>Agregar pieza</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}

const editSchema = z.object({
	reason: requiredText("Ingresá el motivo de ingreso"),
	km: kmField(),
	public_notes: optionalText,
	internal_notes: optionalText,
});

export function EditOrderDialog({
	workshopID,
	order,
	open,
	onOpenChange,
}: {
	workshopID: string;
	order: S["WorkOrderDetail"];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<FormDialog
			open={open}
			onOpenChange={onOpenChange}
			title={`Editar orden #${order.number}`}
			className="sm:max-w-lg"
		>
			<EditOrderForm
				workshopID={workshopID}
				order={order}
				onDone={() => onOpenChange(false)}
			/>
		</FormDialog>
	);
}

function EditOrderForm({
	workshopID,
	order,
	onDone,
}: {
	workshopID: string;
	order: S["WorkOrderDetail"];
	onDone: () => void;
}) {
	const edit = useWorkshopMutation(
		workshopID,
		orderActions(workshopID, order.id).edit,
		{ inlineErrors: true },
	);
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(editSchema),
		defaultValues: {
			reason: order.reason,
			km: order.odometer_km?.toString() ?? "",
			public_notes: order.public_notes ?? "",
			internal_notes: order.internal_notes ?? "",
		},
	});
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await edit.mutateAsync({
				reason: values.reason,
				odometer_km: values.km ? Number(values.km) : null,
				public_notes: values.public_notes || null,
				internal_notes: values.internal_notes || null,
			});
			toast.success("Orden actualizada");
			onDone();
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<Form {...form}>
			<form onSubmit={submit} className="grid gap-5" noValidate>
				<RequiredLegend />
				<TextField name="reason" label="Motivo de ingreso" autoFocus required />
				<NumberField
					name="km"
					label="Kilometraje de ingreso"
					suffix="km"
					min={0}
					step={1}
					optional
					className="sm:max-w-60"
				/>
				<TextareaField
					name="public_notes"
					label="Notas para el propietario"
					description="Aparecen en el historial del vehículo cuando la orden se publica."
					optional
				/>
				<TextareaField
					name="internal_notes"
					label={
						<span className="inline-flex items-center gap-1.5">
							<Lock className="size-3.5 text-ink-3" aria-hidden="true" />
							Notas internas
						</span>
					}
					description="Solo las ve tu taller. Nunca se muestran al propietario ni a otros talleres."
					optional
				/>
				<RootError />
				<FormActions>
					<Cancel onClick={onDone} />
					<SubmitButton pending={edit.isPending}>Guardar cambios</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}

const cancelSchema = z.object({
	reason: requiredText("Contá por qué se cancela la orden"),
});

export function CancelOrderDialog({
	workshopID,
	order,
	open,
	onOpenChange,
}: {
	workshopID: string;
	order: S["WorkOrderDetail"];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<FormDialog
			open={open}
			onOpenChange={onOpenChange}
			title={`¿Cancelar la orden #${order.number}?`}
			description="La orden se cierra y no se publica en el historial del vehículo. Esta acción no se puede deshacer."
		>
			<CancelOrderForm
				workshopID={workshopID}
				orderID={order.id}
				onDone={() => onOpenChange(false)}
			/>
		</FormDialog>
	);
}

function CancelOrderForm({
	workshopID,
	orderID,
	onDone,
}: {
	workshopID: string;
	orderID: string;
	onDone: () => void;
}) {
	const status = useWorkshopMutation(
		workshopID,
		orderActions(workshopID, orderID).status,
		{ inlineErrors: true },
	);
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(cancelSchema),
		defaultValues: { reason: "" },
	});
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await status.mutateAsync({
				status: "cancelado",
				cancel_reason: values.reason,
			});
			toast.success("Orden cancelada");
			onDone();
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<Form {...form}>
			<form onSubmit={submit} className="grid gap-5" noValidate>
				<TextareaField
					name="reason"
					label="Motivo de la cancelación"
					placeholder="Ej. El cliente decidió no hacer la reparación"
					autoFocus
					required
				/>
				<RootError />
				<FormActions>
					<Button
						type="button"
						variant="outline"
						className="w-full sm:w-auto"
						onClick={onDone}
					>
						Volver
					</Button>
					<SubmitButton
						pending={status.isPending}
						pendingLabel="Cancelando…"
						variant="destructive"
					>
						Cancelar orden
					</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}
