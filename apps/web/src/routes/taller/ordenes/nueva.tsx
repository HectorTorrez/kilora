import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useWorkshopId } from "@/components/kilora/app-shell";
import {
	applyFormError,
	FormActions,
	NumberField,
	RequiredLegend,
	RootError,
	SelectField,
	SubmitButton,
	TextareaField,
	TextField,
} from "@/components/kilora/form-fields";
import {
	kmField,
	optionalText,
	requiredText,
} from "@/components/kilora/form-schemas";
import { VehicleForm } from "@/components/kilora/vehicle-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actions, useWorkshopMutation, vehiclesQuery } from "@/lib/workshop";
import { Route as TallerRoute } from "@/routes/taller";

export const Route = createFileRoute("/taller/ordenes/nueva")({
	component: NewOrderPage,
});

const schema = z.object({
	branch_id: z.string().min(1, "Elegí una sucursal"),
	reason: requiredText("Ingresá el motivo"),
	km: kmField(false),
	notes: optionalText,
});

type Picked = {
	id: string;
	plate: string | null;
	make: string;
	model: string;
	year: number | null;
};

function NewOrderPage() {
	const workshopID = useWorkshopId();
	const { me } = TallerRoute.useRouteContext();
	const branches = me.memberships.filter((m) => m.workshop_id === workshopID);
	const navigate = useNavigate();
	const searchId = useId();
	const hintId = useId();
	const [search, setSearch] = useState("");
	const [picked, setPicked] = useState<Picked | null>(null);
	const [creating, setCreating] = useState(false);
	const { data, isLoading } = useQuery(vehiclesQuery(workshopID, search));
	const create = useWorkshopMutation(
		workshopID,
		actions(workshopID).createOrder,
	);
	const form = useForm({
		resolver: zodResolver(schema),
		defaultValues: {
			branch_id: branches[0]?.branch_id ?? "",
			reason: "",
			km: "",
			notes: "",
		},
	});
	const submit = form.handleSubmit(async (values) => {
		if (!picked) return;
		const branch_id = values.branch_id || branches[0]?.branch_id;
		if (!branch_id) {
			form.setError("root", {
				message: "No hay una sucursal disponible para registrar la orden.",
			});
			return;
		}
		form.clearErrors("root");
		try {
			const order = await create.mutateAsync({
				vehicle_id: picked.id,
				branch_id,
				reason: values.reason,
				odometer_km: values.km ? Number(values.km) : null,
				internal_notes: values.notes || null,
			});
			toast.success("Orden registrada");
			await navigate({
				to: "/taller/ordenes/$orderId",
				params: { orderId: order.id },
			});
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<main className="mx-auto max-w-4xl space-y-5 px-5 py-7">
			<h1 className="font-display text-3xl font-bold">Registrar orden</h1>
			<Card className="gap-0 space-y-4 rounded-lg p-5 shadow-none">
				<StepTitle n="1">Vehículo</StepTitle>
				{picked ? (
					<div className="flex flex-col gap-3 rounded-lg border border-seal bg-seal-soft px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<p className="font-mono text-sm font-medium text-seal">
								{picked.plate || "Sin placa"}
							</p>
							<p className="mt-1 font-display text-lg font-bold">
								{picked.make} {picked.model}
								{picked.year ? ` ${picked.year}` : ""}
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							className="w-full sm:w-auto"
							onClick={() => setPicked(null)}
						>
							Cambiar
						</Button>
					</div>
				) : (
					<div className="grid gap-4">
						<div className="grid gap-2">
							<Label htmlFor={searchId}>Buscar por placa</Label>
							<div className="relative">
								<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
								<Input
									id={searchId}
									value={search}
									autoFocus
									autoComplete="off"
									placeholder="Ej. P123456"
									className="pl-9"
									onChange={(event) => setSearch(event.target.value)}
								/>
							</div>
						</div>
						{isLoading ? (
							<p className="text-sm text-ink-3">Buscando vehículos…</p>
						) : data && data.length > 0 ? (
							<ul
								aria-label="Vehículos"
								className="grid max-h-80 gap-2 overflow-y-auto"
							>
								{data.map((vehicle) => (
									<li key={vehicle.id}>
										<button
											type="button"
											className="w-full rounded-lg border bg-background px-4 py-3 text-left transition-colors hover:border-seal hover:bg-seal-soft focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
											onClick={() => {
												setPicked(vehicle);
												setCreating(false);
											}}
										>
											<span className="font-mono text-sm font-medium">
												{vehicle.plate || "Sin placa"}
											</span>
											<span className="text-ink-3">
												{" "}
												· {vehicle.make} {vehicle.model}
												{vehicle.year ? ` ${vehicle.year}` : ""}
											</span>
										</button>
									</li>
								))}
							</ul>
						) : (
							<div className="rounded-lg border border-dashed px-4 py-8 text-center">
								<p className="font-medium">
									{search.trim()
										? "Ningún vehículo coincide con esa placa"
										: "Todavía no hay vehículos en el taller"}
								</p>
								<p className="mt-1 text-sm text-ink-3">
									Registrá uno provisional para abrir la orden.
								</p>
							</div>
						)}
						{creating ? (
							<div className="rounded-lg border bg-muted/40 p-4">
								<p className="mb-4 text-sm text-ink-3">
									El vehículo queda provisional. El propietario puede vincularlo
									después.
								</p>
								<VehicleForm
									workshopID={workshopID}
									onCancel={() => setCreating(false)}
									onCreated={(vehicle) => {
										setPicked(vehicle);
										setCreating(false);
										setSearch("");
									}}
								/>
							</div>
						) : (
							<Button
								type="button"
								variant="outline"
								className="w-full sm:w-auto"
								onClick={() => setCreating(true)}
							>
								Registrar vehículo provisional
							</Button>
						)}
					</div>
				)}
			</Card>
			<Card className="gap-0 rounded-lg p-5 shadow-none">
				<Form {...form}>
					<form onSubmit={submit} className="grid gap-5" noValidate>
						<StepTitle n="2">Detalles de la orden</StepTitle>
						<RequiredLegend />
						{branches.length > 1 ? (
							<SelectField
								name="branch_id"
								label="Sucursal"
								placeholder="Elegí una sucursal"
								options={branches.map((branch) => ({
									value: branch.branch_id,
									label: branch.branch_name,
								}))}
								required
							/>
						) : branches.length === 1 ? (
							<p className="text-sm text-ink-3">
								Sucursal:{" "}
								<span className="font-medium text-foreground">
									{branches[0]?.branch_name}
								</span>
							</p>
						) : (
							<p className="text-sm text-destructive">
								No hay una sucursal disponible para registrar la orden.
							</p>
						)}
						<TextField
							name="reason"
							label="Motivo"
							placeholder="Ej. Cambio de aceite"
							required
						/>
						<NumberField
							name="km"
							label="Kilometraje"
							optional
							suffix="km"
							min={0}
							step={1}
							className="sm:max-w-xs"
						/>
						<TextareaField
							name="notes"
							label="Notas internas"
							optional
							description="Privadas del taller"
							placeholder="Ej. El cliente pidió revisar una fuga"
						/>
						<RootError />
						{!picked && (
							<p id={hintId} className="text-sm text-ink-3">
								Elegí un vehículo para registrar la orden.
							</p>
						)}
						<FormActions>
							<SubmitButton
								pending={create.isPending}
								disabled={!picked || branches.length === 0}
								aria-describedby={!picked ? hintId : undefined}
							>
								Registrar orden
							</SubmitButton>
						</FormActions>
					</form>
				</Form>
			</Card>
		</main>
	);
}

function StepTitle({ n, children }: { n: string; children: string }) {
	return (
		<h2 className="flex items-center gap-3 font-display text-lg font-bold">
			<span className="flex size-7 items-center justify-center rounded-full bg-foreground font-mono text-xs text-background">
				{n}
			</span>
			{children}
		</h2>
	);
}
