import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Gauge, Plus } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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
	optionalDateField,
	optionalText,
	pastDateField,
	requiredText,
} from "@/components/kilora/form-schemas";
import { HistoryItems } from "@/components/kilora/history-record";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { date, day, km as formatKm, money, plural } from "@/lib/format";
import {
	ownerActions,
	ownerHistoryQuery,
	ownerVehicleQuery,
	useOwnerMutation,
} from "@/lib/owner";
import { Route as OwnerLayout } from "../mis-vehiculos";

type HistoryRecord = components["schemas"]["HistoryRecord"];
type ManualBody = Parameters<typeof ownerActions.manual>[1];
type CorrectionBody = Parameters<typeof ownerActions.correction>[1];
export const Route = createFileRoute("/mis-vehiculos/$vehicleId")({
	loader: async ({ context, params }) => {
		const [history, vehicle] = await Promise.all([
			context.queryClient.ensureQueryData(ownerHistoryQuery(params.vehicleId)),
			context.queryClient.ensureQueryData(ownerVehicleQuery(params.vehicleId)),
		]);
		return { history, vehicle };
	},
	component: Page,
});
function Page() {
	const { vehicleId: id } = Route.useParams();
	const { me } = OwnerLayout.useRouteContext();
	const initial = Route.useLoaderData();
	const { data: h } = useQuery({
		...ownerHistoryQuery(id),
		initialData: initial.history,
	});
	const { data: v } = useQuery({
		...ownerVehicleQuery(id),
		initialData: initial.vehicle,
	});
	const [manualOpen, setManualOpen] = useState(false);
	const [kmOpen, setKmOpen] = useState(false);
	const [warning, setWarning] = useState("");
	const [editing, setEditing] = useState<HistoryRecord | null>(null);
	const manual = useOwnerMutation(
		(body: Parameters<typeof ownerActions.manual>[1]) =>
			ownerActions.manual(id, body),
	);
	const km = useOwnerMutation((n: number) => ownerActions.odometer(id, n));
	const correction = useOwnerMutation(
		(body: Parameters<typeof ownerActions.correction>[1]) =>
			ownerActions.correction(id, body),
	);
	if (!h || !v)
		return (
			<main className="p-8">
				<Skeleton className="h-32" aria-label="Cargando historial…" />
			</main>
		);
	return (
		<main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
			<Link to="/mis-vehiculos" className="text-sm text-seal">
				← Mis vehículos
			</Link>
			<header className="rounded-xl bg-foreground p-6 text-background">
				<p className="font-mono text-sm">{v.plate || "Sin placa"}</p>
				<h1 className="mt-2 font-display text-3xl font-bold">
					{v.make} {v.model} {v.year}
				</h1>
				<p className="mt-2 opacity-70">
					{formatKm(v.last_odometer_km)} ·{" "}
					{plural(h.records.length, "registro", "registros")}
				</p>
			</header>
			<div className="flex flex-wrap gap-2">
				<Button type="button" onClick={() => setManualOpen(true)}>
					<Plus />
					Agregar servicio
				</Button>
				<Button type="button" variant="outline" onClick={() => setKmOpen(true)}>
					<Gauge />
					Actualizar kilometraje
				</Button>
			</div>
			<ManualDialog
				open={manualOpen}
				pending={manual.isPending}
				onOpenChange={setManualOpen}
				onSave={(body) => manual.mutateAsync(body)}
			/>
			<KmDialog
				open={kmOpen}
				warning={warning}
				pending={km.isPending}
				onOpenChange={setKmOpen}
				onSave={async (value) => {
					const result = await km.mutateAsync(value);
					if (result.warning) setWarning(result.warning);
					toast.success("Kilometraje actualizado");
				}}
			/>
			{warning && !kmOpen && (
				<Alert>
					<AlertDescription>{warning}</AlertDescription>
				</Alert>
			)}
			<div className="grid gap-6 md:grid-cols-[1fr_260px]">
				<section>
					<h2 className="mb-4 font-display text-2xl font-bold">
						Historial de servicios
					</h2>
					<div className="space-y-4">
						{h.records.length === 0 && (
							<p className="text-ink-3">Aún no hay servicios registrados.</p>
						)}
						{h.records.map((r) => (
							<Card key={r.id} className="gap-0 p-5 shadow-none">
								<p className="text-sm text-ink-3">
									{day(r.performed_on)} · {formatKm(r.odometer_km)}
								</p>
								<h3 className="mt-2 font-display text-lg font-bold">
									{r.summary}
								</h3>
								<p className="text-sm text-seal">
									{r.workshop_name ||
										(r.source === "propietario"
											? "Registro personal"
											: "Taller")}
									{r.workshop_verified_at && (
										<span className="ml-2 text-sm text-seal">✓ Verificado</span>
									)}
								</p>
								<HistoryItems items={r.items} />
								{r.total && (
									<p className="mt-3 font-semibold">Total: {money(r.total)}</p>
								)}
								{r.workshop_notes && (
									<p className="mt-3 text-sm">
										Notas del taller: {r.workshop_notes}
									</p>
								)}
								{r.corrections?.map((c) => (
									<p
										key={c.id}
										className="mt-3 rounded bg-secondary p-2 text-sm"
									>
										Corrección del {day(c.created_at)}: {c.reason} ·{" "}
										{Object.entries(c.changes)
											.map(
												([k, v]) =>
													`${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`,
											)
											.join(", ")}
									</p>
								))}
								{r.source === "propietario" && r.created_by === me.user.id && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="mt-4"
										onClick={() => setEditing(r)}
									>
										Corregir
									</Button>
								)}
							</Card>
						))}
					</div>
				</section>
				<aside className="space-y-5">
					<Card className="gap-0 p-5 shadow-none">
						<h2 className="font-bold">Talleres vinculados</h2>
						{(v.workshops || []).length ? (
							v.workshops?.map((w) => (
								<p className="mt-2 text-sm" key={JSON.stringify(w)}>
									{w.name}
								</p>
							))
						) : (
							<p className="mt-2 text-sm text-ink-3">Sin talleres vinculados</p>
						)}
					</Card>
					<Card className="gap-0 p-5 shadow-none">
						<h2 className="font-bold">Lecturas de kilometraje</h2>
						{(v.odometer_readings || []).length ? (
							<Table>
								<TableBody>
									{v.odometer_readings?.map((o) => (
										<TableRow key={JSON.stringify(o)}>
											<TableCell>{formatKm(o.km)}</TableCell>
											<TableCell>{date(o.read_at)}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						) : (
							<p className="mt-2 text-sm text-ink-3">Sin lecturas</p>
						)}
					</Card>
				</aside>
			</div>
			{editing && (
				<CorrectionDialog
					record={editing}
					pending={correction.isPending}
					onOpenChange={(open) => {
						if (!open) setEditing(null);
					}}
					onSave={(body) => correction.mutateAsync(body)}
				/>
			)}
		</main>
	);
}

const manualSchema = z.object({
	date: pastDateField(),
	km: kmField(false),
	summary: requiredText("Contá qué servicio se hizo"),
	items: z.array(
		z.object({
			description: z.string(),
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

function ManualDialog({
	open,
	pending,
	onOpenChange,
	onSave,
}: {
	open: boolean;
	pending: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (body: ManualBody) => Promise<unknown>;
}) {
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(manualSchema),
		defaultValues: {
			date: "",
			km: "",
			summary: "",
			items: [{ description: "", price: "" }],
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
		form.clearErrors("root");
		try {
			await onSave({
				performed_on: values.date,
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
				if (!next) close();
				else onOpenChange(true);
			}}
		>
			<DialogContent
				className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
				onInteractOutside={allowDatePopover}
			>
				<DialogHeader className="pr-8">
					<DialogTitle>Agregar servicio</DialogTitle>
					<DialogDescription>
						Registrá un servicio que hiciste vos. Queda en el historial del
						vehículo.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={submit} className="grid gap-5" noValidate>
						<RequiredLegend />
						<DateField name="date" label="Fecha" autoFocus required />
						<NumberField
							name="km"
							label="Kilometraje"
							optional
							suffix="km"
							min={0}
							step={1}
							className="sm:max-w-xs"
						/>
						<TextField
							name="summary"
							label="¿Qué se hizo?"
							placeholder="Ej. Cambio de aceite y filtro"
							description="Es el título con el que aparece en el historial."
							maxLength={200}
							required
						/>
						<div className="grid gap-4">
							{rows.fields.map((row, index) => (
								<div
									key={row.id}
									className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
								>
									<TextField
										name={`items.${index}.description`}
										label="Trabajo o pieza"
										placeholder="Ej. Filtro de aceite"
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
								onClick={() => rows.append({ description: "", price: "" })}
							>
								Agregar otro ítem
							</Button>
						</div>
						<NumberField
							name="total"
							label="Total"
							optional
							min={0}
							step="0.01"
							className="sm:max-w-xs"
						/>
						<TextField name="where" label="Dónde se hizo" optional />
						<RootError />
						<DialogFooter>
							<FormActions className="w-full">
								<Button
									type="button"
									variant="outline"
									className="w-full sm:w-auto"
									onClick={close}
								>
									Cancelar
								</Button>
								<SubmitButton pending={pending}>Guardar servicio</SubmitButton>
							</FormActions>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

function KmDialog({
	open,
	warning,
	pending,
	onOpenChange,
	onSave,
}: {
	open: boolean;
	warning: string;
	pending: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (km: number) => Promise<unknown>;
}) {
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(z.object({ km: kmField(true) })),
		defaultValues: { km: "" },
	});
	const close = () => {
		form.reset();
		form.clearErrors();
		onOpenChange(false);
	};
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await onSave(Number(values.km));
			close();
		} catch (error) {
			applyFormError(form, error, { toast: true });
		}
	});
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) close();
				else onOpenChange(true);
			}}
		>
			<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
				<DialogHeader className="pr-8">
					<DialogTitle>Actualizar kilometraje</DialogTitle>
					<DialogDescription>
						Anotá la lectura actual del odómetro.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={submit} className="grid gap-5" noValidate>
						<RequiredLegend />
						<NumberField
							name="km"
							label="Kilometraje actual"
							suffix="km"
							min={0}
							step={1}
							autoFocus
							required
						/>
						{warning ? (
							<Alert>
								<AlertDescription>{warning}</AlertDescription>
							</Alert>
						) : null}
						<RootError />
						<DialogFooter>
							<FormActions className="w-full sm:col-span-1">
								<Button
									type="button"
									variant="outline"
									className="w-full sm:w-auto"
									onClick={close}
								>
									Cancelar
								</Button>
								<SubmitButton pending={pending}>Guardar</SubmitButton>
							</FormActions>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

const correctionSchema = z
	.object({
		reason: requiredText("Ingresá el motivo de la corrección"),
		summary: optionalText,
		date: optionalDateField(),
		km: kmField(false),
		editItems: z.boolean(),
		items: z.array(
			z.object({
				kind: z.enum(["trabajo", "pieza"]),
				description: z.string(),
				price: moneyField(false),
			}),
		),
	})
	.superRefine((value, ctx) => {
		if (!value.editItems) return;
		value.items.forEach((item, index) => {
			if (!item.description.trim())
				ctx.addIssue({
					code: "custom",
					path: ["items", index, "description"],
					message: "Ingresá la descripción",
				});
		});
	});

function CorrectionDialog({
	record,
	pending,
	onOpenChange,
	onSave,
}: {
	record: HistoryRecord;
	pending: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (body: CorrectionBody) => Promise<unknown>;
}) {
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(correctionSchema),
		defaultValues: {
			reason: "",
			summary: "",
			date: "",
			km: "",
			editItems: false,
			items: record.items.map((item) => ({
				kind: item.kind === "pieza" ? ("pieza" as const) : ("trabajo" as const),
				description: item.description,
				price: item.price ?? "",
			})),
		},
	});
	const rows = useFieldArray({ control: form.control, name: "items" });
	const editItems = form.watch("editItems");
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await onSave({
				history_record_id: record.id,
				reason: values.reason,
				changes: {
					...(values.summary.trim() ? { summary: values.summary.trim() } : {}),
					...(values.date ? { performed_on: values.date } : {}),
					...(values.km ? { odometer_km: Number(values.km) } : {}),
					...(values.editItems
						? {
								items: values.items.map(({ kind, description, price }) => ({
									kind,
									description: description.trim(),
									...(price ? { price } : {}),
								})),
							}
						: {}),
				},
			});
			toast.success("Corrección guardada");
			onOpenChange(false);
		} catch (error) {
			applyFormError(form, error, { toast: true });
		}
	});
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent
				className="max-h-[min(90dvh,40rem)] overflow-y-auto"
				onInteractOutside={allowDatePopover}
			>
				<DialogHeader>
					<DialogTitle>Corregir servicio</DialogTitle>
					<DialogDescription>
						El motivo queda en el historial. Los demás campos solo se actualizan
						si los completás.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={submit} className="grid gap-5" noValidate>
						<RequiredLegend />
						<TextField
							name="reason"
							label="Motivo de la corrección"
							autoFocus
							required
						/>
						<TextField
							name="summary"
							label="Nuevo título del servicio"
							placeholder="Ej. Cambio de aceite y filtro"
							maxLength={200}
							optional
						/>
						<DateField name="date" label="Nueva fecha" optional />
						<NumberField
							name="km"
							label="Nuevo kilometraje"
							optional
							suffix="km"
							min={0}
							step={1}
						/>
						<FormField
							control={form.control}
							name="editItems"
							render={({ field }) => (
								<FormItem className="flex flex-row items-center gap-2">
									<FormControl>
										<Checkbox
											checked={field.value}
											onCheckedChange={(checked) =>
												field.onChange(checked === true)
											}
										/>
									</FormControl>
									<FormLabel className="font-normal">Corregir ítems</FormLabel>
								</FormItem>
							)}
						/>
						{editItems && (
							<div className="grid gap-4">
								{rows.fields.map((row, index) => (
									<div
										key={row.id}
										className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end"
									>
										<TextField
											name={`items.${index}.description`}
											label="Descripción"
											required
										/>
										<NumberField
											name={`items.${index}.price`}
											label="Precio"
											optional
											min={0}
											step="0.01"
										/>
										<Button
											type="button"
											variant="outline"
											className="w-full sm:w-auto"
											onClick={() => rows.remove(index)}
										>
											Quitar
										</Button>
									</div>
								))}
								<Button
									type="button"
									variant="outline"
									className="w-full sm:w-auto"
									onClick={() =>
										rows.append({
											kind: "trabajo",
											description: "",
											price: "",
										})
									}
								>
									Agregar ítem
								</Button>
							</div>
						)}
						<RootError />
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								className="w-full sm:w-auto"
								onClick={() => onOpenChange(false)}
							>
								Cancelar
							</Button>
							<SubmitButton pending={pending}>Guardar</SubmitButton>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
