import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { Check, Lightbulb, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/kilora/workshop-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useWorkshopMutation } from "@/features/taller/mutation";
import {
	adminActions,
	vehicleRecommendationsQuery,
} from "@/features/taller/team";
import { categoryLabels } from "@/lib/domain";
import { day, km, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

type Rec = components["schemas"]["Recommendation"];
export type Urgency = "vencida" | "proxima" | "programada";

export function urgency(rec: Rec, currentKm?: number | null): Urgency {
	const today = todayISO();
	const soon = new Date(`${today}T00:00:00Z`);
	soon.setUTCDate(soon.getUTCDate() + 30);
	const soonISO = soon.toISOString().slice(0, 10);
	const kmKnown = currentKm != null && rec.due_km != null;
	if (
		(rec.due_date && rec.due_date < today) ||
		(kmKnown && (currentKm as number) >= (rec.due_km as number))
	)
		return "vencida";
	if (
		(rec.due_date && rec.due_date <= soonISO) ||
		(kmKnown && (rec.due_km as number) - (currentKm as number) <= 1000)
	)
		return "proxima";
	return "programada";
}

const urgencyStyle: Record<Urgency, string> = {
	vencida: "bg-destructive/10 text-destructive",
	proxima: "bg-warn-soft text-warn",
	programada: "bg-secondary text-ink-2",
};
const urgencyLabel: Record<Urgency, string> = {
	vencida: "Vencida",
	proxima: "Próxima",
	programada: "Programada",
};

export function UrgencyBadge({ value }: { value: Urgency }) {
	return (
		<span
			className={cn(
				"rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
				urgencyStyle[value],
			)}
		>
			{urgencyLabel[value]}
		</span>
	);
}

export const dueText = (rec: Rec) =>
	[rec.due_date && day(rec.due_date), rec.due_km != null && km(rec.due_km)]
		.filter(Boolean)
		.join(" o ");

export function RecommendationsCard({
	workshopID,
	vehicleID,
	workOrderID,
	currentKm,
}: {
	workshopID: string;
	vehicleID: string;
	workOrderID?: string;
	currentKm?: number | null;
}) {
	const { data = [], isLoading } = useQuery(
		vehicleRecommendationsQuery(workshopID, vehicleID),
	);
	const a = adminActions(workshopID);
	const create = useWorkshopMutation(workshopID, a.recommend);
	const resolve = useWorkshopMutation(workshopID, a.resolve);
	const [open, setOpen] = useState(false);
	const [description, setDescription] = useState("");
	const [category, setCategory] = useState("none");
	const [dueDate, setDueDate] = useState("");
	const [dueKm, setDueKm] = useState("");
	const pending = data.filter((r) => r.status === "pendiente");
	const resolved = data.filter((r) => r.status !== "pendiente").slice(0, 3);

	return (
		<SectionCard
			title="Recomendaciones"
			description="Trabajos sugeridos con fecha o kilometraje objetivo"
			actions={
				!open && (
					<Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
						<Plus className="size-4" />
						Agregar
					</Button>
				)
			}
			bodyClassName="p-0 sm:p-0"
		>
			{open && (
				<form
					className="grid gap-3 border-b bg-secondary/30 p-4 sm:p-5"
					onSubmit={(e) => {
						e.preventDefault();
						create.mutate(
							{
								vehicleID,
								body: {
									description,
									category:
										category === "none"
											? null
											: (category as components["schemas"]["PartCategory"]),
									due_date: dueDate || null,
									due_km: dueKm ? Number(dueKm) : null,
									work_order_id: workOrderID ?? null,
								},
							},
							{
								onSuccess: () => {
									toast.success("Recomendación registrada");
									setDescription("");
									setCategory("none");
									setDueDate("");
									setDueKm("");
									setOpen(false);
								},
							},
						);
					}}
				>
					<Label className="grid gap-1.5" htmlFor="rec-description">
						Qué recomendás
						<Input
							id="rec-description"
							autoFocus
							required
							placeholder="Ej. Cambiar pastillas de freno delanteras"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							className="bg-card"
						/>
					</Label>
					<div className="grid grid-cols-2 gap-3">
						<Label className="grid gap-1.5" htmlFor="rec-date">
							Para la fecha
							<Input
								id="rec-date"
								type="date"
								value={dueDate}
								onChange={(e) => setDueDate(e.target.value)}
								className="bg-card"
							/>
						</Label>
						<Label className="grid gap-1.5" htmlFor="rec-km">
							O a los km
							<Input
								id="rec-km"
								type="number"
								min="0"
								placeholder={
									currentKm != null ? String(currentKm + 5000) : "Ej. 90000"
								}
								value={dueKm}
								onChange={(e) => setDueKm(e.target.value)}
								className="bg-card"
							/>
						</Label>
					</div>
					<Select value={category} onValueChange={setCategory}>
						<SelectTrigger aria-label="Categoría" className="w-full bg-card">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">Sin categoría</SelectItem>
							{Object.entries(categoryLabels).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<div className="flex gap-2">
						<Button
							disabled={
								create.isPending || !description.trim() || (!dueDate && !dueKm)
							}
						>
							Guardar
						</Button>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							Cancelar
						</Button>
					</div>
					{!dueDate && !dueKm && (
						<p className="-mt-1 text-xs text-ink-3">
							Indicá una fecha, un kilometraje o ambos.
						</p>
					)}
				</form>
			)}
			{isLoading ? null : !pending.length && !resolved.length ? (
				<div className="flex flex-col items-center px-6 py-8 text-center">
					<Lightbulb className="size-5 text-ink-3" />
					<p className="mt-2 text-sm text-ink-3">
						Sin recomendaciones pendientes.
					</p>
				</div>
			) : (
				<ul className="divide-y">
					{pending.map((r) => (
						<li key={r.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
							<div className="min-w-0 flex-1">
								<p className="text-[13px] font-medium">{r.description}</p>
								<p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
									<UrgencyBadge value={urgency(r, currentKm)} />
									<span className="font-mono">{dueText(r)}</span>
									{r.category && <span>· {categoryLabels[r.category]}</span>}
								</p>
							</div>
							<div className="flex shrink-0 gap-1">
								<Button
									variant="ghost"
									size="icon"
									className="size-8 text-ok hover:bg-ok-soft hover:text-ok"
									aria-label={`Marcar como hecha: ${r.description}`}
									title="Marcar como hecha"
									disabled={resolve.isPending}
									onClick={() => resolve.mutate({ id: r.id, status: "hecha" })}
								>
									<Check className="size-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="size-8 text-ink-3"
									aria-label={`Descartar: ${r.description}`}
									title="Descartar"
									disabled={resolve.isPending}
									onClick={() =>
										resolve.mutate({ id: r.id, status: "descartada" })
									}
								>
									<X className="size-4" />
								</Button>
							</div>
						</li>
					))}
					{resolved.map((r) => (
						<li
							key={r.id}
							className="flex items-center gap-3 px-4 py-2.5 text-xs text-ink-3 sm:px-5"
						>
							<span className="min-w-0 flex-1 truncate line-through">
								{r.description}
							</span>
							<span>{r.status === "hecha" ? "Hecha" : "Descartada"}</span>
						</li>
					))}
				</ul>
			)}
		</SectionCard>
	);
}
