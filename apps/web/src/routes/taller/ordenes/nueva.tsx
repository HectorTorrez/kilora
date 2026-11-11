import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Lock, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormDialog } from "@/components/kilora/form-dialog";
import {
	applyFormError,
	FormError,
	NumberField,
	RootError,
	SelectField,
	TextareaField,
	TextField,
} from "@/components/kilora/form-fields";
import {
	kmField,
	optionalText,
	requiredText,
} from "@/components/kilora/form-schemas";
import { VehicleForm } from "@/components/kilora/vehicle-form";
import {
	BackLink,
	DetailList,
	PageBody,
	PageHeader,
	Plate,
	SectionCard,
	StepTitle,
} from "@/components/kilora/workshop-ui";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkshopMutation } from "@/features/taller/mutation";
import { createOrderAction } from "@/features/taller/orders";
import {
	useActiveBranch,
	useTallerContext,
	useWorkshopId,
} from "@/features/taller/session";
import { matchesVehicle, vehiclesQuery } from "@/features/taller/vehicles";
import { km as formatKm } from "@/lib/format";
import { cn } from "@/lib/utils";

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

const receptionSchema = z.object({
	branch: z.string().min(1, "Elegí una sucursal"),
	reason: requiredText("Ingresá el motivo de ingreso"),
	km: kmField(),
	notes: optionalText,
});

