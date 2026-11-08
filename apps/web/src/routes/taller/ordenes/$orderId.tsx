import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useWorkshopId } from "@/components/kilora/app-shell";
import {
	applyFormError,
	FormActions,
	FormError,
	NumberField,
	RootError,
	SelectField,
	SubmitButton,
	TextareaField,
	TextField,
} from "@/components/kilora/form-fields";
import {
	kmField,
	moneyField,
	optionalText,
	requiredText,
} from "@/components/kilora/form-schemas";
import { OwnerInvitation } from "@/components/kilora/owner-invitation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { money, statusLabel } from "@/lib/format";
import {
	actions,
	orderQuery,
	useWorkshopMutation,
	vehicleQuery,
} from "@/lib/workshop";

type S = components["schemas"];
export const Route = createFileRoute("/taller/ordenes/$orderId")({
	component: OrderPage,
});

const editSchema = z.object({
	reason: requiredText("Ingresá el motivo"),
	km: kmField(false),
	public_notes: optionalText,
	internal_notes: optionalText,
});
const cancelSchema = z.object({
	reason: requiredText("Ingresá el motivo de la cancelación"),
});
const jobSchema = z.object({
	description: requiredText("Ingresá el trabajo realizado"),
	labor: moneyField(false),
});
const partSchema = z.object({
	name: requiredText("Ingresá el nombre de la pieza"),
	price: moneyField(false),
});
const quoteSchema = z.object({
	items: z.array(
		z.object({
			kind: z.enum(["repuesto", "mano_de_obra"]),
			description: requiredText("Ingresá la descripción"),
			quantity: z
				.string()
				.trim()
				.refine((value) => Number(value) > 0, "Ingresá una cantidad"),
			unit_price: moneyField(false),
		}),
	),
});

function blankQuoteItem() {
	return {
		kind: "repuesto" as const,
		description: "",
		quantity: "1",
		unit_price: "0",
	};
}

function quoteValues(items?: S["QuoteItem"][]) {
	const source = items?.length ? items : [blankQuoteItem()];
	return {
		items: source.map((item) => ({
			kind: item.kind,
			description: item.description,
			quantity: String(item.quantity),
			unit_price: String(item.unit_price ?? 0),
		})),
	};
}

function OrderPage() {
	const { orderId } = Route.useParams();
	const workshopID = useWorkshopId();
	const order = useQuery(orderQuery(workshopID, orderId));
	const vehicle = useQuery({
		...vehicleQuery(workshopID, order.data?.vehicle_id || ""),
		enabled: !!order.data,
	});
	if (order.isLoading)
		return (
			<main className="p-8">
				<Skeleton className="h-32" aria-label="Cargando orden…" />
			</main>
		);
	if (order.error || !order.data)
		return (
			<main className="p-8">
				<Alert variant="destructive">
					<AlertDescription>
						{order.error?.message || "Orden no disponible"}
					</AlertDescription>
				</Alert>
			</main>
		);
	return (
		<OrderDetail
			key={order.data.id}
			workshopID={workshopID}
			order={order.data}
			vehicle={vehicle.data}
		/>
	);
}

