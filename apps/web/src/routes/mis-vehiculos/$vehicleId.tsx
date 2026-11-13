import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Gauge, Plus } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { PartDialog } from "@/components/kilora/car-anatomy";
import { CarPartsMap } from "@/components/kilora/car-parts-map";
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
	requiredText,
} from "@/components/kilora/form-schemas";
import { PartHistory } from "@/components/kilora/history-parts";
import { ListPagination } from "@/components/kilora/list-pagination";
import { OwnerHistory } from "@/components/kilora/owner-history";
import { OwnerMaintenanceCard } from "@/components/kilora/owner-maintenance";
import { OwnerServiceDialog } from "@/components/kilora/owner-service-dialog";
import { ResaleReport } from "@/components/kilora/resale-report";
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
import { isNotFound } from "@/lib/api";
import { date, day, km as formatKm, plural } from "@/lib/format";
import {
	ownerActions,
	ownerHistoryQuery,
	ownerPartsMapQuery,
	ownerVehicleQuery,
	useOwnerMutation,
} from "@/lib/owner";
import { useListPage } from "@/lib/pagination";
import type { PartKey } from "@/lib/part-catalog";
import { Route as OwnerLayout } from "../mis-vehiculos";

// Mapa 3D oculto por ahora; poner en true para mostrarlo de nuevo.
const SHOW_3D_MAP = false;

type HistoryRecord = components["schemas"]["HistoryRecord"];
type CorrectionBody = Parameters<typeof ownerActions.correction>[1];
const READINGS_PAGE_SIZE = 8;
export const Route = createFileRoute("/mis-vehiculos/$vehicleId")({
	loader: async ({ context, params }) => {
		try {
			const [history, vehicle] = await Promise.all([
				context.queryClient.ensureQueryData(
					ownerHistoryQuery(params.vehicleId),
				),
				context.queryClient.ensureQueryData(
					ownerVehicleQuery(params.vehicleId),
				),
			]);
			return { history, vehicle };
		} catch (error) {
			// Vehículo borrado, de otra cuenta o enlace viejo: 404 amable, no un error.
			if (isNotFound(error)) throw notFound();
			throw error;
		}
	},
	notFoundComponent: VehicleNotFound,
	component: Page,
});
function VehicleNotFound() {
	return (
		<main className="mx-auto max-w-md space-y-4 px-5 py-16 text-center">
			<p className="font-mono text-sm text-ink-3">404</p>
			<h1 className="font-display text-2xl font-bold">
				Vehículo no encontrado
			</h1>
			<p className="text-sm text-ink-2">
				Puede que el enlace sea viejo o que el vehículo ya no esté vinculado a
				tu cuenta.
			</p>
			<Button asChild>
				<Link to="/mis-vehiculos">Ver mis vehículos</Link>
			</Button>
		</main>
	);
}

