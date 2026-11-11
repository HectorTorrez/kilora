import { useQuery } from "@tanstack/react-query";
import { Check, UserPlus, UserRound, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type CustomerChoice,
	type CustomerRef,
	customersPageQuery,
} from "@/features/taller/customers";
import { phone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PhoneField, TextField } from "./form-fields";
import { emailField, optionalPhone, personName } from "./form-schemas";

/** Valores del selector de cliente dentro de un formulario: `customer.*`. */
export const customerPickerSchema = z
	.object({
		mode: z.enum(["existing", "new"]),
		id: z.string(),
		full_name: z.string(),
		phone: z.string(),
		email: z.string(),
	})
	.superRefine((value, ctx) => {
		if (value.mode === "existing") {
			if (!value.id)
				ctx.addIssue({
					code: "custom",
					path: ["id"],
					message: "Elegí un cliente o registrá uno nuevo",
				});
			return;
		}
		const name = personName.safeParse(value.full_name);
		if (!name.success)
			ctx.addIssue({
				code: "custom",
				path: ["full_name"],
				message: value.full_name.trim()
					? name.error.issues[0].message
					: "Ingresá el nombre del cliente",
			});
		if (!value.phone.trim())
			ctx.addIssue({
				code: "custom",
				path: ["phone"],
				message: "Ingresá el teléfono del cliente",
			});
		else if (!optionalPhone.safeParse(value.phone).success)
			ctx.addIssue({
				code: "custom",
				path: ["phone"],
				message: "Ingresá un teléfono válido para el país elegido",
			});
		if (value.email.trim() && !emailField.safeParse(value.email).success)
			ctx.addIssue({
				code: "custom",
				path: ["email"],
				message: "Ingresá un correo válido",
			});
	});

export type CustomerPickerValues = z.infer<typeof customerPickerSchema>;

export function customerPickerDefaults(
	customer?: CustomerRef | null,
): CustomerPickerValues {
	return {
		mode: "existing",
		id: customer?.id ?? "",
		full_name: "",
		phone: "",
		email: "",
	};
}

export function toCustomerChoice(value: CustomerPickerValues): CustomerChoice {
	return value.mode === "existing"
		? { customer_id: value.id }
		: {
				customer: {
					full_name: value.full_name.trim(),
					phone: value.phone,
					email: value.email.trim() || null,
				},
			};
}

function useDebounced<T>(value: T, ms = 200) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(timer);
	}, [value, ms]);
	return debounced;
}

/**
 * Elige al cliente dueño del vehículo: busca entre los clientes del taller o
 * registra uno nuevo en el mismo formulario. Usa los campos `customer.*`.
 */