function OrderDetail({
	workshopID,
	order,
	vehicle,
}: {
	workshopID: string;
	order: S["WorkOrderDetail"];
	vehicle?: S["Vehicle"];
}) {
	const a = actions(workshopID, order.id);
	const edit = useWorkshopMutation(workshopID, a.edit);
	const status = useWorkshopMutation(workshopID, a.status);
	const job = useWorkshopMutation(workshopID, a.job);
	const deleteJob = useWorkshopMutation(workshopID, a.deleteJob);
	const part = useWorkshopMutation(workshopID, a.part);
	const deletePart = useWorkshopMutation(workshopID, a.deletePart);
	const quote = useWorkshopMutation(workshopID, a.quote);
	const share = useWorkshopMutation(workshopID, a.share);
	const outcome = useWorkshopMutation(workshopID, a.outcome);
	const [partJob, setPartJob] = useState("");
	const next: Partial<Record<S["WorkOrderStatus"], S["WorkOrderStatus"]>> = {
		recibido: "diagnostico",
		diagnostico: "en_reparacion",
		en_reparacion: "listo",
	};
	const advancing =
		status.isPending && status.variables?.status !== "cancelado";
	return (
		<main className="mx-auto max-w-5xl space-y-5 px-5 py-7">
			<header>
				<p className="text-sm text-ink-3">
					Orden #{order.number} · {statusLabel(order.status)}
				</p>
				<h1 className="font-display text-3xl font-bold">
					{vehicle?.plate || "Sin placa"} · {vehicle?.make} {vehicle?.model}
				</h1>
				{order.history_record_id && (
					<p className="mt-2 font-semibold text-seal">
						Publicada en el historial
					</p>
				)}
			</header>
			<Card className="gap-0 space-y-4 rounded-lg p-5 shadow-none">
				<h2 className="font-semibold">Estado de la orden</h2>
				{next[order.status] && (
					<div className="grid gap-4">
						<Button
							className="w-full sm:w-auto"
							disabled={status.isPending}
							onClick={() =>
								status.mutate({
									status: next[order.status] as S["WorkOrderStatus"],
								})
							}
						>
							{advancing ? (
								<>
									<Loader2 className="animate-spin" />
									Avanzando…
								</>
							) : (
								<>
									Avanzar a{" "}
									{statusLabel(next[order.status] ?? "").toLowerCase()}
								</>
							)}
						</Button>
						<CancelOrderForm
							pending={
								status.isPending && status.variables?.status === "cancelado"
							}
							onCancel={(reason) =>
								status.mutate({ status: "cancelado", cancel_reason: reason })
							}
						/>
					</div>
				)}
				<FormError error={status.error} />
			</Card>
			<Card className="gap-0 rounded-lg p-5 shadow-none">
				<OrderEditForm
					initial={{
						reason: order.reason,
						km: order.odometer_km?.toString() || "",
						public_notes: order.public_notes || "",
						internal_notes: order.internal_notes || "",
					}}
					pending={edit.isPending}
					onSave={(body) => edit.mutateAsync(body)}
				/>
			</Card>
			<OwnerInvitation
				workshopID={workshopID}
				vehicleID={order.vehicle_id}
				linked={vehicle?.owner_linked}
				name={vehicle?.owner_name}
			/>
			<Card className="gap-0 space-y-4 rounded-lg p-5 shadow-none">
				<h2 className="font-semibold">Trabajos y piezas</h2>
				{order.jobs.map((j) => (
					<div key={j.id} className="space-y-3 pb-3">
						<Table>
							<TableBody>
								<TableRow>
									<TableCell className="whitespace-normal">
										{j.description} · mano de obra {money(j.labor_price || 0)}
									</TableCell>
									<TableCell className="text-right">
										<Button
											variant="outline"
											size="sm"
											disabled={deleteJob.isPending}
											onClick={() => deleteJob.mutate(j.id)}
										>
											Eliminar trabajo
										</Button>
									</TableCell>
								</TableRow>
								{j.parts.map((p) => (
									<TableRow key={p.id}>
										<TableCell className="whitespace-normal pl-4 text-sm">
											{p.name} · {p.quantity} × {money(p.unit_price || 0)}
										</TableCell>
										<TableCell className="text-right">
											<Button
												variant="ghost"
												size="sm"
												type="button"
												disabled={deletePart.isPending}
												onClick={() =>
													deletePart.mutate({ jobID: j.id, partID: p.id })
												}
											>
												Eliminar pieza
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setPartJob(partJob === j.id ? "" : j.id)}
						>
							{partJob === j.id ? "Cerrar" : "Agregar pieza"}
						</Button>
						{partJob === j.id && (
							<AddPartForm
								pending={part.isPending}
								onCancel={() => setPartJob("")}
								onSave={async (body) => {
									await part.mutateAsync({ jobID: j.id, body });
									setPartJob("");
								}}
							/>
						)}
						<Separator />
					</div>
				))}
				<AddJobForm
					pending={job.isPending}
					onSave={(body) => job.mutateAsync(body)}
				/>
				<FormError error={deleteJob.error || deletePart.error} />
			</Card>
			<Card className="gap-0 space-y-4 rounded-lg p-5 shadow-none">
				<h2 className="font-semibold">Cotización</h2>
				<QuoteForm
					items={order.quote?.items}
					pending={quote.isPending}
					sharing={share.isPending}
					onSave={(items) => quote.mutateAsync({ items })}
					onShare={() => share.mutateAsync()}
				/>
				{order.quote && (
					<div className="flex flex-wrap items-center gap-2">
						<span>Resultado: {order.quote.outcome.replaceAll("_", " ")}</span>
						{(
							[
								["acepto", "Aceptó"],
								["rechazo", "Rechazó"],
								["no_respondio", "No respondió"],
							] as const
						).map(([value, label]) => (
							<Button
								key={value}
								variant="outline"
								size="sm"
								disabled={outcome.isPending}
								onClick={() => outcome.mutate({ outcome: value })}
							>
								{label}
							</Button>
						))}
					</div>
				)}
				<FormError error={outcome.error} />
				{order.quote_comparison && (
					<p>
						Cotizado: {money(order.quote_comparison.quote_total || 0)} ·
						Cobrado: {money(order.quote_comparison.charged_total || 0)} ·
						Diferencia: {money(order.quote_comparison.difference || 0)}
					</p>
				)}
			</Card>
		</main>
	);
}

function OrderEditForm({
	initial,
	pending,
	onSave,
}: {
	initial: z.infer<typeof editSchema>;
	pending: boolean;
	onSave: (body: S["EditWorkOrder"]) => Promise<unknown>;
}) {
	const form = useForm({
		resolver: zodResolver(editSchema),
		defaultValues: initial,
	});
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await onSave({
				reason: values.reason,
				odometer_km: values.km ? Number(values.km) : null,
				public_notes: values.public_notes || null,
				internal_notes: values.internal_notes || null,
			});
			toast.success("Cambios guardados");
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<Form {...form}>
			<form onSubmit={submit} className="grid gap-5" noValidate>
				<h2 className="font-semibold">Datos de la orden</h2>
				<TextField name="reason" label="Motivo" required />
				<NumberField
					name="km"
					label="Kilometraje"
					optional
					suffix="km"
					min={0}
					step={1}
					className="sm:max-w-xs"
				/>
				<TextareaField
					name="public_notes"
					label="Notas públicas"
					optional
					description="Las ve el propietario"
				/>
				<TextareaField
					name="internal_notes"
					label="Notas internas"
					optional
					description="Privadas del taller"
				/>
				<RootError />
				<FormActions>
					<SubmitButton pending={pending}>Guardar cambios</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}

function CancelOrderForm({
	pending,
	onCancel,
}: {
	pending: boolean;
	onCancel: (reason: string) => void;
}) {
	const form = useForm({
		resolver: zodResolver(cancelSchema),
		defaultValues: { reason: "" },
	});
	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit((values) => onCancel(values.reason))}
				className="grid gap-5 sm:grid-cols-[minmax(0,20rem)_auto] sm:items-end"
				noValidate
			>
				<TextField name="reason" label="Motivo de cancelación" required />
				<SubmitButton
					pending={pending}
					pendingLabel="Cancelando…"
					variant="outline"
				>
					Cancelar orden
				</SubmitButton>
			</form>
		</Form>
	);
}

