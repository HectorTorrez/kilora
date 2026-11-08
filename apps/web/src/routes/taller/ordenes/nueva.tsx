import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Lock, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { useWorkshopId } from "@/components/kilora/app-shell";
import { VehicleForm } from "@/components/kilora/vehicle-form";
import {
	PageBody,
	PageHeader,
	Plate,
	SectionCard,
} from "@/components/kilora/workshop-ui";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { km as formatKm } from "@/lib/format";
import { cn } from "@/lib/utils";
import { actions, useWorkshopMutation, vehiclesQuery } from "@/lib/workshop";
import { Route as TallerRoute } from "@/routes/taller";

export const Route = createFileRoute("/taller/ordenes/nueva")({
	validateSearch: (search: Record<string, unknown>): { vehiculo?: string } => ({
		vehiculo: typeof search.vehiculo === "string" ? search.vehiculo : undefined,
	}),
	component: NewOrderPage,
});

const reasons = [
	"Cambio de aceite y filtro",
	"Revisión de frenos",
	"Mantenimiento preventivo",
	"Ruido en suspensión",
	"Revisión de batería",
	"Diagnóstico general",
];

function NewOrderPage() {
	const workshopID = useWorkshopId();
	const { vehiculo } = Route.useSearch();
	const { me } = TallerRoute.useRouteContext();
	const branches = me.memberships.filter((m) => m.workshop_id === workshopID);
	const navigate = useNavigate();
	const [branch, setBranch] = useState("");
	const [search, setSearch] = useState("");
	const [vehicle, setVehicle] = useState(vehiculo ?? "");
	const [creating, setCreating] = useState(false);
	const [reason, setReason] = useState("");
	const [km, setKm] = useState("");
	const [notes, setNotes] = useState("");
	const { data, isLoading } = useQuery({
		...vehiclesQuery(workshopID),
		enabled: !!workshopID,
	});
	const create = useWorkshopMutation(
		workshopID,
		actions(workshopID).createOrder,
	);
	const q = search.trim().toLowerCase().replace(/[\s-]/g, "");
	const all = data ?? [];
	const matches = (
		q
			? all.filter((v) =>
					[v.plate, v.make, v.model, v.contact_name]
						.filter(Boolean)
						.some((x) =>
							String(x).toLowerCase().replace(/[\s-]/g, "").includes(q),
						),
				)
			: all
	).slice(0, 6);
	const chosen = all.find((v) => v.id === vehicle);
	const lastKm = chosen?.last_odometer_km;
	const kmBelow = km !== "" && lastKm != null && Number(km) < lastKm;
	const branchID = branch || branches[0]?.branch_id || "";

	return (
		<PageBody className="max-w-5xl">
			<div>
				<Link
					to="/taller/ordenes"
					className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-foreground"
				>
					<ArrowLeft className="size-3.5" />
					Órdenes
				</Link>
				<PageHeader
					className="mt-3"
					title="Nueva orden"
					description="Elegí el vehículo, escribí el motivo y listo. Trabajos, piezas y cotización se agregan después."
				/>
			</div>

			<form
				className="grid items-start gap-6 lg:grid-cols-[1fr_300px]"
				onSubmit={async (e) => {
					e.preventDefault();
					try {
						const order = await create.mutateAsync({
							vehicle_id: vehicle,
							branch_id: branchID,
							reason,
							odometer_km: km ? Number(km) : null,
							internal_notes: notes || null,
						});
						await navigate({
							to: "/taller/ordenes/$orderId",
							params: { orderId: order.id },
						});
					} catch {}
				}}
			>
				<div className="space-y-6">
					<SectionCard
						title={
							<span className="flex items-center gap-2">
								<Step n={1} done={!!chosen} />
								Vehículo
							</span>
						}
						actions={
							!chosen && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => setCreating(!creating)}
								>
									{creating ? (
										<>
											<X className="size-4" /> Cancelar
										</>
									) : (
										<>
											<Plus className="size-4" /> Vehículo nuevo
										</>
									)}
								</Button>
							)
						}
					>
						{chosen ? (
							<div className="flex items-center gap-3 rounded-md border border-seal/30 bg-seal-soft/50 p-3">
								<Plate value={chosen.plate} />
								<div className="min-w-0 flex-1">
									<p className="truncate text-[13.5px] font-semibold">
										{chosen.make} {chosen.model} {chosen.year ?? ""}
									</p>
									<p className="truncate text-xs text-ink-3">
										{chosen.contact_name || "Sin contacto"} · último km{" "}
										{formatKm(chosen.last_odometer_km)}
									</p>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => setVehicle("")}
								>
									Cambiar
								</Button>
							</div>
						) : creating ? (
							<VehicleForm
								workshopID={workshopID}
								onCreated={(created) => {
									setVehicle(created.id);
									setCreating(false);
									setSearch("");
								}}
							/>
						) : (
							<div className="space-y-3">
								<div className="relative">
									<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
									<Input
										autoFocus
										aria-label="Buscar vehículo"
										placeholder="Buscar por placa, marca o contacto"
										value={search}
										onChange={(e) => setSearch(e.target.value)}
										className="pl-9"
									/>
								</div>
								{isLoading ? (
									<Skeleton className="h-24" />
								) : matches.length ? (
									<ul className="grid gap-2 sm:grid-cols-2">
										{matches.map((v) => (
											<li key={v.id}>
												<button
													type="button"
													onClick={() => setVehicle(v.id)}
													className="pressable flex w-full items-center gap-3 rounded-md border bg-background/50 p-2.5 text-left hover:border-seal/40 hover:bg-seal-soft/40"
												>
													<Plate value={v.plate} />
													<span className="min-w-0 flex-1">
														<span className="block truncate text-[13px] font-medium">
															{v.make} {v.model}
														</span>
														<span className="block truncate text-xs text-ink-3">
															{v.contact_name || "Sin contacto"}
														</span>
													</span>
												</button>
											</li>
										))}
									</ul>
								) : (
									<div className="rounded-md border border-dashed p-5 text-center text-sm text-ink-3">
										No encontramos ese vehículo.{" "}
										<button
											type="button"
											className="font-semibold text-seal hover:underline"
											onClick={() => setCreating(true)}
										>
											Registrarlo ahora
										</button>
									</div>
								)}
							</div>
						)}
					</SectionCard>

					<SectionCard
						title={
							<span className="flex items-center gap-2">
								<Step n={2} done={!!reason} />
								Recepción
							</span>
						}
					>
						<div className="grid gap-4">
							<div className="grid gap-2">
								<Label htmlFor="reason">Motivo de ingreso</Label>
								<Input
									id="reason"
									required
									placeholder="¿Qué reporta el cliente?"
									value={reason}
									onChange={(e) => setReason(e.target.value)}
								/>
								<div className="flex flex-wrap gap-1.5">
									{reasons.map((r) => (
										<button
											key={r}
											type="button"
											onClick={() => setReason(r)}
											className={cn(
												"rounded-full border px-2.5 py-1 text-xs text-ink-2 hover:border-seal/40 hover:text-seal",
												reason === r && "border-seal bg-seal-soft text-seal",
											)}
										>
											{r}
										</button>
									))}
								</div>
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="grid gap-2">
									<Label htmlFor="km">Kilometraje actual</Label>
									<Input
										id="km"
										type="number"
										inputMode="numeric"
										min="0"
										placeholder={lastKm != null ? String(lastKm) : "Ej. 85000"}
										value={km}
										onChange={(e) => setKm(e.target.value)}
										aria-describedby="km-hint"
									/>
									<p
										id="km-hint"
										className={cn(
											"text-xs text-ink-3",
											kmBelow && "font-medium text-warn",
										)}
									>
										{kmBelow
											? `Es menor que la última lectura (${formatKm(lastKm)}).`
											: lastKm != null
												? `Última lectura: ${formatKm(lastKm)}`
												: "Opcional"}
									</p>
								</div>
								<div className="grid content-start gap-2">
									<Label htmlFor="branch">Sucursal</Label>
									<Select value={branchID} onValueChange={setBranch} required>
										<SelectTrigger id="branch" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{branches.map((b) => (
												<SelectItem key={b.branch_id} value={b.branch_id}>
													{b.branch_name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="notes" className="flex items-center gap-1.5">
									<Lock className="size-3.5 text-ink-3" />
									Notas internas
									<span className="font-normal text-ink-3">
										· privadas del taller
									</span>
								</Label>
								<Textarea
									id="notes"
									placeholder="Nunca se muestran al propietario ni a otros talleres"
									value={notes}
									onChange={(e) => setNotes(e.target.value)}
								/>
							</div>
						</div>
					</SectionCard>
				</div>

				<aside className="space-y-3 lg:sticky lg:top-6">
					<SectionCard title="Resumen">
						<dl className="space-y-2.5 text-[13px]">
							<div className="flex justify-between gap-3">
								<dt className="text-ink-3">Vehículo</dt>
								<dd className="text-right font-medium">
									{chosen ? (
										<Plate value={chosen.plate} />
									) : (
										<span className="text-ink-3">Sin elegir</span>
									)}
								</dd>
							</div>
							<div className="flex justify-between gap-3">
								<dt className="text-ink-3">Motivo</dt>
								<dd className="truncate text-right font-medium">
									{reason || <span className="text-ink-3">—</span>}
								</dd>
							</div>
							<div className="flex justify-between gap-3">
								<dt className="text-ink-3">Kilometraje</dt>
								<dd className="text-right font-mono">
									{km ? formatKm(km) : "—"}
								</dd>
							</div>
							<div className="flex justify-between gap-3">
								<dt className="text-ink-3">Sucursal</dt>
								<dd className="truncate text-right">
									{branches.find((b) => b.branch_id === branchID)?.branch_name}
								</dd>
							</div>
						</dl>
						<Button
							className="mt-5 w-full"
							disabled={!vehicle || !reason || create.isPending}
						>
							{create.isPending ? "Registrando…" : "Registrar orden"}
						</Button>
						<p className="mt-2 text-center text-[11.5px] text-ink-3">
							La orden queda en estado Recibido.
						</p>
					</SectionCard>
				</aside>
			</form>
		</PageBody>
	);
}

function Step({ n, done }: { n: number; done: boolean }) {
	return (
		<span
			className={cn(
				"grid size-5 place-items-center rounded-full font-mono text-[11px] font-semibold",
				done ? "bg-seal text-white" : "bg-secondary text-ink-2",
			)}
		>
			{done ? <Check className="size-3" /> : n}
		</span>
	);
}