export function CustomerPicker({
	workshopID,
	initial,
	locked = false,
	autoFocus = false,
}: {
	workshopID: string;
	/** Cliente ya elegido al abrir el formulario. */
	initial?: CustomerRef | null;
	/** Impide cambiar el cliente (alta de vehículo desde la ficha del cliente). */
	locked?: boolean;
	autoFocus?: boolean;
}) {
	const form = useFormContext<{ customer: CustomerPickerValues }>();
	const mode = useWatch({ control: form.control, name: "customer.mode" });
	const id = useWatch({ control: form.control, name: "customer.id" });
	const [selected, setSelected] = useState<CustomerRef | null>(initial ?? null);
	const [search, setSearch] = useState("");
	const q = useDebounced(search.trim().toLowerCase().replace(/[\s-]/g, ""));
	const results = useQuery({
		...customersPageQuery(workshopID, q, 0, 6),
		enabled: !!workshopID && mode === "existing" && !id,
		placeholderData: (previous) => previous,
	});

	const set = (name: keyof CustomerPickerValues, value: string) =>
		form.setValue(`customer.${name}`, value, {
			shouldDirty: true,
			shouldValidate: form.formState.isSubmitted,
		});
	const pick = (customer: CustomerRef) => {
		setSelected(customer);
		set("id", customer.id);
		form.clearErrors("customer");
	};
	const startNew = () => {
		const typed = search.trim();
		const digits = typed.replace(/\D/g, "");
		if (typed && digits.length === typed.replace(/[\s()+-]/g, "").length) {
			if (digits.length === 8) set("phone", `+503${digits}`);
			else if (typed.startsWith("+")) set("phone", `+${digits}`);
		} else if (typed) set("full_name", typed);
		set("id", "");
		set("mode", "new");
		form.clearErrors("customer");
	};
	const backToSearch = () => {
		set("mode", "existing");
		form.clearErrors("customer");
	};

	if (mode === "new")
		return (
			<fieldset className="grid gap-4 rounded-lg border border-dashed p-4 sm:grid-cols-2">
				<legend className="flex items-center gap-1.5 px-1 text-[13px] font-semibold">
					<UserPlus className="size-4 text-seal" />
					Cliente nuevo
				</legend>
				<TextField
					name="customer.full_name"
					label="Nombre completo"
					required
					autoFocus
					maxLength={100}
					inputPattern={/^[\p{L}\p{M} ’'.-]*$/u}
					autoComplete="off"
				/>
				<PhoneField name="customer.phone" label="Teléfono" required />
				<TextField
					name="customer.email"
					label="Correo"
					type="email"
					optional
					autoComplete="off"
					description="Sirve para invitarlo a ver el historial."
					className="sm:col-span-2"
				/>
				<div className="sm:col-span-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="-ml-2"
						onClick={backToSearch}
					>
						<Users className="size-4" />
						Elegir un cliente existente
					</Button>
				</div>
			</fieldset>
		);

	return (
		<FormField
			control={form.control}
			name="customer.id"
			render={() => (
				<FormItem required>
					<FormLabel>Cliente</FormLabel>
					{id && selected ? (
						<div className="flex items-center gap-3 rounded-md border border-seal/30 bg-seal-soft/50 p-3">
							<span className="grid size-8 shrink-0 place-items-center rounded-full bg-seal text-white">
								<Check className="size-4" />
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate text-[13.5px] font-semibold">
									{selected.full_name}
								</p>
								<p className="truncate font-mono text-xs text-ink-3">
									{phone(selected.phone) || "Sin teléfono"}
								</p>
							</div>
							{!locked && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => set("id", "")}
								>
									Cambiar
								</Button>
							)}
						</div>
					) : (
						<div className="space-y-2">
							<SearchInput
								autoFocus={autoFocus}
								aria-label="Buscar cliente"
								placeholder="Buscar por nombre o teléfono"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								onKeyDown={(event) => {
									if (event.key !== "Enter") return;
									event.preventDefault();
									const first = results.data?.items[0];
									if (first && q) pick(first);
								}}
							/>
							{results.isLoading ? (
								<Skeleton className="h-16" />
							) : (
								<ul
									className={cn(
										"divide-y overflow-hidden rounded-md border",
										!results.data?.items.length && "hidden",
									)}
								>
									{results.data?.items.map((c) => (
										<li key={c.id}>
											<button
												type="button"
												onClick={() => pick(c)}
												className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-seal-soft/40 focus-visible:bg-seal-soft/40 focus-visible:outline-none"
											>
												<UserRound className="size-4 shrink-0 text-ink-3" />
												<span className="min-w-0 flex-1 truncate text-[13px] font-medium">
													{c.full_name}
												</span>
												<span className="shrink-0 font-mono text-xs text-ink-3">
													{phone(c.phone) || "Sin teléfono"}
												</span>
											</button>
										</li>
									))}
								</ul>
							)}
							<button
								type="button"
								onClick={startNew}
								className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed p-2.5 text-[13px] font-semibold text-seal hover:border-seal/40 hover:bg-seal-soft/40"
							>
								<UserPlus className="size-4" />
								{q && !results.data?.items.length
									? `No está registrado: crear cliente nuevo`
									: "Registrar cliente nuevo"}
							</button>
						</div>
					)}
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}
