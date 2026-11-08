import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { date, day, km as formatKm, money, plural } from "@/lib/format";
import {
	ownerActions,
	ownerHistoryQuery,
	ownerVehicleQuery,
	useOwnerMutation,
} from "@/lib/owner";
import { Route as OwnerLayout } from "../mis-vehiculos";
export const Route = createFileRoute("/mis-vehiculos/$vehicleId")({
	loader: async ({ context, params }) => {
		const [history, vehicle] = await Promise.all([
			context.queryClient.ensureQueryData(ownerHistoryQuery(params.vehicleId)),
			context.queryClient.ensureQueryData(ownerVehicleQuery(params.vehicleId)),
		]);
		return { history, vehicle };
	},
	component: Page,
});
function Page() {
	const { vehicleId: id } = Route.useParams();
	const { me } = OwnerLayout.useRouteContext();
	const initial = Route.useLoaderData();
	const { data: h } = useQuery({
		...ownerHistoryQuery(id),
		initialData: initial.history,
	});
	const { data: v } = useQuery({
		...ownerVehicleQuery(id),
		initialData: initial.vehicle,
	});
	const [form, setForm] = useState<"manual" | "km" | string>("");
	const [warning, setWarning] = useState("");
	const [itemIds, setItemIds] = useState([0]);
	const [correctionItems, setCorrectionItems] = useState<
		{
			id: string;
			kind: "trabajo" | "pieza";
			description: string;
			price: string;
		}[]
	>([]);
	const [editItems, setEditItems] = useState(false);
	const manual = useOwnerMutation(
		(body: Parameters<typeof ownerActions.manual>[1]) =>
			ownerActions.manual(id, body),
	);
	const km = useOwnerMutation((n: number) => ownerActions.odometer(id, n));
	const correction = useOwnerMutation(
		(body: Parameters<typeof ownerActions.correction>[1]) =>
			ownerActions.correction(id, body),
	);
	if (!h || !v) return <main className="p-8">Cargando historial…</main>;
	return (
		<main className="mx-auto max-w-5xl space-y-6 px-5 py-8">
			<Link to="/mis-vehiculos" className="text-sm text-seal">
				← Mis vehículos
			</Link>
			<header className="rounded-xl bg-foreground p-6 text-background">
				<p className="font-mono text-sm">{v.plate || "Sin placa"}</p>
				<h1 className="mt-2 font-display text-3xl font-bold">
					{v.make} {v.model} {v.year}
				</h1>
				<p className="mt-2 opacity-70">
					{formatKm(v.last_odometer_km)} ·{" "}
					{plural(h.records.length, "registro", "registros")}
				</p>
			</header>
			<div className="flex flex-wrap gap-2">
				<Button onClick={() => setForm(form === "manual" ? "" : "manual")}>
					Agregar servicio
				</Button>
				<Button
					variant="outline"
					onClick={() => setForm(form === "km" ? "" : "km")}
				>
					Actualizar kilometraje
				</Button>
			</div>
			{form === "manual" && (
				<form
					className="grid gap-3 rounded-xl border p-5"
					onSubmit={async (e) => {
						e.preventDefault();
						const f = new FormData(e.currentTarget);
						try {
							await manual.mutateAsync({
								performed_on: String(f.get("date")),
								summary: String(f.get("summary")),
								...(f.get("km") ? { odometer_km: Number(f.get("km")) } : {}),
								...(f.get("total") ? { total: String(f.get("total")) } : {}),
								workshop_name_text: String(f.get("where") || ""),
								items: itemIds.flatMap((i) => {
									const description = String(f.get(`item-${i}`) || "").trim();
									const price = String(f.get(`price-${i}`) || "");
									return description
										? [
												{
													kind: "trabajo" as const,
													description,
													...(price ? { price } : {}),
												},
											]
										: [];
								}),
							});
							setForm("");
						} catch {}
					}}
				>
					<h2 className="font-bold">Agregar servicio</h2>
					<label htmlFor="service-date">
						Fecha
						<Input
							id="service-date"
							name="date"
							type="date"
							max={new Date().toLocaleDateString("en-CA")}
							required
						/>
					</label>
					<Input name="km" type="number" min="0" placeholder="Kilometraje" />
					<Input name="summary" placeholder="Resumen" required />
					{itemIds.map((i) => (
						<div className="grid gap-2 sm:grid-cols-2" key={i}>
							<Input
								name={`item-${i}`}
								placeholder="Trabajo o pieza (opcional)"
							/>
							<Input
								name={`price-${i}`}
								type="number"
								min="0"
								step="0.01"
								placeholder="Precio del ítem"
							/>
						</div>
					))}
					<Button
						type="button"
						variant="outline"
						onClick={() => setItemIds([...itemIds, Math.max(...itemIds) + 1])}
					>
						Agregar otro ítem
					</Button>
					<Input
						name="total"
						type="number"
						min="0"
						step="0.01"
						placeholder="Total"
					/>
					<Input name="where" placeholder="Dónde se hizo" />
					<Button disabled={manual.isPending}>Guardar servicio</Button>
					{manual.error && <p role="alert">{manual.error.message}</p>}
				</form>
			)}
			{form === "km" && (
				<form
					className="flex flex-wrap gap-3 rounded-xl border p-5"
					onSubmit={async (e) => {
						e.preventDefault();
						const f = new FormData(e.currentTarget);
						try {
							const result = await km.mutateAsync(Number(f.get("km")));
							setWarning(result.warning || "Kilometraje actualizado.");
							setForm("");
						} catch {}
					}}
				>
					<Input
						name="km"
						type="number"
						min="0"
						placeholder="Kilometraje actual"
						required
					/>
					<Button>Guardar</Button>
					{km.error && <p role="alert">{km.error.message}</p>}
				</form>
			)}
			{warning && (
				<output className="block rounded-lg bg-secondary p-3">{warning}</output>
			)}
			<div className="grid gap-6 md:grid-cols-[1fr_260px]">
				<section>
					<h2 className="mb-4 font-display text-2xl font-bold">
						Historial de servicios
					</h2>
					<div className="space-y-4">
						{h.records.length === 0 && (
							<p className="text-ink-3">Aún no hay servicios registrados.</p>
						)}
						{h.records.map((r) => (
							<article key={r.id} className="rounded-xl border bg-card p-5">
								<p className="text-sm text-ink-3">
									{day(r.performed_on)} · {formatKm(r.odometer_km)}
								</p>
								<h3 className="mt-2 font-display text-lg font-bold">
									{r.summary}
								</h3>
								<p className="text-sm text-seal">
									{r.workshop_name ||
										(r.source === "propietario"
											? "Registro personal"
											: "Taller")}
									{r.workshop_verified_at && (
										<span className="ml-2 text-sm text-seal">✓ Verificado</span>
									)}
								</p>
								<ul className="mt-3 space-y-1">
									{r.items.map((item) => (
										<li
											key={JSON.stringify(item)}
											className="flex justify-between gap-4 text-sm"
										>
											<span>{item.description}</span>
											<span>{item.price && money(item.price)}</span>
										</li>
									))}
								</ul>
								{r.total && (
									<p className="mt-3 font-semibold">Total: {money(r.total)}</p>
								)}
								{r.workshop_notes && (
									<p className="mt-3 text-sm">
										Notas del taller: {r.workshop_notes}
									</p>
								)}
								{r.corrections?.map((c) => (
									<p
										key={c.id}
										className="mt-3 rounded bg-secondary p-2 text-sm"
									>
										Corrección del {day(c.created_at)}: {c.reason} ·{" "}
										{Object.entries(c.changes)
											.map(
												([k, v]) =>
													`${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`,
											)
											.join(", ")}
									</p>
								))}
								{r.source === "propietario" && r.created_by === me.user.id && (
									<Button
										variant="outline"
										size="sm"
										className="mt-4"
										onClick={() => {
											setCorrectionItems(
												r.items.map((item) => ({
													id: crypto.randomUUID(),
													kind: item.kind === "pieza" ? "pieza" : "trabajo",
													description: item.description,
													price: item.price ?? "",
												})),
											);
											setEditItems(false);
											setForm(r.id);
										}}
									>
										Corregir
									</Button>
								)}
								<Dialog
									open={form === r.id}
									onOpenChange={(open) => {
										if (!open) setForm("");
									}}
								>
									<DialogContent>
										<DialogTitle>Corregir servicio</DialogTitle>
										<form
											className="mt-3 grid gap-2"
											onSubmit={async (e) => {
												e.preventDefault();
												const f = new FormData(e.currentTarget);
												try {
													await correction.mutateAsync({
														history_record_id: r.id,
														reason: String(f.get("reason")),
														changes: {
															...(editItems
																? {
																		items: correctionItems.map(
																			({ kind, description, price }) => ({
																				kind,
																				description: description.trim(),
																				...(price ? { price } : {}),
																			}),
																		),
																	}
																: {}),
															...(f.get("summary")
																? { summary: String(f.get("summary")) }
																: {}),
															...(f.get("date")
																? { performed_on: String(f.get("date")) }
																: {}),
															...(f.get("km")
																? { odometer_km: Number(f.get("km")) }
																: {}),
														},
													});
													setForm("");
												} catch {}
											}}
										>
											<Input
												name="reason"
												placeholder="Motivo de la corrección"
												required
											/>
											<Input name="summary" placeholder="Nuevo resumen" />
											<Input
												name="date"
												type="date"
												max={new Date().toLocaleDateString("en-CA")}
											/>
											<Input
												name="km"
												type="number"
												min="0"
												placeholder="Nuevo kilometraje"
											/>
											<label className="flex items-center gap-2 text-sm">
												<input
													type="checkbox"
													checked={editItems}
													onChange={(e) => setEditItems(e.target.checked)}
												/>{" "}
												Corregir ítems
											</label>
											{editItems && (
												<div className="grid gap-2">
													{correctionItems.map((item, index) => (
														<div className="flex gap-2" key={item.id}>
															<Input
																aria-label="Descripción del ítem"
																value={item.description}
																required
																onChange={(e) =>
																	setCorrectionItems(
																		correctionItems.map((v, i) =>
																			i === index
																				? { ...v, description: e.target.value }
																				: v,
																		),
																	)
																}
															/>
															<Input
																aria-label="Precio del ítem"
																type="number"
																min="0"
																step="0.01"
																placeholder="Precio"
																value={item.price}
																onChange={(e) =>
																	setCorrectionItems(
																		correctionItems.map((v, i) =>
																			i === index
																				? { ...v, price: e.target.value }
																				: v,
																		),
																	)
																}
															/>
															<Button
																type="button"
																variant="outline"
																onClick={() =>
																	setCorrectionItems(
																		correctionItems.filter(
																			(_, i) => i !== index,
																		),
																	)
																}
															>
																Quitar
															</Button>
														</div>
													))}
													<Button
														type="button"
														variant="outline"
														onClick={() =>
															setCorrectionItems([
																...correctionItems,
																{
																	id: crypto.randomUUID(),
																	kind: "trabajo",
																	description: "",
																	price: "",
																},
															])
														}
													>
														Agregar ítem
													</Button>
												</div>
											)}
											<Button>Guardar corrección</Button>
											{correction.error && (
												<p role="alert">{correction.error.message}</p>
											)}
										</form>
									</DialogContent>
								</Dialog>
							</article>
						))}
					</div>
				</section>
				<aside className="space-y-5">
					<section className="rounded-xl border p-5">
						<h2 className="font-bold">Talleres vinculados</h2>
						{(v.workshops || []).length ? (
							v.workshops?.map((w) => (
								<p className="mt-2 text-sm" key={JSON.stringify(w)}>
									{w.name}
								</p>
							))
						) : (
							<p className="mt-2 text-sm text-ink-3">Sin talleres vinculados</p>
						)}
					</section>
					<section className="rounded-xl border p-5">
						<h2 className="font-bold">Lecturas de kilometraje</h2>
						{(v.odometer_readings || []).length ? (
							v.odometer_readings?.map((o) => (
								<p className="mt-2 text-sm" key={JSON.stringify(o)}>
									{formatKm(o.km)} · {date(o.read_at)}
								</p>
							))
						) : (
							<p className="mt-2 text-sm text-ink-3">Sin lecturas</p>
						)}
					</section>
				</aside>
			</div>
		</main>
	);
}