function AddJobForm({
	pending,
	onSave,
}: {
	pending: boolean;
	onSave: (body: S["CreateJob"]) => Promise<unknown>;
}) {
	const form = useForm({
		resolver: zodResolver(jobSchema),
		defaultValues: { description: "", labor: "" },
	});
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await onSave({
				description: values.description,
				labor_price: values.labor || "0",
			});
			form.reset();
			toast.success("Trabajo agregado");
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<Form {...form}>
			<form
				onSubmit={submit}
				className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-end"
				noValidate
			>
				<TextField name="description" label="Trabajo realizado" required />
				<NumberField
					name="labor"
					label="Mano de obra"
					optional
					min={0}
					step="0.01"
				/>
				<SubmitButton pending={pending} pendingLabel="Agregando…">
					Agregar trabajo
				</SubmitButton>
				<RootError className="sm:col-span-3" />
			</form>
		</Form>
	);
}

function AddPartForm({
	pending,
	onCancel,
	onSave,
}: {
	pending: boolean;
	onCancel: () => void;
	onSave: (body: S["CreatePart"]) => Promise<unknown>;
}) {
	const form = useForm({
		resolver: zodResolver(partSchema),
		defaultValues: { name: "", price: "" },
	});
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await onSave({
				name: values.name,
				quantity: 1,
				unit_price: values.price || "0",
			});
			toast.success("Pieza agregada");
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<Form {...form}>
			<form onSubmit={submit} className="grid gap-5 sm:grid-cols-2" noValidate>
				<TextField name="name" label="Pieza" autoFocus required />
				<NumberField name="price" label="Precio" optional min={0} step="0.01" />
				<RootError />
				<FormActions>
					<Button
						type="button"
						variant="outline"
						className="w-full sm:w-auto"
						onClick={onCancel}
					>
						Cancelar
					</Button>
					<SubmitButton pending={pending}>Guardar pieza</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}