function NewOrderPage() {
	const workshopID = useWorkshopId();
	const { vehiculo } = Route.useSearch();
	const { me } = useTallerContext();
	const branches = me.memberships.filter((m) => m.workshop_id === workshopID);
	const activeBranch = useActiveBranch().id;
	const navigate = useNavigate();

	const [search, setSearch] = useState("");
	const [vehicle, setVehicle] = useState(vehiculo ?? "");
	const [creating, setCreating] = useState(false);
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(receptionSchema),
		defaultValues: {
			branch: activeBranch || (branches[0]?.branch_id ?? ""),
			reason: "",
			km: "",
			notes: "",
		},
	});
	const { branch: branchID, reason, km } = form.watch();
	const { data, isLoading, error } = useQuery({
		...vehiclesQuery(workshopID),
		enabled: !!workshopID,
	});
	const create = useWorkshopMutation(
		workshopID,
		createOrderAction(workshopID),
		{ inlineErrors: true },
	);
	const q = search.trim().toLowerCase().replace(/[\s-]/g, "");
	const all = data ?? [];
	const matches = all
		.filter((vehicle) => matchesVehicle(vehicle, q))
		.slice(0, 6);
	const chosen = all.find((v) => v.id === vehicle);
	const lastKm = chosen?.last_odometer_km;
	const kmBelow = km !== "" && lastKm != null && Number(km) < lastKm;
	const submit = form.handleSubmit(async (values) => {
		if (!chosen) {
			form.setError("root", { message: "Elegí un vehículo del taller" });
			return;
		}
		try {
			const order = await create.mutateAsync({
				vehicle_id: vehicle,
				branch_id: values.branch,
				reason: values.reason,
				odometer_km: values.km ? Number(values.km) : null,
				internal_notes: values.notes || null,
			});
			await navigate({
				to: "/taller/ordenes/$orderId",
				params: { orderId: order.id },
			});
		} catch (error) {
			applyFormError(form, error);
		}
	});

	return (
		<PageBody>
			<PageHeader
				back={<BackLink to="/taller/ordenes">Órdenes</BackLink>}
				title="Nueva orden"
				description="Elegí el vehículo y escribí el motivo de ingreso. Trabajos, piezas y cotización se agregan después, desde la orden."
			/>

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
				<div className="min-w-0 space-y-6">
					<SectionCard
						title={
							<StepTitle n={1} done={!!chosen}>
								Vehículo
							</StepTitle>
						}
						actions={
							!chosen && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => setCreating(true)}
								>
									<Plus className="size-4" />
									Registrar vehículo
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
										{chosen.customer?.full_name || "Sin cliente"} · último km{" "}
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
						) : (
							<div className="space-y-3">
								<SearchInput
									containerClassName=""
									autoFocus
									aria-label="Buscar vehículo"
									placeholder="Buscar por placa, marca o cliente"
									value={search}
									onChange={(e) => setSearch(e.target.value)}
								/>
								{error ? (
									<FormError error={error} />
								) : isLoading ? (
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
															{v.customer?.full_name || "Sin cliente"}
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

					<Form {...form}>
						<form id="new-order" onSubmit={submit} noValidate>
							<SectionCard
								title={
									<StepTitle n={2} done={!!reason}>
										Recepción
									</StepTitle>
								}
							>
								<div className="grid gap-5">
									<div className="grid gap-2">
										<TextField
											name="reason"
											label="Motivo de ingreso"
											required
											placeholder="¿Qué reporta el cliente?"
										/>
										<div className="flex flex-wrap gap-1.5">
											{reasons.map((r) => (
												<button
													key={r}
													type="button"
													onClick={() =>
														form.setValue("reason", r, { shouldValidate: true })
													}
													className={cn(
														"rounded-full border px-2.5 py-1 text-xs text-ink-2 hover:border-seal/40 hover:text-seal",
														reason === r &&
															"border-seal bg-seal-soft text-seal",
													)}
												>
													{r}
												</button>
											))}
										</div>
									</div>
									<div className="grid gap-5 sm:grid-cols-2">
										<NumberField
											name="km"
											label="Kilometraje actual"
											suffix="km"
											optional
											min="0"
											placeholder={
												lastKm != null ? String(lastKm) : "Ej. 85000"
											}
											description={
												lastKm != null ? (
													<span
														className={
															kmBelow ? "font-medium text-warn" : undefined
														}
													>
														{kmBelow
															? `Es menor que la última lectura (${formatKm(lastKm)}).`
															: `Última lectura: ${formatKm(lastKm)}`}
													</span>
												) : undefined
											}
										/>
										<SelectField
											name="branch"
											label="Sucursal"
											required
											options={branches.map((b) => ({
												value: b.branch_id,
												label: b.branch_name,
											}))}
										/>
									</div>
									<TextareaField
										name="notes"
										label={
											<span className="inline-flex items-center gap-1.5">
												<Lock
													className="size-3.5 text-ink-3"
													aria-hidden="true"
												/>
												Notas internas
											</span>
										}
										optional
										placeholder="Ej. El cliente pide que lo llamen antes de cambiar piezas"
										description="Solo las ve tu taller. Nunca se muestran al propietario ni a otros talleres."
									/>
									<RootError />
								</div>
							</SectionCard>
						</form>
					</Form>
				</div>

				<FormDialog
					open={creating}
					onOpenChange={setCreating}
					title="Registrar vehículo"
					description="Queda como provisional hasta que el propietario acepte la invitación. Cliente, marca y modelo son obligatorios."
				>
					<VehicleForm
						workshopID={workshopID}
						onCreated={(created) => {
							setVehicle(created.id);
							setCreating(false);
							setSearch("");
						}}
					/>
				</FormDialog>

				<aside className="lg:sticky lg:top-6">
					<SectionCard title="Resumen">
						<DetailList
							items={[
								{
									label: "Vehículo",
									value: chosen && <Plate value={chosen.plate} />,
									empty: "Sin elegir",
								},
								{ label: "Motivo", value: reason },
								{
									label: "Kilometraje",
									value: km && formatKm(km),
									mono: true,
								},
								{
									label: "Sucursal",
									value: branches.find((b) => b.branch_id === branchID)
										?.branch_name,
								},
							]}
						/>
						<Button
							type="submit"
							form="new-order"
							className="mt-5 w-full"
							disabled={!chosen || !reason || create.isPending}
						>
							{create.isPending ? "Registrando…" : "Registrar orden"}
						</Button>
						<p className="mt-2 text-center text-[11.5px] text-ink-3">
							La orden queda en estado Recibido.
						</p>
					</SectionCard>
				</aside>
			</div>
		</PageBody>
	);
}
