import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookmarkPlus, ChevronsUpDown, LayoutTemplate } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Form } from "@/components/ui/form";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useWorkshopMutation } from "@/features/taller/mutation";
import {
	quoteTemplateActions,
	quoteTemplatesQuery,
	templateTotal,
	useCanManageQuoteTemplates,
} from "@/features/taller/quote-templates";
import { money } from "@/lib/format";
import { formatCents, lineCents } from "@/lib/money";
import { FormDialog } from "./form-dialog";
import {
	applyFormError,
	FormActions,
	RootError,
	SubmitButton,
	TextField,
} from "./form-fields";
import { requiredText } from "./form-schemas";
import {
	type QuoteItemValues,
	quoteItemPayload,
	quoteItemValues,
} from "./quote-items-fields";

/**
 * Usar una plantilla copia sus ítems al formulario; nada se guarda hasta
 * que se guarda la cotización. Los cambios posteriores a la plantilla no
 * afectan cotizaciones ya hechas.
 */
export function QuoteTemplateMenu({
	workshopID,
	onItems,
	getItems,
}: {
	workshopID: string;
	onItems: (items: QuoteItemValues[]) => void;
	/** Ítems válidos del formulario, o null si hay errores por corregir. */
	getItems: () => Promise<QuoteItemValues[] | null>;
}) {
	const templates = useQuery(quoteTemplatesQuery(workshopID));
	const canManage = useCanManageQuoteTemplates(workshopID);
	const [open, setOpen] = useState(false);
	const [saving, setSaving] = useState<QuoteItemValues[] | null>(null);
	const list = templates.data ?? [];

	return (
		<>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="sm"
						role="combobox"
						aria-expanded={open}
					>
						<LayoutTemplate className="size-4" aria-hidden />
						Usar plantilla
						<ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-80 p-0" align="start">
					<Command>
						{list.length > 6 && (
							<CommandInput placeholder="Buscar plantilla…" />
						)}
						<CommandList className="max-h-72">
							<CommandEmpty>
								{templates.isPending
									? "Cargando plantillas…"
									: templates.isError
										? "No pudimos cargar las plantillas."
										: list.length
											? "No hay plantillas con ese nombre."
											: "Todavía no hay plantillas."}
							</CommandEmpty>
							{list.length > 0 && (
								<CommandGroup>
									{list.map((template) => (
										<CommandItem
											key={template.id}
											value={`${template.name} ${template.id}`}
											onSelect={() => {
												onItems(template.items.map(quoteItemValues));
												setOpen(false);
												toast.success(`Se agregó «${template.name}»`);
											}}
										>
											<span className="min-w-0 flex-1 truncate">
												{template.name}
											</span>
											<span className="shrink-0 text-xs text-ink-3 tabular-nums">
												{template.items.length}{" "}
												{template.items.length === 1 ? "ítem" : "ítems"} ·{" "}
												{money(formatCents(templateTotal(template)))}
											</span>
										</CommandItem>
									))}
								</CommandGroup>
							)}
						</CommandList>
						{canManage && (
							<div className="border-t p-1">
								<Button
									asChild
									variant="ghost"
									size="sm"
									className="w-full justify-start"
								>
									<Link to="/taller/cotizaciones/plantillas">
										Administrar plantillas
									</Link>
								</Button>
							</div>
						)}
					</Command>
				</PopoverContent>
			</Popover>
			{canManage && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={async () => {
						const items = await getItems();
						if (items) setSaving(items);
						else
							toast.error(
								"Corregí los ítems antes de guardarlos como plantilla",
							);
					}}
				>
					<BookmarkPlus className="size-4" aria-hidden />
					Guardar como plantilla
				</Button>
			)}
			<FormDialog
				open={!!saving}
				onOpenChange={(value) => {
					if (!value) setSaving(null);
				}}
				title="Guardar como plantilla"
				description="Guarda estos ítems con sus precios para reutilizarlos en otras cotizaciones del taller."
			>
				{saving && (
					<SaveTemplateForm
						workshopID={workshopID}
						items={saving}
						onClose={() => setSaving(null)}
					/>
				)}
			</FormDialog>
		</>
	);
}

const nameSchema = z.object({
	name: requiredText("Ingresá un nombre").max(
		100,
		"Usá como máximo 100 caracteres",
	),
});

function SaveTemplateForm({
	workshopID,
	items,
	onClose,
}: {
	workshopID: string;
	items: QuoteItemValues[];
	onClose: () => void;
}) {
	const form = useForm({
		resolver: zodResolver(nameSchema),
		defaultValues: { name: "" },
	});
	const create = useWorkshopMutation(
		workshopID,
		quoteTemplateActions(workshopID).create,
		{ inlineErrors: true },
	);
	return (
		<Form {...form}>
			<form
				className="space-y-4"
				noValidate
				// El diálogo vive dentro del formulario de la cotización en el
				// árbol de React; sin esto, guardar la plantilla también la enviaría.
				onSubmit={(event) => {
					event.stopPropagation();
					void form.handleSubmit(async ({ name }) => {
						try {
							await create.mutateAsync({
								name,
								items: items.map(quoteItemPayload),
							});
							toast.success("Plantilla guardada");
							onClose();
						} catch (error) {
							applyFormError(form, error);
						}
					})(event);
				}}
			>
				<fieldset disabled={create.isPending} className="space-y-4">
					<TextField
						name="name"
						label="Nombre"
						placeholder="Ej. Servicio de 5,000 km"
						maxLength={100}
						autoFocus
					/>
					<p className="text-xs text-ink-3">
						{items.length} {items.length === 1 ? "ítem" : "ítems"} ·{" "}
						{money(
							formatCents(
								items.reduce(
									(sum, item) =>
										sum + lineCents(item.quantity, item.unit_price),
									0,
								),
							),
						)}
					</p>
					<RootError />
					<FormActions>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancelar
						</Button>
						<SubmitButton pending={create.isPending}>
							Guardar plantilla
						</SubmitButton>
					</FormActions>
				</fieldset>
			</form>
		</Form>
	);
}
