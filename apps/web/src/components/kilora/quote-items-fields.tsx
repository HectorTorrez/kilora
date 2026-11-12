import type { components } from "@kilora/contracts";
import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { formatCents, lineCents } from "@/lib/money";
import { isPartKey, partCatalog } from "@/lib/part-catalog";
import { cn } from "@/lib/utils";
import { NumberField, SelectField, TextField } from "./form-fields";
import { moneyField, quantityField, requiredText } from "./form-schemas";
import { PartField } from "./part-picker";

export const quoteItemSchema = z.object({
	kind: z.enum(["repuesto", "mano_de_obra"]),
	description: requiredText("Ingresá la descripción"),
	quantity: quantityField,
	unit_price: moneyField(true),
	/** Clave del catálogo o "" si no aplica. */
	part: z.string(),
});

export const quoteItemsSchema = z
	.array(quoteItemSchema)
	.min(1, "Agregá al menos un ítem");
export type QuoteItemValues = z.infer<typeof quoteItemSchema>;

export function blankQuoteItem(unitPrice = ""): QuoteItemValues {
	return {
		kind: "repuesto",
		description: "",
		quantity: "1",
		unit_price: unitPrice,
		part: "",
	};
}

export function quoteItemValues(
	item: components["schemas"]["QuoteItem"],
): QuoteItemValues {
	return {
		kind: item.kind,
		description: item.description,
		quantity: String(item.quantity),
		unit_price: String(item.unit_price),
		part: item.part ?? "",
	};
}

/** Ítem listo para la API. */
export function quoteItemPayload(
	item: QuoteItemValues,
): components["schemas"]["QuoteItem"] {
	return {
		kind: item.kind,
		description: item.description,
		quantity: item.quantity,
		unit_price: item.unit_price,
		part: isPartKey(item.part) ? item.part : null,
	};
}

// El editor vive en tarjetas de distinto ancho, así que se adapta a su
// contenedor: en tarjetas anchas es una tabla; en angostas, cada ítem es
// una ficha con la descripción arriba.
const table =
	"@2xl:grid-cols-[132px_minmax(0,1fr)_190px_76px_110px_90px_36px] @2xl:items-start";

export function QuoteItemsFields({
	initialUnitPrice = "",
}: {
	initialUnitPrice?: string;
}) {
	const { control, formState, getValues, setValue } = useFormContext<{
		items: QuoteItemValues[];
	}>();
	const rows = useFieldArray({ control, name: "items" });
	const watched = useWatch({ control, name: "items" });
	let parts = 0;
	let labor = 0;
	for (const item of watched ?? []) {
		const cents = lineCents(item.quantity, item.unit_price);
		if (item.kind === "mano_de_obra") labor += cents;
		else parts += cents;
	}
	const add = () => rows.append(blankQuoteItem(initialUnitPrice));
	const hiddenLabel = "@2xl:[&>[data-slot=form-label]]:sr-only";
	const error =
		formState.errors.items?.root?.message ?? formState.errors.items?.message;
	return (
		<div className="@container space-y-3">
			<div
				className={cn(
					"hidden gap-2 px-0.5 text-[11.5px] font-medium text-ink-3 @2xl:grid",
					table,
				)}
				aria-hidden="true"
			>
				<span>Tipo</span>
				<span>Descripción</span>
				<span>Pieza en el vehículo</span>
				<span>Cantidad</span>
				<span>Precio unit.</span>
				<span className="text-right">Subtotal</span>
				<span />
			</div>
			{rows.fields.map((row, index) => (
				<div
					key={row.id}
					className={cn(
						"relative grid grid-cols-2 gap-3 rounded-md border p-3 @md:grid-cols-[minmax(0,1fr)_84px_120px_88px_40px] @2xl:gap-2 @2xl:rounded-none @2xl:border-0 @2xl:p-0",
						table,
					)}
				>
					<SelectField
						name={`items.${index}.kind`}
						label="Tipo"
						className={hiddenLabel}
						options={[
							{ value: "repuesto", label: "Repuesto" },
							{ value: "mano_de_obra", label: "Mano de obra" },
						]}
					/>
					<TextField
						name={`items.${index}.description`}
						label="Descripción"
						placeholder="Ej. Pastillas de freno delanteras"
						className={cn(
							hiddenLabel,
							"order-first col-span-full pr-10 @md:pr-0 @2xl:order-none @2xl:col-span-1",
						)}
					/>
					<PartField
						name={`items.${index}.part`}
						label="Pieza en el vehículo"
						className={cn(hiddenLabel, "col-span-full @2xl:col-span-1")}
						onPick={(part) => {
							const path = `items.${index}.description` as const;
							if (!getValues(path))
								setValue(path, partCatalog[part].label, {
									shouldValidate: true,
								});
						}}
					/>
					<NumberField
						name={`items.${index}.quantity`}
						label="Cantidad"
						min={0.01}
						step="0.01"
						className={hiddenLabel}
					/>
					<NumberField
						name={`items.${index}.unit_price`}
						label="Precio unit."
						prefix="$"
						min={0}
						step="0.01"
						className={hiddenLabel}
					/>
					<div className="self-end text-right">
						<p className="mb-2 text-sm leading-none font-medium @2xl:hidden">
							Subtotal
						</p>
						<p className="flex h-10 items-center justify-end font-mono text-[13px] tabular-nums">
							{money(
								formatCents(
									lineCents(
										watched?.[index]?.quantity,
										watched?.[index]?.unit_price,
									),
								),
							)}
						</p>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={`Quitar ítem ${index + 1}`}
						title="Quitar ítem"
						// En tarjeta angosta va arriba a la derecha, junto a "Descripción".
						className="absolute top-1.5 right-1.5 size-10 text-ink-3 hover:text-destructive @md:static @md:self-end @md:justify-self-end"
						disabled={rows.fields.length === 1}
						onClick={() => rows.remove(index)}
					>
						<Trash2 className="size-4" />
					</Button>
				</div>
			))}
			{error ? <p className="text-sm text-destructive">{error}</p> : null}
			<div className="flex flex-wrap items-start justify-between gap-4 border-t pt-3">
				<Button type="button" variant="outline" size="sm" onClick={add}>
					<Plus className="size-4" />
					Agregar ítem
				</Button>
				<dl className="grid w-full gap-1 text-[13px] @md:w-auto @md:min-w-56">
					<div className="flex justify-between gap-6 text-ink-3">
						<dt>Repuestos</dt>
						<dd className="font-mono tabular-nums">
							{money(formatCents(parts))}
						</dd>
					</div>
					<div className="flex justify-between gap-6 text-ink-3">
						<dt>Mano de obra</dt>
						<dd className="font-mono tabular-nums">
							{money(formatCents(labor))}
						</dd>
					</div>
					<div className="mt-1 flex items-baseline justify-between gap-6 border-t pt-2">
						<dt className="font-semibold">Total</dt>
						<dd className="font-display text-lg font-bold tabular-nums">
							{money(formatCents(parts + labor))}
						</dd>
					</div>
				</dl>
			</div>
		</div>
	);
}
