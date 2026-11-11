import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { Printer, UserRound } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";
import {
	type CustomerRef,
	customersPageQuery,
} from "@/features/taller/customers";
import { matchesVehicle, vehiclesQuery } from "@/features/taller/vehicles";
import { money, phone, todayISO } from "@/lib/format";
import { formatCents, lineCents } from "@/lib/money";
import {
	applyFormError,
	NumberField,
	PhoneField,
	RootError,
	SelectField,
	SubmitButton,
	TextareaField,
	TextField,
} from "./form-fields";
import {
	optionalPhone,
	optionalText,
	optionalVehicleText,
	optionalYearField,
	plateField,
	requiredText,
	vehicleText,
} from "./form-schemas";

import {
	blankQuoteItem,
	QuoteItemsFields,
	quoteItemsSchema,
	quoteItemValues,
} from "./quote-items-fields";
import { DetailList, SectionCard, StepTitle } from "./workshop-ui";

type Schemas = components["schemas"];

const schema = z.object({
	customer_id: z.string(),
	customer_name: requiredText("Ingresá el nombre del cliente").max(
		100,
		"Usá como máximo 100 caracteres",
	),
	customer_phone: optionalPhone,
	vehicle_id: z.string(),
	vehicle_make: optionalVehicleText,
	vehicle_model: vehicleText,
	vehicle_year: optionalYearField(),
	vehicle_plate: plateField,
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
	items: quoteItemsSchema,
});

export type CounterQuoteValues = z.infer<typeof schema>;

function daysUntil(value: string) {
	const start = Date.parse(`${todayISO()}T00:00:00Z`);
	const end = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
	const days = Math.round((end - start) / 86_400_000);
	return String(Math.min(365, Math.max(days, 1)));
}

export function counterQuoteFormValues(
	quote?: Schemas["CounterQuote"],
	branchID = "",
): CounterQuoteValues {
	return {
		customer_id: quote?.customer_id ?? "",
		customer_name: quote?.customer_name ?? "",
		customer_phone: quote?.customer_phone ?? "",
		vehicle_id: quote?.vehicle_id ?? "",
		vehicle_make: quote?.vehicle_make ?? "",
		vehicle_model: quote?.vehicle_model ?? "",
		vehicle_year: quote?.vehicle_year ? String(quote.vehicle_year) : "",
		vehicle_plate: quote?.vehicle_plate ?? "",
		branch_id: quote?.branch_id ?? branchID,
		notes: quote?.notes ?? "",
		valid_days: quote?.valid_until ? daysUntil(quote.valid_until) : "15",
		items: quote?.items.length
			? quote.items.map(quoteItemValues)
			: [blankQuoteItem()],
	};
}

