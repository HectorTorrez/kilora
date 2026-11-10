import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";
import { matchesVehicle, vehiclesQuery } from "@/features/taller/vehicles";
import { todayISO } from "@/lib/format";
import {
	applyFormError,
	FormActions,
	NumberField,
	PhoneField,
	RequiredLegend,
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

type Schemas = components["schemas"];

const schema = z.object({
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
		mode: "onChange",
		resolver: zodResolver(schema),
		defaultValues: initial,
	});
	const linked = form.watch("vehicle_id");
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
						<PhoneField name="customer_phone" label="Teléfono" optional />
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
															vehicle.contact_phone,
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
					<QuoteItemsFields />
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
