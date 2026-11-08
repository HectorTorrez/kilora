import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/format";
import { formatCents, lineCents } from "@/lib/money";
import { vehiclesQuery } from "@/lib/workshop";
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
	maskSvPhone,
	moneyField,
	optionalText,
	requiredText,
	toSvPhone,
	yearField,
} from "./form-schemas";

type Schemas = components["schemas"];

const itemSchema = z.object({
	kind: z.enum(["repuesto", "mano_de_obra"]),
	description: requiredText("Ingresá la descripción"),
	quantity: z
		.string()
		.trim()
		.refine(
			(value) => /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0,
			"Ingresá una cantidad mayor a 0",
		),
	unit_price: moneyField(true),
});

const schema = z.object({
	customer_name: requiredText("Ingresá el nombre del cliente"),
	customer_phone: z
		.string()
		.trim()
		.superRefine((value, ctx) => {
			if (!value) return;
			if (!/^\d{8}$/.test(maskSvPhone(value)))
				ctx.addIssue({
					code: "custom",
					message: "Ingresá un teléfono de 8 dígitos",
				});
		}),
	vehicle_id: z.string(),
	vehicle_make: optionalText,
	vehicle_model: requiredText("Ingresá el modelo"),
	vehicle_year: yearField(false),
	vehicle_plate: optionalText,
	branch_id: z.string().min(1, "Elegí una sucursal"),
	notes: optionalText,
	valid_days: z
		.string()
		.trim()
		.refine(
			(value) =>
				/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 365,
			"Ingresá entre 1 y 365 días",
		),
	items: z.array(itemSchema).min(1, "Agregá al menos un ítem"),
});

export type CounterQuoteValues = z.infer<typeof schema>;

function blankItem(): CounterQuoteValues["items"][number] {
	return {
		kind: "repuesto",
		description: "",
		quantity: "1",
		unit_price: "",
	};
}

function daysUntil(value: string) {
	const today = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/El_Salvador",
	}).format(new Date());
	const start = Date.parse(`${today}T00:00:00Z`);
	const end = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
	const days = Math.round((end - start) / 86_400_000);
	return String(Math.min(365, Math.max(days, 1)));
}

export function counterQuoteFormValues(
	quote?: Schemas["CounterQuote"],
	branchID = "",
): CounterQuoteValues {
	return {
		customer_name: quote?.customer_name ?? "",
		customer_phone: quote?.customer_phone
			? maskSvPhone(quote.customer_phone)
			: "",
		vehicle_id: quote?.vehicle_id ?? "",
		vehicle_make: quote?.vehicle_make ?? "",
		vehicle_model: quote?.vehicle_model ?? "",
		vehicle_year: quote?.vehicle_year ? String(quote.vehicle_year) : "",
		vehicle_plate: quote?.vehicle_plate ?? "",
		branch_id: quote?.branch_id ?? branchID,
		notes: quote?.notes ?? "",
		valid_days: quote?.valid_until ? daysUntil(quote.valid_until) : "15",
		items: quote?.items.length
			? quote.items.map((item) => ({
					kind: item.kind,
					description: item.description,
					quantity: String(item.quantity),
					unit_price: String(item.unit_price),
				}))
			: [blankItem()],
	};
}

export function toCounterQuoteInput(
	values: CounterQuoteValues,
): Schemas["CounterQuoteInput"] {
	const plate = values.vehicle_plate.replace(/[\s-]/g, "").toUpperCase();
	return {
		customer_name: values.customer_name,
		customer_phone: toSvPhone(values.customer_phone),
		vehicle_id: values.vehicle_id || null,
		vehicle_make: values.vehicle_make.trim() || null,
		vehicle_model: values.vehicle_model,
		vehicle_year: values.vehicle_year ? Number(values.vehicle_year) : null,
		vehicle_plate: plate || null,
		branch_id: values.branch_id,
		notes: values.notes.trim() || null,
		valid_days: Number(values.valid_days),
		items: values.items.map((item) => ({
			kind: item.kind,
			description: item.description,
			quantity: item.quantity,
			unit_price: item.unit_price,
		})),
	};
}