function Page() {
	const { vehicleId: id } = Route.useParams();
	const { me } = OwnerLayout.useRouteContext();
	const initial = Route.useLoaderData();
	const [historyVersion, setHistoryVersion] = useState(0);
	const { data: v } = useQuery({
		...ownerVehicleQuery(id),
		initialData: initial.vehicle,
	});
	const partsMap = useQuery(ownerPartsMapQuery(id));
	const [manualOpen, setManualOpen] = useState(false);
	const [kmOpen, setKmOpen] = useState(false);
	const [warning, setWarning] = useState("");
	const [editing, setEditing] = useState<HistoryRecord | null>(null);
	const [viewing, setViewing] = useState<{
		part: PartKey;
		record: HistoryRecord;
	} | null>(null);
	const { page: readingsPage, setPage: setReadingsPage } = useListPage(id);
	const manual = useOwnerMutation(
		(body: Parameters<typeof ownerActions.manual>[1]) =>
			ownerActions.manual(id, body),
	);
	const km = useOwnerMutation((n: number) => ownerActions.odometer(id, n));
	const bodyType = useOwnerMutation(
		(type: Parameters<typeof ownerActions.bodyType>[1]) =>
			ownerActions.bodyType(id, type),
	);
	const correction = useOwnerMutation(
		(body: Parameters<typeof ownerActions.correction>[1]) =>
			ownerActions.correction(id, body),
	);
	if (!v)
		return (
			<main className="p-8">
				<Skeleton className="h-32" aria-label="Cargando historial…" />
			</main>
		);
	const readings = v.odometer_readings ?? [];
	const visibleReadings = readings.slice(
		(readingsPage - 1) * READINGS_PAGE_SIZE,
		readingsPage * READINGS_PAGE_SIZE,
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
					{plural(
						v.history_count ?? initial.history.unfiltered_total,
						"registro",
						"registros",
					)}
				</p>
			</header>
			<div className="grid gap-2 sm:flex sm:flex-wrap">
				<Button type="button" onClick={() => setManualOpen(true)}>
					<Plus />
					Guardar servicio
				</Button>
				<Button type="button" variant="outline" onClick={() => setKmOpen(true)}>
					<Gauge />
					Actualizar kilometraje
				</Button>
				<ResaleReport vehicleID={id} />
			</div>
			{manualOpen && (
				<OwnerServiceDialog
					key={`${me.user.id}:${id}`}
					ownerID={me.user.id}
					vehicleID={id}
					open={manualOpen}
					pending={manual.isPending}
					onOpenChange={setManualOpen}
					onSave={async (body) => {
						await manual.mutateAsync(body);
						setHistoryVersion((version) => version + 1);
					}}
				/>
			)}
			<KmDialog
				open={kmOpen}
				warning={warning}
				pending={km.isPending}
				onOpenChange={setKmOpen}
				onSave={async (value) => {
					const result = await km.mutateAsync(value);
					if (result.warning) setWarning(result.warning);
					setReadingsPage(1);
					toast.success("Kilometraje actualizado");
				}}
			/>
			{warning && !kmOpen && (
				<Alert>
					<AlertDescription>{warning}</AlertDescription>
				</Alert>
			)}
			<OwnerMaintenanceCard
				vehicleID={id}
				email={me.user.email}
				emailsAllowed={me.user.maintenance_emails_enabled}
				onUpdateKm={() => setKmOpen(true)}
				onAddService={() => setManualOpen(true)}
			/>
			{SHOW_3D_MAP &&
				(partsMap.data ? (
					<CarPartsMap
						records={partsMap.data.records}
						currentKm={v.last_odometer_km}
						bodyType={v.body_type}
						onBodyTypeChange={async (type) => {
							await bodyType.mutateAsync(type);
							toast.success("Tipo de vehículo actualizado");
						}}
					/>
				) : (
					<Skeleton className="h-80 rounded-xl" aria-label="Cargando mapa…" />
				))}
			<div className="grid gap-6 md:grid-cols-[1fr_260px]">
				<OwnerHistory
					key={`${id}:${historyVersion}`}
					vehicleID={id}
					userID={me.user.id}
					bodyType={v.body_type}
					initialHistory={initial.history}
					onAddService={() => setManualOpen(true)}
					onCorrect={setEditing}
					onViewPart={(part, record) => setViewing({ part, record })}
				/>
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
						{readings.length ? (
							<Table>
								<TableBody>
									{visibleReadings.map((o) => (
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
						<ListPagination
							page={readingsPage}
							total={readings.length}
							pageSize={READINGS_PAGE_SIZE}
							onPageChange={setReadingsPage}
							alwaysVisible
							className="mt-2 px-0 pb-0"
						/>
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
			<PartDialog
				part={viewing?.part ?? null}
				bodyType={v.body_type}
				onOpenChange={(open) => !open && setViewing(null)}
				subtitle={
					viewing &&
					[
						day(viewing.record.performed_on),
						viewing.record.workshop_name,
						viewing.record.odometer_km != null
							? formatKm(viewing.record.odometer_km)
							: null,
					]
						.filter(Boolean)
						.join(" · ")
				}
			>
				{viewing && (
					<PartHistory
						part={viewing.part}
						records={partsMap.data?.records ?? initial.history.records}
					/>
				)}
			</PartDialog>
		</main>
	);
}

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
				brand: optionalText.max(100, "Usá como máximo 100 caracteres"),
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
				brand: item.brand ?? "",
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
								items: values.items.map(
									({ kind, description, brand, price }) => ({
										kind,
										description: description.trim(),
										...(brand ? { brand } : {}),
										...(price ? { price } : {}),
									}),
								),
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
										className="grid gap-5 sm:grid-cols-2 sm:items-end"
									>
										<TextField
											name={`items.${index}.description`}
											label="Descripción"
											required
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
											brand: "",
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