function QuoteForm({
	items,
	pending,
	sharing,
	onSave,
	onShare,
}: {
	items?: S["QuoteItem"][];
	pending: boolean;
	sharing: boolean;
	onSave: (items: S["QuoteItem"][]) => Promise<unknown>;
	onShare: () => Promise<{ url: string; whatsapp_url: string }>;
}) {
	const form = useForm({
		resolver: zodResolver(quoteSchema),
		defaultValues: quoteValues(items),
	});
	const rows = useFieldArray({ control: form.control, name: "items" });
	const watched = form.watch("items");
	useEffect(() => {
		form.reset(quoteValues(items));
	}, [form.reset, items]);
	const [url, setUrl] = useState("");
	const [shareError, setShareError] = useState<string | null>(null);
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await onSave(
				values.items.map((item) => ({
					kind: item.kind,
					description: item.description,
					quantity: item.quantity,
					unit_price: item.unit_price || "0",
				})),
			);
			toast.success("Cotización guardada");
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<Form {...form}>
			<form onSubmit={submit} className="grid gap-4" noValidate>
				{rows.fields.map((row, index) => (
					<div
						key={row.id}
						className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_6.5rem_7rem_auto] sm:items-end"
					>
						<SelectField
							name={`items.${index}.kind`}
							label="Tipo"
							options={[
								{ value: "repuesto", label: "Repuesto" },
								{ value: "mano_de_obra", label: "Mano de obra" },
							]}
							required
						/>
						<TextField
							name={`items.${index}.description`}
							label="Descripción"
							required
						/>
						<NumberField
							name={`items.${index}.quantity`}
							label="Cantidad"
							min={0.01}
							step="0.01"
							required
						/>
						<NumberField
							name={`items.${index}.unit_price`}
							label="Precio"
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
				<p className="text-right font-semibold">
					Total:{" "}
					{money(
						(watched ?? []).reduce(
							(sum, item) =>
								sum + Number(item.quantity) * Number(item.unit_price || 0),
							0,
						),
					)}
				</p>
				<RootError />
				<FormError error={shareError} />
				<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
					<Button
						type="button"
						variant="outline"
						className="w-full sm:w-auto"
						onClick={() => rows.append(blankQuoteItem())}
					>
						Agregar ítem
					</Button>
					<Button
						type="button"
						variant="outline"
						className="w-full sm:w-auto"
						disabled={sharing}
						onClick={async () => {
							setShareError(null);
							try {
								const result = await onShare();
								setUrl(result.url);
								window.open(
									result.whatsapp_url,
									"_blank",
									"noopener,noreferrer",
								);
							} catch (error) {
								setShareError(
									error instanceof Error
										? error.message
										: "No se pudo compartir la cotización.",
								);
							}
						}}
					>
						{sharing ? (
							<>
								<Loader2 className="animate-spin" />
								Compartiendo…
							</>
						) : (
							"Compartir por WhatsApp"
						)}
					</Button>
					<SubmitButton pending={pending}>Guardar cotización</SubmitButton>
				</div>
				{url && (
					<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
						<div className="grid gap-2">
							<Label htmlFor="quote-share-url">Enlace de la cotización</Label>
							<Input id="quote-share-url" readOnly value={url} />
						</div>
						<Button
							type="button"
							variant="outline"
							className="w-full sm:w-auto"
							onClick={async () => {
								await navigator.clipboard.writeText(url);
								toast.success("Enlace copiado");
							}}
						>
							Copiar
						</Button>
					</div>
				)}
			</form>
		</Form>
	);
}
