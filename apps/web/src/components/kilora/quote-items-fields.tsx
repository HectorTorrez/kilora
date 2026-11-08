import type { components } from "@kilora/contracts";
import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { formatCents, lineCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { NumberField, SelectField, TextField } from "./form-fields";
import { moneyField, requiredText } from "./form-schemas";

export const quoteItemSchema = z.object({
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
	};
}

export function quoteItemValues(
	item: components["schemas"]["QuoteItem"],
): QuoteItemValues {
	return {
		...item,
		quantity: String(item.quantity),
		unit_price: String(item.unit_price),
	};
}

export function QuoteItemsFields({
	layout = "cards",
	initialUnitPrice = "",
}: {
	layout?: "cards" | "compact";
	initialUnitPrice?: string;
}) {
	const { control, formState } = useFormContext<{ items: QuoteItemValues[] }>();
	const rows = useFieldArray({ control, name: "items" });
	const watched = useWatch({ control, name: "items" });
	const compact = layout === "compact";
	let parts = 0;
	let labor = 0;
	for (const item of watched ?? []) {
		const cents = lineCents(item.quantity, item.unit_price);
		if (item.kind === "mano_de_obra") labor += cents;
		else parts += cents;
	}
	const add = () => rows.append(blankQuoteItem(initialUnitPrice));
	const fieldClass = compact ? "[&>[data-slot=form-label]]:sr-only" : undefined;
	return (
		<>
			{compact ? (
				<div className="hidden grid-cols-[140px_1fr_80px_110px_36px] gap-2 px-0.5 text-[11.5px] font-medium text-ink-3 sm:grid">
					<span>Tipo</span>
					<span>Descripción</span>
					<span>Cant.</span>
					<span>Precio unit.</span>
					<span />
				</div>
			) : (
				<div className="flex items-center justify-between gap-3">
					<h2 className="font-semibold">Ítems</h2>
					<Button type="button" variant="outline" size="sm" onClick={add}>
						Agregar ítem
					</Button>
				</div>
			)}
			{rows.fields.map((row, index) => (
				<div
					key={row.id}
					className={
						compact
							? "grid grid-cols-[1fr_1fr_auto] gap-2 sm:grid-cols-[140px_1fr_80px_110px_36px]"
							: "grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
					}
				>
					<SelectField
						name={`items.${index}.kind`}
						label="Tipo"
						className={fieldClass}
						options={[
							{ value: "repuesto", label: "Repuesto" },
							{ value: "mano_de_obra", label: "Mano de obra" },
						]}
						required
					/>
					<TextField
						name={`items.${index}.description`}
						label="Descripción"
						placeholder={compact ? "Descripción" : undefined}
						className={cn(fieldClass, compact && "col-span-2 sm:col-span-1")}
						required
					/>
					<NumberField
						name={`items.${index}.quantity`}
						label="Cantidad"
						min={0.01}
						step="0.01"
						className={fieldClass}
						required
					/>
					<NumberField
						name={`items.${index}.unit_price`}
						label="Precio unitario"
						prefix={compact ? undefined : "$"}
						min={0}
						step="0.01"
						className={fieldClass}
						required
					/>
					{compact ? (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label="Quitar ítem"
							className="text-ink-3 hover:text-destructive"
							onClick={() => rows.remove(index)}
						>
							<Trash2 className="size-4" />
						</Button>
					) : (
						<div className="flex items-center justify-between gap-3 sm:col-span-2">
							<p className="text-sm tabular-nums">
								Subtotal{" "}
								{money(
									formatCents(
										lineCents(
											watched?.[index]?.quantity,
											watched?.[index]?.unit_price,
										),
									),
								)}
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
					)}
				</div>
			))}
			{formState.errors.items?.root?.message ||
			formState.errors.items?.message ? (
				<p className="text-sm text-destructive">
					{formState.errors.items.root?.message ??
						formState.errors.items.message}
				</p>
			) : null}
			{compact ? (
				<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
					<button
						type="button"
						className="inline-flex items-center gap-1 text-xs font-semibold text-seal hover:underline"
						onClick={add}
					>
						<Plus className="size-3.5" />
						Agregar ítem
					</button>
					<p className="text-[13px] text-ink-3">
						Total cotizado{" "}
						<strong className="ml-1 font-display text-lg text-foreground tabular-nums">
							{money(formatCents(parts + labor))}
						</strong>
					</p>
				</div>
			) : (
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
			)}
		</>
	);
}