export function CounterQuoteForm({
	workshopID,
	branches,
	initial,
	pending = false,
	showPrint = false,
	onCancel,
	onSubmit,
}: {
	workshopID: string;
	branches: { branch_id: string; branch_name: string }[];
	initial: CounterQuoteValues;
	pending?: boolean;
	showPrint?: boolean;
	onCancel?: () => void;
	onSubmit: (
		body: Schemas["CounterQuoteInput"],
		print: boolean,
	) => Promise<void>;
}) {
	const searchId = useId();
	const intent = useRef(false);
	const [search, setSearch] = useState("");
	const [openSearch, setOpenSearch] = useState(false);
	const { data: vehicles = [], isLoading } = useQuery({
		...vehiclesQuery(workshopID),
		enabled: openSearch,
	});
	const form = useForm({
		resolver: zodResolver(schema),
		defaultValues: initial,
	});
	const rows = useFieldArray({ control: form.control, name: "items" });
	const watched = form.watch("items");
	const linked = form.watch("vehicle_id");
	const query = search.trim().toLowerCase();
	const matches = query
		? vehicles
				.filter((vehicle) =>
					`${vehicle.plate ?? ""} ${vehicle.make} ${vehicle.model} ${vehicle.contact_name ?? ""}`
						.toLowerCase()
						.includes(query),
				)
				.slice(0, 8)
		: [];
	let parts = 0;
	let labor = 0;
	for (const item of watched ?? []) {
		const cents = lineCents(item.quantity ?? "", item.unit_price ?? "");
		if (item.kind === "mano_de_obra") labor += cents;
		else parts += cents;
	}
	const submit = form.handleSubmit(async (values) => {
		const branch_id = values.branch_id || branches[0]?.branch_id;
		if (!branch_id) {
			form.setError("root", {
				message: "No hay una sucursal disponible para guardar la cotización.",
			});
			return;
		}
		form.clearErrors("root");
		try {
			await onSubmit(
				toCounterQuoteInput({ ...values, branch_id }),
				intent.current,
			);
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<Form {...form}>
			<form onSubmit={submit} className="grid gap-5" noValidate>
				<RequiredLegend />
				<Card className="gap-4 rounded-lg p-5 shadow-none">
					<h2 className="font-semibold">Cliente</h2>
					<div className="grid gap-4 sm:grid-cols-2">
						<TextField
							name="customer_name"
							label="Nombre"
							autoComplete="name"
							required
							autoFocus
						/>
						<TextField
							name="customer_phone"
							label="Teléfono"
							prefix="+503"
							inputMode="numeric"
							autoComplete="tel"
							placeholder="77778888"
							normalize={maskSvPhone}
							optional
						/>
					</div>
				</Card>
				<Card className="gap-4 rounded-lg p-5 shadow-none">
					<h2 className="font-semibold">Vehículo</h2>
					<div className="grid gap-2">
						<Label htmlFor={searchId}>
							Buscar vehículo del taller{" "}
							<span className="font-normal text-muted-foreground">
								(opcional)
							</span>
						</Label>
						<div className="relative">
							<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
							<Input
								id={searchId}
								value={search}
								autoComplete="off"
								placeholder="Placa, marca o cliente"
								className="pl-9"
								onFocus={() => setOpenSearch(true)}
								onChange={(event) => {
									setSearch(event.target.value);
									setOpenSearch(true);
								}}
							/>
						</div>
						{linked ? (
							<div className="flex items-center justify-between gap-3 rounded-lg border border-seal bg-seal-soft px-3 py-2 text-sm">
								<p>Vinculado a un vehículo del taller</p>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => form.setValue("vehicle_id", "")}
								>
									Quitar vínculo
								</Button>
							</div>
						) : null}
						{openSearch && query ? (
							isLoading ? (
								<p className="text-sm text-ink-3">Buscando vehículos…</p>
							) : matches.length > 0 ? (
								<ul aria-label="Vehículos del taller" className="grid gap-2">
									{matches.map((vehicle) => (
										<li key={vehicle.id}>
											<button
												type="button"
												className="w-full rounded-lg border bg-background px-4 py-3 text-left hover:border-seal hover:bg-seal-soft"
												onClick={() => {
													form.setValue("vehicle_id", vehicle.id);
													form.setValue("vehicle_make", vehicle.make);
													form.setValue("vehicle_model", vehicle.model);
													form.setValue(
														"vehicle_year",
														vehicle.year ? String(vehicle.year) : "",
													);
													form.setValue("vehicle_plate", vehicle.plate ?? "");
													if (vehicle.contact_name)
														form.setValue(
															"customer_name",
															vehicle.contact_name,
														);
													if (vehicle.contact_phone)
														form.setValue(
															"customer_phone",
															maskSvPhone(vehicle.contact_phone),
														);
													setSearch("");
													setOpenSearch(false);
												}}
											>
												<span className="font-mono text-sm">
													{vehicle.plate || "Sin placa"}
												</span>
												<span className="text-ink-3">
													{" "}
													· {vehicle.make} {vehicle.model}
													{vehicle.year ? ` ${vehicle.year}` : ""}
												</span>
											</button>
										</li>
									))}
								</ul>
							) : (
								<p className="text-sm text-ink-3">
									Ningún vehículo coincide. Podés completar los datos a mano.
								</p>
							)
						) : null}
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<TextField name="vehicle_make" label="Marca" optional />
						<TextField name="vehicle_model" label="Modelo" required />
						<TextField
							name="vehicle_year"
							label="Año"
							inputMode="numeric"
							optional
						/>
						<TextField
							name="vehicle_plate"
							label="Placa"
							uppercase
							optional
							placeholder="P123456"
						/>
					</div>
				</Card>
				<Card className="gap-4 rounded-lg p-5 shadow-none">
					<div className="flex items-center justify-between gap-3">
						<h2 className="font-semibold">Ítems</h2>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => rows.append(blankItem())}
						>
							Agregar ítem
						</Button>
					</div>
					{rows.fields.map((row, index) => {
						const current = watched?.[index];
						const subtotal = lineCents(
							current?.quantity ?? "",
							current?.unit_price ?? "",
						);
						return (
							<div
								key={row.id}
								className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
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
									label="Precio unitario"
									prefix="$"
									min={0}
									step="0.01"
									required
								/>
								<div className="flex items-center justify-between gap-3 sm:col-span-2">
									<p className="text-sm tabular-nums">
										Subtotal {money(formatCents(subtotal))}
									</p>
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={rows.fields.length === 1}
										onClick={() => rows.remove(index)}
									>
										Quitar
									</Button>
								</div>
							</div>
						);
					})}
					<dl className="grid gap-1 border-t pt-3 text-sm">
						<div className="flex justify-between gap-4">
							<dt>Subtotal repuestos</dt>
							<dd className="tabular-nums">{money(formatCents(parts))}</dd>
						</div>
						<div className="flex justify-between gap-4">
							<dt>Subtotal mano de obra</dt>
							<dd className="tabular-nums">{money(formatCents(labor))}</dd>
						</div>
						<div className="flex justify-between gap-4 text-base font-bold">
							<dt>Total</dt>
							<dd className="tabular-nums">
								{money(formatCents(parts + labor))}
							</dd>
						</div>
					</dl>
				</Card>
				<Card className="gap-4 rounded-lg p-5 shadow-none">
					<h2 className="font-semibold">Condiciones</h2>
					<div className="grid gap-4 sm:grid-cols-2">
						<NumberField
							name="valid_days"
							label="Vigencia en días"
							min={1}
							max={365}
							step="1"
							required
						/>
						{branches.length !== 1 ? (
							<SelectField
								name="branch_id"
								label="Sucursal"
								options={branches.map((branch) => ({
									value: branch.branch_id,
									label: branch.branch_name,
								}))}
								required
							/>
						) : null}
						<TextareaField
							name="notes"
							label="Notas para el cliente"
							optional
							className="sm:col-span-2"
							placeholder="Lo que el cliente debe saber sobre este presupuesto"
						/>
					</div>
				</Card>
				<RootError />
				<FormActions>
					{onCancel ? (
						<Button
							type="button"
							variant="outline"
							className="w-full sm:w-auto"
							onClick={onCancel}
						>
							Cancelar
						</Button>
					) : null}
					{showPrint ? (
						<Button
							type="submit"
							variant="outline"
							className="w-full sm:w-auto"
							disabled={pending}
							onClick={() => {
								intent.current = true;
							}}
						>
							Guardar e imprimir
						</Button>
					) : null}
					<SubmitButton
						pending={pending}
						onClick={() => {
							intent.current = false;
						}}
					>
						Guardar
					</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}
