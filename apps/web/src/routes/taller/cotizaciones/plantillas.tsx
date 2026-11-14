import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FormDialog } from "@/components/kilora/form-dialog";
import {
	applyFormError,
	FormActions,
	RootError,
	SubmitButton,
	TextField,
} from "@/components/kilora/form-fields";
import { requiredText } from "@/components/kilora/form-schemas";
import { QueryContent } from "@/components/kilora/query-content";
import {
	blankQuoteItem,
	QuoteItemsFields,
	quoteItemPayload,
	quoteItemsSchema,
	quoteItemValues,
} from "@/components/kilora/quote-items-fields";
import {
	BackLink,
	EmptyState,
	PageBody,
	PageHeader,
} from "@/components/kilora/workshop-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useWorkshopMutation } from "@/features/taller/mutation";
import {
	type QuoteTemplate,
	quoteTemplateActions,
	quoteTemplatesQuery,
	templateTotal,
	useCanManageQuoteTemplates,
} from "@/features/taller/quote-templates";
import { useWorkshopId } from "@/features/taller/session";
import { date, money } from "@/lib/format";
import { formatCents } from "@/lib/money";

export const Route = createFileRoute("/taller/cotizaciones/plantillas")({
	head: () => ({ meta: [{ title: "Plantillas de cotización · Kilora" }] }),
	component: QuoteTemplatesPage,
});

function QuoteTemplatesPage() {
	const workshopID = useWorkshopId();
	const canManage = useCanManageQuoteTemplates(workshopID);
	const templates = useQuery(quoteTemplatesQuery(workshopID));
	// null: cerrado; "new": nueva plantilla; si no, la plantilla a editar.
	const [editing, setEditing] = useState<QuoteTemplate | "new" | null>(null);
	const [removing, setRemoving] = useState<QuoteTemplate | null>(null);
	const remove = useWorkshopMutation(
		workshopID,
		quoteTemplateActions(workshopID).remove,
	);
	const list = templates.data ?? [];
	const create = canManage ? (
		<Button onClick={() => setEditing("new")}>
			<Plus className="size-4" />
			Nueva plantilla
		</Button>
	) : undefined;

	return (
		<PageBody>
			<PageHeader
				back={<BackLink to="/taller/cotizaciones">Cotizaciones</BackLink>}
				eyebrow="Operación"
				title="Plantillas de cotización"
				description="Trabajos frecuentes con sus ítems y precios. Al cotizar, elegí «Usar plantilla» para copiarlos y ajustarlos. Editar una plantilla no cambia las cotizaciones ya hechas."
				actions={create}
			/>
			<Card className="gap-0 overflow-hidden py-0 shadow-none">
				<QueryContent
					pending={templates.isPending}
					error={templates.error}
					empty={list.length === 0}
					emptyState={
						<EmptyState
							icon={LayoutTemplate}
							title="Todavía no hay plantillas"
							description={
								canManage
									? "Creá una aquí o, desde cualquier cotización, usá «Guardar como plantilla»."
									: "Recepción o un administrador pueden crearlas."
							}
							action={create}
						/>
					}
				>
					<ul className="divide-y">
						{list.map((template) => (
							<li
								key={template.id}
								className="flex items-center gap-3 px-4 py-3 sm:px-5"
							>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium">{template.name}</p>
									<p className="truncate text-sm text-ink-3">
										{template.items.map((item) => item.description).join(" · ")}
									</p>
									<p className="text-xs text-ink-3 tabular-nums">
										{template.items.length}{" "}
										{template.items.length === 1 ? "ítem" : "ítems"} ·{" "}
										{money(formatCents(templateTotal(template)))} · Editada el{" "}
										{date(template.updated_at)}
									</p>
								</div>
								{canManage && (
									<div className="flex shrink-0 gap-1">
										<Button
											variant="ghost"
											size="icon"
											aria-label={`Editar ${template.name}`}
											title="Editar"
											onClick={() => setEditing(template)}
										>
											<Pencil className="size-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											aria-label={`Eliminar ${template.name}`}
											title="Eliminar"
											onClick={() => setRemoving(template)}
										>
											<Trash2 className="size-4" />
										</Button>
									</div>
								)}
							</li>
						))}
					</ul>
				</QueryContent>
			</Card>

			<FormDialog
				open={!!editing}
				onOpenChange={(value) => {
					if (!value) setEditing(null);
				}}
				title={editing === "new" ? "Nueva plantilla" : "Editar plantilla"}
				description="Los precios se copian a la cotización y ahí se pueden ajustar."
				className="sm:max-w-4xl"
			>
				{editing && (
					<TemplateForm
						workshopID={workshopID}
						template={editing === "new" ? undefined : editing}
						onClose={() => setEditing(null)}
					/>
				)}
			</FormDialog>

			<Dialog
				open={!!removing}
				onOpenChange={(value) => {
					if (!value) setRemoving(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>¿Eliminar «{removing?.name}»?</DialogTitle>
						<DialogDescription>
							Ya no aparecerá al cotizar. Las cotizaciones hechas con esta
							plantilla no cambian.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRemoving(null)}>
							Cancelar
						</Button>
						<Button
							variant="destructive"
							disabled={remove.isPending}
							onClick={() =>
								removing &&
								remove.mutate(removing.id, {
									onSuccess: () => {
										toast.success("Plantilla eliminada");
										setRemoving(null);
									},
								})
							}
						>
							Eliminar plantilla
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</PageBody>
	);
}

const templateSchema = z.object({
	name: requiredText("Ingresá un nombre").max(
		100,
		"Usá como máximo 100 caracteres",
	),
	items: quoteItemsSchema.max(100, "Una plantilla admite hasta 100 ítems"),
});

function TemplateForm({
	workshopID,
	template,
	onClose,
}: {
	workshopID: string;
	template?: QuoteTemplate;
	onClose: () => void;
}) {
	const form = useForm({
		resolver: zodResolver(templateSchema),
		defaultValues: {
			name: template?.name ?? "",
			items: template
				? template.items.map(quoteItemValues)
				: [blankQuoteItem("0")],
		},
	});
	const actions = quoteTemplateActions(workshopID);
	const save = useWorkshopMutation(
		workshopID,
		(body: z.infer<typeof templateSchema>) => {
			const payload = {
				name: body.name,
				items: body.items.map(quoteItemPayload),
			};
			return template
				? actions.update({ id: template.id, ...payload })
				: actions.create(payload);
		},
		{ inlineErrors: true },
	);
	return (
		<Form {...form}>
			<form
				className="space-y-4"
				noValidate
				onSubmit={form.handleSubmit(async (values) => {
					try {
						await save.mutateAsync(values);
						toast.success(
							template ? "Plantilla actualizada" : "Plantilla creada",
						);
						onClose();
					} catch (error) {
						applyFormError(form, error);
					}
				})}
			>
				<fieldset disabled={save.isPending} className="min-w-0 space-y-4">
					<TextField
						name="name"
						label="Nombre"
						placeholder="Ej. Servicio de 5,000 km"
						maxLength={100}
						autoFocus
					/>
					<QuoteItemsFields
						initialUnitPrice="0"
						workshopID={workshopID}
						templates={false}
					/>
					<RootError />
					<FormActions>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancelar
						</Button>
						<SubmitButton pending={save.isPending}>
							{template ? "Guardar cambios" : "Crear plantilla"}
						</SubmitButton>
					</FormActions>
				</fieldset>
			</form>
		</Form>
	);
}
