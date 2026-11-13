import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import {
	type UseFieldArrayReturn,
	useFieldArray,
	useForm,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
	applyFormError,
	DateField,
	FormActions,
	NumberField,
	RequiredLegend,
	RootError,
	SubmitButton,
	TextField,
} from "@/components/kilora/form-fields";
import {
	kmField,
	moneyField,
	optionalText,
	pastDateField,
	requiredText,
} from "@/components/kilora/form-schemas";
import {
	type ReceiptFile,
	ReceiptScan,
} from "@/components/kilora/receipt-scan";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import type { ownerActions } from "@/lib/owner";

type ManualBody = Parameters<typeof ownerActions.manual>[1];

const manualSchema = z.object({
	date: pastDateField(),
	km: kmField(false),
	summary: requiredText("Contá qué servicio se hizo"),
	items: z.array(
		z.object({
			description: z.string(),
			brand: optionalText.max(100, "Usá como máximo 100 caracteres"),
			price: moneyField(false),
		}),
	),
	total: moneyField(false),
	where: optionalText,
});

function allowDatePopover(event: {
	preventDefault: () => void;
	target: EventTarget | null;
}) {
	const target = event.target;
	if (
		target instanceof Element &&
		target.closest("[data-slot=popover-content]")
	) {
		event.preventDefault();
	}
}

export function OwnerServiceDialog({
	vehicleID,
	open,
	pending,
	onOpenChange,
	onSave,
}: {
	vehicleID: string;
	open: boolean;
	pending: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (body: ManualBody) => Promise<unknown>;
}) {
	const [receipt, setReceipt] = useState<ReceiptFile | null>(null);
	const [reading, setReading] = useState(false);
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(manualSchema),
		defaultValues: {
			date: "",
			km: "",
			summary: "",
			items: [{ description: "", brand: "", price: "" }],
			total: "",
			where: "",
		},
	});
	const rows = useFieldArray({ control: form.control, name: "items" });
	const close = () => {
		form.reset();
		form.clearErrors();
		onOpenChange(false);
	};
	const submit = form.handleSubmit(async (values) => {
		if (reading || pending) return;
		form.clearErrors("root");
		try {
			await onSave({
				performed_on: values.date,
				...(receipt ? { receipt } : {}),
				summary: values.summary,
				...(values.km ? { odometer_km: Number(values.km) } : {}),
				...(values.total ? { total: values.total } : {}),
				workshop_name_text: values.where || "",
				items: values.items.flatMap((item) => {
					const description = item.description.trim();
					if (!description) return [];
					return [
						{
							kind: "trabajo" as const,
							description,
							...(item.brand ? { brand: item.brand } : {}),
							...(item.price ? { price: item.price } : {}),
						},
					];
				}),
			});
			toast.success("Servicio guardado");
			close();
		} catch (error) {
			applyFormError(form, error, { toast: true });
		}
	});
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (pending) return;
				if (!next) close();
				else onOpenChange(true);
			}}
		>
			<DialogContent
				className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
				onInteractOutside={allowDatePopover}
			>
				<DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left sm:px-6">
					<DialogTitle>Guardar servicio</DialogTitle>
					<DialogDescription>
						Guardá lo que le hicieron a tu carro y su comprobante, aunque tu
						taller no use Kilora.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						onSubmit={submit}
						className="flex min-h-0 flex-1 flex-col overflow-hidden"
						noValidate
					>
						<div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
							<ReceiptScan
								vehicleID={vehicleID}
								file={receipt}
								disabled={pending}
								onFileChange={setReceipt}
								onReadingChange={setReading}
								onDraft={(draft) => {
									const items = draft.items.map((item) => ({
										description: item.description,
										brand: "",
										price: item.price ?? "",
									}));
									form.reset(
										{
											date: draft.performed_on ?? "",
											km:
												draft.odometer_km == null
													? ""
													: String(draft.odometer_km),
											summary: draft.summary,
											items: items.length
												? items
												: [{ description: "", brand: "", price: "" }],
											total: draft.total ?? "",
											where: draft.workshop_name ?? "",
										},
										{ keepDefaultValues: true },
									);
									void form.trigger();
								}}
							/>
							<fieldset
								disabled={reading || pending}
								className="grid min-w-0 gap-4 sm:grid-cols-2"
							>
								<legend className="sr-only">Datos del servicio</legend>
								<RequiredLegend className="sm:col-span-2" />
								<TextField
									name="summary"
									label="¿Qué le hicieron?"
									placeholder="Ej. Cambio de aceite y filtro"
									maxLength={200}
									required
									className="sm:col-span-2"
								/>
								<DateField name="date" label="Fecha del servicio" required />
								<NumberField
									name="km"
									label="Kilometraje"
									optional
									suffix="km"
									min={0}
									step={1}
								/>
								<NumberField
									name="total"
									label="Total pagado"
									optional
									prefix="$"
									min={0}
									step="0.01"
								/>
								<TextField
									name="where"
									label="Taller o lugar"
									placeholder="Dónde se hizo"
									optional
								/>
								<ServiceItems
									rows={rows}
									hasErrors={Boolean(form.formState.errors.items)}
								/>
							</fieldset>
							<RootError />
						</div>
						<DialogFooter className="shrink-0 border-t bg-background px-5 py-4 sm:px-6">
							<FormActions className="w-full">
								<Button
									type="button"
									variant="outline"
									className="w-full sm:w-auto"
									disabled={pending}
									onClick={close}
								>
									Cancelar
								</Button>
								<SubmitButton pending={pending} disabled={reading}>
									Guardar servicio
								</SubmitButton>
							</FormActions>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

function ServiceItems({
	rows,
	hasErrors,
}: {
	rows: UseFieldArrayReturn<z.input<typeof manualSchema>, "items">;
	hasErrors: boolean;
}) {
	return (
		<details
			className="rounded-md border p-4 sm:col-span-2"
			open={rows.fields.some((row) => row.description.trim()) || hasErrors}
		>
			<summary className="cursor-pointer text-sm font-medium">
				Trabajos y repuestos (opcional)
			</summary>
			<p className="mt-2 mb-4 text-xs text-ink-3">
				Agregá el detalle si lo tenés. Podés guardar el servicio solo con la
				fecha y lo que le hicieron.
			</p>
			<div className="grid gap-4">
				{rows.fields.map((row, index) => (
					<div
						key={row.id}
						className="grid gap-3 rounded-md bg-muted/30 p-3 sm:grid-cols-2 sm:items-end"
					>
						<TextField
							className="sm:col-span-2"
							name={`items.${index}.description`}
							label="Trabajo o pieza"
							placeholder="Ej. Filtro de aceite"
							optional
						/>
						<TextField
							name={`items.${index}.brand`}
							label="Marca del repuesto"
							placeholder="Sin registrar"
							maxLength={100}
							optional
						/>
						<NumberField
							name={`items.${index}.price`}
							label="Precio"
							optional
							min={0}
							step="0.01"
						/>
						{rows.fields.length > 1 ? (
							<Button
								type="button"
								variant="outline"
								className="w-full sm:w-auto"
								onClick={() => rows.remove(index)}
							>
								Quitar
							</Button>
						) : null}
					</div>
				))}
				<Button
					type="button"
					variant="outline"
					className="w-full sm:w-auto"
					onClick={() => rows.append({ description: "", brand: "", price: "" })}
				>
					Agregar otro ítem
				</Button>
			</div>
		</details>
	);
}
