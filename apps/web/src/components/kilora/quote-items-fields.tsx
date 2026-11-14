import type { components } from "@kilora/contracts";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { money } from "@/lib/format";
import { formatCents, lineCents } from "@/lib/money";
import { isPartKey, partCatalog } from "@/lib/part-catalog";
import { cn } from "@/lib/utils";
import { AIQuoteDraft, type QuoteDraftItem } from "./ai-quote-draft";
import { NumberField, SelectField, TextField } from "./form-fields";
import {
	moneyField,
	optionalText,
	quantityField,
	requiredText,
} from "./form-schemas";
import { PartField } from "./part-picker";
import { QuoteTemplateMenu } from "./quote-template-menu";

export const quoteItemSchema = z.object({
	kind: z.enum(["repuesto", "mano_de_obra"]),
	description: requiredText("Ingresá la descripción"),
	brand: optionalText.max(100, "Usá como máximo 100 caracteres"),
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
		brand: "",
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
		brand: item.brand ?? "",
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
		brand: item.kind === "repuesto" ? item.brand.trim() || null : null,
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

/** Ítem del formulario a partir de un ítem propuesto por la IA. */
function draftItemValues(
	item: QuoteDraftItem,
	unitPrice: string,
): QuoteItemValues {
	return {
		kind: item.kind,
		description: item.description,
		brand: "",
		quantity: item.quantity,
		unit_price: item.unit_price ?? unitPrice,
		part: item.part && isPartKey(item.part) ? item.part : "",
	};
}

export function QuoteItemsFields({
	initialUnitPrice = "",
	workshopID,
	vehicle,
	templates = true,
}: {
	initialUnitPrice?: string;
	/** Con taller, ofrece describir el trabajo con IA y usar plantillas. */
	workshopID?: string;
	vehicle?: string;
	/** Ofrece usar y guardar plantillas de cotización. */
	templates?: boolean;
}) {
	const { control, formState, getValues, setValue, trigger } = useFormContext<{
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
	const insert = (next: QuoteItemValues[]) => {
		// Si solo hay ítems vacíos, los nuevos los reemplazan; si no, se suman.
		const empty = getValues("items").every(
			(item) => !item.description.trim() && !item.part && !item.brand.trim(),
		);
		if (empty) rows.replace(next);
		else rows.append(next);
	};
	const addDraft = (draft: QuoteDraftItem[]) =>
		insert(draft.map((item) => draftItemValues(item, initialUnitPrice)));
	const validItems = async () =>
		(await trigger("items")) ? getValues("items") : null;
	const hiddenLabel = "@2xl:[&>[data-slot=form-label]]:sr-only";
	const error =
		formState.errors.items?.root?.message ?? formState.errors.items?.message;
	return (
		<div className="@container space-y-3">
			{workshopID ? (
				<div className="flex flex-wrap items-start gap-2">
					{templates && (
						<QuoteTemplateMenu
							workshopID={workshopID}
							onItems={insert}
							getItems={validItems}
						/>
					)}
					<AIQuoteDraft
						workshopID={workshopID}
						vehicle={vehicle}
						onItems={addDraft}
					/>
				</div>
			) : null}
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
					<div className="order-first col-span-full min-w-0 space-y-2 pr-10 @md:pr-0 @2xl:order-none @2xl:col-span-1">
						<TextField
							name={`items.${index}.description`}
							label="Descripción"
							placeholder="Ej. Pastillas de freno delanteras"
							className={hiddenLabel}
						/>
						{watched?.[index]?.kind === "repuesto" && (
							<TextField
								name={`items.${index}.brand`}
								label="Marca"
								placeholder="Sin registrar"
								maxLength={100}
								optional
							/>
						)}
					</div>
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
					<RemoveItemButton
						index={index}
						disabled={rows.fields.length === 1}
						// Un ítem sin datos se quita sin preguntar.
						confirm={Boolean(
							watched?.[index]?.description?.trim() ||
								watched?.[index]?.part ||
								watched?.[index]?.brand?.trim(),
						)}
						onRemove={() => rows.remove(index)}
					/>
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

/** Botón para quitar un ítem; pide confirmación si el ítem tiene datos. */
function RemoveItemButton({
	index,
	disabled,
	confirm,
	onRemove,
}: {
	index: number;
	disabled: boolean;
	confirm: boolean;
	onRemove: () => void;
}) {
	const [open, setOpen] = useState(false);
	const trigger = (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			aria-label={`Quitar ítem ${index + 1}`}
			title="Quitar ítem"
			// En tarjeta angosta va arriba a la derecha, junto a "Descripción".
			className="absolute top-1.5 right-1.5 size-10 text-ink-3 hover:text-destructive @md:static @md:self-end @md:justify-self-end"
			disabled={disabled}
			onClick={confirm ? undefined : onRemove}
		>
			<Trash2 className="size-4" />
		</Button>
	);
	if (!confirm) return trigger;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent align="end" className="w-60 space-y-3 p-3">
				<p className="text-sm">¿Quitar este ítem de la cotización?</p>
				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setOpen(false)}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						onClick={() => {
							setOpen(false);
							onRemove();
						}}
					>
						Quitar
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