export function toCounterQuoteInput(
	values: CounterQuoteValues,
): Schemas["CounterQuoteInput"] {
	const plate = values.vehicle_plate.replace(/[\s-]/g, "").toUpperCase();
	return {
		customer_id: values.customer_id || null,
		customer_name: values.customer_name,
		customer_phone: values.customer_phone || null,
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
	submitLabel = "Guardar cotización",
	onCancel,
	onSubmit,
}: {
	submitLabel?: string;
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
		mode: "onChange",
		resolver: zodResolver(schema),
		defaultValues: initial,
	});
	const linked = form.watch("vehicle_id");
	const linkedCustomer = form.watch("customer_id");
	const [customerSearch, setCustomerSearch] = useState("");
	const customerQ = customerSearch.trim().toLowerCase().replace(/[\s-]/g, "");
	const customers = useQuery({
		...customersPageQuery(workshopID, customerQ, 0, 5),
		enabled: !!customerQ && !linkedCustomer,
	});
	const linkCustomer = (customer: CustomerRef) => {
		form.setValue("customer_id", customer.id);
		form.setValue("customer_name", customer.full_name, {
			shouldValidate: true,
		});
		form.setValue("customer_phone", customer.phone ?? "", {
			shouldValidate: true,
		});
		setCustomerSearch("");
	};
	const query = search.trim().toLowerCase();
	const matches = query
		? vehicles.filter((vehicle) => matchesVehicle(vehicle, query)).slice(0, 8)
		: [];
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
	const [customer, customerPhone, model, make, year, items, validDays] =
		form.watch([
			"customer_name",
			"customer_phone",
			"vehicle_model",
			"vehicle_make",
			"vehicle_year",
			"items",
			"valid_days",
		]);
	const total = (items ?? []).reduce(
		(sum, item) => sum + lineCents(item.quantity, item.unit_price),
		0,
	);
	const vehicle = [make, model, year].filter(Boolean).join(" ");
	return (
		<Form {...form}>
			<form
				onSubmit={submit}
				className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
				noValidate
			>
				<div className="min-w-0 space-y-6">
					<SectionCard
						title={
							<StepTitle n={1} done={!!customer.trim()}>
								Cliente
							</StepTitle>
						}
					>
						{linkedCustomer ? (
							<div className="flex items-center gap-3 rounded-lg border border-seal bg-seal-soft px-3 py-2 text-sm">
								<UserRound className="size-4 shrink-0 text-seal" />
								<p className="min-w-0 flex-1">
									<span className="block truncate font-semibold">
										{customer}
									</span>
									<span className="block truncate font-mono text-xs text-ink-3">
										{phone(customerPhone) || "Sin teléfono"}
									</span>
								</p>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => form.setValue("customer_id", "")}
								>
									Quitar vínculo
								</Button>
							</div>
						) : (
							<div className="grid gap-5">
								<div className="grid gap-2">
									<SearchInput
										containerClassName=""
										aria-label="Buscar cliente del taller"
										value={customerSearch}
										autoComplete="off"
										placeholder="Buscar cliente del taller por nombre o teléfono (opcional)"
										onChange={(event) => setCustomerSearch(event.target.value)}
									/>
									{customerQ && customers.data?.items.length ? (
										<ul
											aria-label="Clientes del taller"
											className="divide-y overflow-hidden rounded-lg border"
										>
											{customers.data.items.map((c) => (
												<li key={c.id}>
													<button
														type="button"
														className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-seal-soft"
														onClick={() => linkCustomer(c)}
													>
														<span className="min-w-0 flex-1 truncate font-medium">
															{c.full_name}
														</span>
														<span className="font-mono text-xs text-ink-3">
															{phone(c.phone)}
														</span>
													</button>
												</li>
											))}
										</ul>
									) : null}
								</div>
								<div className="grid gap-5 sm:grid-cols-2">
									<TextField
										name="customer_name"
										label="Nombre"
										autoComplete="name"
										required
										autoFocus
									/>
									<PhoneField
										name="customer_phone"
										label="Teléfono"
										optional
										description="Necesario para convertirla en orden."
									/>
								</div>
							</div>
						)}
					</SectionCard>
					<SectionCard
						title={
							<StepTitle n={2} done={!!model.trim()}>
								Vehículo
							</StepTitle>
						}
						description="Si ya está registrado en el taller, buscalo y se completan los datos."
					>
						<div className="grid gap-5">
							<div className="grid gap-2">
								<Label htmlFor={searchId}>
									Buscar vehículo del taller{" "}
									<span className="font-normal text-muted-foreground">
										(opcional)
									</span>
								</Label>
								<SearchInput
									containerClassName=""
									id={searchId}
									value={search}
									autoComplete="off"
									placeholder="Placa, marca o cliente"
									onFocus={() => setOpenSearch(true)}
									onChange={(event) => {
										setSearch(event.target.value);
										setOpenSearch(true);
									}}
								/>
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
										<ul
											aria-label="Vehículos del taller"
											className="grid gap-2"
										>
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
															form.setValue(
																"vehicle_plate",
																vehicle.plate ?? "",
															);
															if (vehicle.customer)
																linkCustomer(vehicle.customer);
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
											Ningún vehículo coincide. Podés completar los datos a
											mano.
										</p>
									)
								) : null}
							</div>
							<div className="grid gap-5 sm:grid-cols-2">
								<TextField name="vehicle_make" label="Marca" optional />
								<TextField name="vehicle_model" label="Modelo" required />
								<TextField
									name="vehicle_year"
									label="Año"
									inputMode="numeric"
									maxLength={4}
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
						</div>
					</SectionCard>
					<SectionCard
						title={
							<StepTitle n={3} done={total > 0}>
								Repuestos y mano de obra
							</StepTitle>
						}
					>
						<QuoteItemsFields />
					</SectionCard>
					<SectionCard title={<StepTitle n={4}>Condiciones</StepTitle>}>
						<div className="grid gap-5 sm:grid-cols-2">
							<NumberField
								name="valid_days"
								label="Válida por"
								suffix="días"
								min={1}
								max={365}
								step="1"
								description="Después de este plazo el precio puede cambiar."
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
								placeholder="Ej. Precio de repuestos sujeto a disponibilidad"
								description="Aparecen en la cotización impresa y en el link que recibe el cliente."
							/>
						</div>
					</SectionCard>
				</div>
				<aside className="lg:sticky lg:top-6">
					<SectionCard title="Resumen">
						<DetailList
							items={[
								{ label: "Cliente", value: customer.trim() },
								{ label: "Vehículo", value: vehicle },
								{
									label: "Válida por",
									value: validDays ? `${validDays} días` : "",
								},
							]}
						/>
						<div className="mt-4 flex items-baseline justify-between border-t pt-3">
							<span className="text-[13px] font-medium">Total</span>
							<span className="font-display text-2xl font-bold tabular-nums">
								{money(formatCents(total))}
							</span>
						</div>
						<RootError className="mt-4" />
						<div className="mt-4 grid gap-2">
							<SubmitButton
								pending={pending}
								className="w-full sm:w-full"
								onClick={() => {
									intent.current = false;
								}}
							>
								{submitLabel}
							</SubmitButton>
							{showPrint ? (
								<Button
									type="submit"
									variant="outline"
									className="w-full"
									disabled={pending}
									onClick={() => {
										intent.current = true;
									}}
								>
									<Printer className="size-4" />
									Guardar e imprimir
								</Button>
							) : null}
							{onCancel ? (
								<Button
									type="button"
									variant="ghost"
									className="w-full"
									onClick={onCancel}
								>
									Cancelar
								</Button>
							) : null}
						</div>
						<p className="mt-3 text-center text-[11.5px] text-ink-3">
							<span className="text-destructive">*</span> Campo obligatorio
						</p>
					</SectionCard>
				</aside>
			</form>
		</Form>
	);
}
