import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
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
import { ReceiptScan } from "@/components/kilora/receipt-scan";
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
import { errorMessage } from "@/lib/api";
import { DuplicateServiceError, type ownerActions } from "@/lib/owner";
import { emptyServiceDraft } from "@/lib/service-drafts";
import { useServiceDraft } from "@/lib/use-service-draft";
import {
	DuplicateServiceDialog,
	ServiceDraftNotice,
} from "./owner-service-feedback";

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
	ownerID,
	vehicleID,
	open,
	pending,
	onOpenChange,
	onSave,
}: {
	ownerID: string;
	vehicleID: string;
	open: boolean;
	pending: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (body: ManualBody) => Promise<unknown>;
}) {
	const [attempt, setAttempt] = useState<{
		body: ManualBody;
		duplicates: DuplicateServiceError["duplicates"];
	} | null>(null);
	const [draftPending, setDraftPending] = useState(false);
	const [closeFailed, setCloseFailed] = useState(false);
	const [reading, setReading] = useState(false);
	const [saving, setSaving] = useState(false);
	const savingRef = useRef(false);
	const busy = pending || saving;
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(manualSchema),
		defaultValues: emptyServiceDraft(),
	});
	const draft = useServiceDraft(ownerID, vehicleID, form);
	const { receipt, changeReceipt: setReceipt } = draft;
	const editingDisabled =
		reading ||
		busy ||
		draftPending ||
		draft.snapshot.phase !== "editing" ||
		attempt !== null;
	const rows = useFieldArray({ control: form.control, name: "items" });
	const close = async () => {
		if (busy || draftPending) return;
		if (await draft.controller.flush()) onOpenChange(false);
		else setCloseFailed(true);
	};
	const discard = async () => {
		if (busy || draftPending) return;
		setDraftPending(true);
		try {
			await draft.discard();
			setCloseFailed(false);
			toast.success("Borrador descartado");
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			setDraftPending(false);
		}
	};
	const save = async (body: ManualBody) => {
		if (savingRef.current) return;
		savingRef.current = true;
		setSaving(true);
		try {
			form.clearErrors("root");
			try {
				await onSave(body);
			} catch (error) {
				if (error instanceof DuplicateServiceError) {
					setAttempt({ body, duplicates: error.duplicates });
					return;
				}
				setAttempt(null);
				applyFormError(form, error, { toast: true });
				return;
			}
			try {
				await draft.controller.finish();
			} catch {
				toast.warning(
					"Servicio guardado. No pudimos eliminar el borrador de este navegador.",
				);
			}
			setAttempt(null);
			toast.success("Servicio guardado");
			onOpenChange(false);
		} finally {
			savingRef.current = false;
			setSaving(false);
		}
	};
	const submit = form.handleSubmit(async (values) => {
		if (editingDisabled) return;
		await save({
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
	});
	return (
		<>
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (busy) return;
					if (!next) void close();
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
								<ServiceDraftNotice
									phase={draft.snapshot.phase}
									status={draft.snapshot.status}
									saved={draft.snapshot.saved}
									pending={busy || draftPending || reading}
									closeFailed={closeFailed}
									onResume={draft.resume}
									onDiscard={() => void discard()}
									onCloseWithoutSaving={() => {
										draft.controller.abandon();
										onOpenChange(false);
									}}
								/>
								<ReceiptScan
									vehicleID={vehicleID}
									file={receipt}
									disabled={editingDisabled}
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
									disabled={editingDisabled}
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
										disabled={busy || draftPending}
										onClick={() => void close()}
									>
										Cerrar y conservar
									</Button>
									<SubmitButton pending={busy} disabled={editingDisabled}>
										Guardar servicio
									</SubmitButton>
								</FormActions>
							</DialogFooter>
						</form>
					</Form>
				</DialogContent>
			</Dialog>
			<DuplicateServiceDialog
				duplicates={attempt?.duplicates ?? null}
				pending={busy}
				onCancel={() => setAttempt(null)}
				onConfirm={() => {
					if (attempt) void save({ ...attempt.body, allow_duplicate: true });
				}}
			/>
		</>
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
