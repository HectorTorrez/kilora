import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { SectionCard } from "@/components/kilora/workshop-ui";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useWorkshopMutation } from "@/features/taller/mutation";
import {
	recommendationActions,
	vehicleRecommendationsQuery,
} from "@/features/taller/recommendations";
import { categoryLabels } from "@/lib/domain";
import { dueText, type Urgency, urgency } from "@/lib/recommendations";
import { cn } from "@/lib/utils";
import { FormDialog } from "./form-dialog";
import {
	applyFormError,
	DateField,
	FormActions,
	NumberField,
	RequiredLegend,
	RootError,
	SelectField,
	SubmitButton,
	TextField,
} from "./form-fields";
import { kmField, requiredText } from "./form-schemas";

const urgencyStyle: Record<Urgency, string> = {
	vencida: "bg-destructive/10 text-destructive",
	proxima: "bg-warn-soft text-warn",
	programada: "bg-secondary text-ink-2",
};
const urgencyLabel: Record<Urgency, string> = {
	vencida: "Vencida",
	proxima: "Próxima",
	programada: "Programada",
};

export function UrgencyBadge({ value }: { value: Urgency }) {
	return (
		<span
			className={cn(
				"rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
				urgencyStyle[value],
			)}
		>
			{urgencyLabel[value]}
		</span>
	);
}

const recommendationSchema = z
	.object({
		description: requiredText("Contá qué trabajo recomendás").max(
			200,
			"Usá como máximo 200 caracteres",
		),
		category: z.string(),
		due_date: z.string(),
		due_km: kmField(),
	})
	.refine((value) => value.due_date || value.due_km, {
		path: ["due_km"],
		message: "Indicá una fecha, un kilometraje o ambos",
	});

const categoryOptions = [
	{ value: "none", label: "Sin categoría" },
	...Object.entries(categoryLabels).map(([value, label]) => ({ value, label })),
];

function RecommendationForm({
	workshopID,
	vehicleID,
	workOrderID,
	currentKm,
	onDone,
}: {
	workshopID: string;
	vehicleID: string;
	workOrderID?: string;
	currentKm?: number | null;
	onDone: () => void;
}) {
	const create = useWorkshopMutation(
		workshopID,
		recommendationActions(workshopID).recommend,
		{ inlineErrors: true },
	);
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(recommendationSchema),
		defaultValues: {
			description: "",
			category: "none",
			due_date: "",
			due_km: "",
		},
	});
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await create.mutateAsync({
				vehicleID,
				body: {
					description: values.description,
					category:
						values.category === "none"
							? null
							: (values.category as components["schemas"]["PartCategory"]),
					due_date: values.due_date || null,
					due_km: values.due_km ? Number(values.due_km) : null,
					work_order_id: workOrderID ?? null,
				},
			});
			toast.success("Recomendación registrada");
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
					label="Trabajo recomendado"
					placeholder="Ej. Cambiar pastillas de freno delanteras"
					maxLength={200}
					autoFocus
					required
				/>
				<div className="grid gap-5 sm:grid-cols-2">
					<DateField
						name="due_date"
						label="Hacerlo antes del"
						disableFuture={false}
						optional
					/>
					<NumberField
						name="due_km"
						label="O al llegar a"
						suffix="km"
						min={0}
						step={1}
						placeholder={
							currentKm != null ? String(currentKm + 5000) : "Ej. 90000"
						}
						optional
					/>
				</div>
				<p className="-mt-2 text-xs text-ink-3">
					Indicá una fecha, un kilometraje o ambos. Lo que llegue primero marca
					la recomendación como próxima o vencida.
				</p>
				<SelectField
					name="category"
					label="Categoría"
					options={categoryOptions}
					optional
					className="sm:max-w-60"
				/>
				<RootError />
				<FormActions>
					<Button
						type="button"
						variant="outline"
						className="w-full sm:w-auto"
						onClick={onDone}
					>
						Cancelar
					</Button>
					<SubmitButton pending={create.isPending}>
						Guardar recomendación
					</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}

export function RecommendationsCard({
	workshopID,
	vehicleID,
	workOrderID,
	currentKm,
}: {
	workshopID: string;
	vehicleID: string;
	workOrderID?: string;
	currentKm?: number | null;
}) {
	const { data = [], isLoading } = useQuery(
		vehicleRecommendationsQuery(workshopID, vehicleID),
	);
	const resolve = useWorkshopMutation(
		workshopID,
		recommendationActions(workshopID).resolve,
	);
	const [open, setOpen] = useState(false);
	const pending = data.filter((r) => r.status === "pendiente");
	const resolved = data.filter((r) => r.status !== "pendiente").slice(0, 3);

	return (
		<SectionCard
			title="Recomendaciones"
			description="Trabajos a futuro para avisarle al cliente."
			actions={
				<Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
					<Plus className="size-3.5" />
					Agregar
				</Button>
			}
			bodyClassName="p-0 sm:p-0"
		>
			{isLoading ? null : !pending.length && !resolved.length ? (
				<p className="px-4 py-6 text-center text-[13px] text-ink-3 sm:px-5">
					Sin recomendaciones pendientes.
				</p>
			) : (
				<ul className="divide-y">
					{pending.map((r) => (
						<li key={r.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
							<div className="min-w-0 flex-1">
								<p className="text-[13px] font-medium">{r.description}</p>
								<p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
									<UrgencyBadge value={urgency(r, currentKm)} />
									<span>{dueText(r)}</span>
									{r.category && <span>· {categoryLabels[r.category]}</span>}
								</p>
							</div>
							<div className="flex shrink-0 gap-1">
								<Button
									variant="ghost"
									size="icon"
									className="size-8 text-ok hover:bg-ok-soft hover:text-ok"
									aria-label={`Marcar como hecha: ${r.description}`}
									title="Marcar como hecha"
									disabled={resolve.isPending}
									onClick={() => resolve.mutate({ id: r.id, status: "hecha" })}
								>
									<Check className="size-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="size-8 text-ink-3"
									aria-label={`Descartar: ${r.description}`}
									title="Descartar"
									disabled={resolve.isPending}
									onClick={() =>
										resolve.mutate({ id: r.id, status: "descartada" })
									}
								>
									<X className="size-4" />
								</Button>
							</div>
						</li>
					))}
					{resolved.map((r) => (
						<li
							key={r.id}
							className="flex items-center gap-3 px-4 py-2.5 text-xs text-ink-3 sm:px-5"
						>
							<span className="min-w-0 flex-1 truncate line-through">
								{r.description}
							</span>
							<span>{r.status === "hecha" ? "Hecha" : "Descartada"}</span>
						</li>
					))}
				</ul>
			)}
			<FormDialog
				open={open}
				onOpenChange={setOpen}
				title="Nueva recomendación"
				description="Un trabajo que el vehículo va a necesitar. Aparece en la ficha y en el resumen del taller cuando se acerca la fecha."
			>
				<RecommendationForm
					workshopID={workshopID}
					vehicleID={vehicleID}
					workOrderID={workOrderID}
					currentKm={currentKm}
					onDone={() => setOpen(false)}
				/>
			</FormDialog>
		</SectionCard>
	);
}
