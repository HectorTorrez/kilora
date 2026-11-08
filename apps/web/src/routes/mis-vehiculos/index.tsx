import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	Car,
	ChevronRight,
	Gauge,
	History,
	type LucideIcon,
	Plus,
	Store,
	Wrench,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
	applyFormError,
	FormActions,
	NumberField,
	RequiredLegend,
	RootError,
	SubmitButton,
	TextField,
} from "@/components/kilora/form-fields";
import {
	optionalText,
	requiredText,
	yearBounds,
	yearField,
} from "@/components/kilora/form-schemas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { day, km, plural } from "@/lib/format";
import {
	ownerActions,
	ownerVehiclesQuery,
	useOwnerMutation,
} from "@/lib/owner";
import { cn } from "@/lib/utils";
import { Route as OwnerRoute } from "../mis-vehiculos";

type OwnerVehicle = components["schemas"]["OwnerVehicle"];

export const Route = createFileRoute("/mis-vehiculos/")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(ownerVehiclesQuery()),
	component: Page,
});

function Page() {
	const { me } = OwnerRoute.useRouteContext();
	const initial = Route.useLoaderData();
	const { data, error, isFetching, isPending } = useQuery({
		...ownerVehiclesQuery(),
		initialData: initial,
	});
	const vehicles = data ?? [];
	const pending = data == null && (isPending || isFetching);
	const [open, setOpen] = useState(false);
	const create = useOwnerMutation(ownerActions.create);
	const navigate = useNavigate();
	const bounds = yearBounds();
	const form = useForm({
		resolver: zodResolver(
			z.object({
				make: requiredText("Ingresá la marca"),
				model: requiredText("Ingresá el modelo"),
				year: yearField(false),
				plate: optionalText,
			}),
		),
		defaultValues: { make: "", model: "", year: "", plate: "" },
	});
	const onDialogChange = (next: boolean) => {
		setOpen(next);
		if (!next) form.reset();
	};
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			const vehicle = await create.mutateAsync({
				plate: values.plate.toUpperCase(),
				make: values.make,
				model: values.model,
				...(values.year ? { year: Number(values.year) } : {}),
			});
			toast.success("Vehículo guardado");
			onDialogChange(false);
			if (vehicle.id)
				await navigate({
					to: "/mis-vehiculos/$vehicleId",
					params: { vehicleId: vehicle.id },
				});
		} catch (error) {
			applyFormError(form, error, { toast: true });
		}
	});
	return (
		<main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div className="space-y-2">
					<p className="font-mono text-[11px] tracking-[0.14em] text-ink-3 uppercase">
						Tu historial, siempre a mano
					</p>
					<div className="flex flex-wrap items-center gap-2.5">
						<h1 className="font-display text-3xl font-bold tracking-tight">
							Mis vehículos
						</h1>
						{pending ? (
							<Skeleton className="h-5 w-24 rounded-full" />
						) : (
							<Badge variant="secondary">
								{plural(vehicles.length, "vehículo", "vehículos")}
							</Badge>
						)}
					</div>
				</div>
				<Button
					type="button"
					className="w-full sm:w-auto"
					onClick={() => onDialogChange(true)}
				>
					<Plus />
					Registrar vehículo
				</Button>
			</div>

			<Dialog open={open} onOpenChange={onDialogChange}>
				<DialogContent className="max-h-[min(40rem,calc(100dvh-2rem))] overflow-y-auto sm:max-w-xl">
					<DialogHeader className="pr-8">
						<DialogTitle className="font-display text-xl">
							Registrar vehículo
						</DialogTitle>
						<DialogDescription>
							Guardá los datos básicos; podés completar el resto después.
						</DialogDescription>
					</DialogHeader>
					<Form {...form}>
						<form
							onSubmit={submit}
							className="grid gap-5 sm:grid-cols-2"
							noValidate
						>
							<RequiredLegend className="sm:col-span-2" />
							<TextField name="make" label="Marca" autoFocus required />
							<TextField name="model" label="Modelo" required />
							<NumberField
								name="year"
								label="Año"
								optional
								min={bounds.min}
								max={bounds.max}
								step={1}
							/>
							<TextField
								name="plate"
								label="Placa"
								optional
								uppercase
								placeholder="P123456"
							/>
							<RootError />
							<DialogFooter className="sm:col-span-2">
								<FormActions className="w-full">
									<Button
										type="button"
										variant="outline"
										className="w-full sm:w-auto"
										onClick={() => onDialogChange(false)}
									>
										Cancelar
									</Button>
									<SubmitButton pending={create.isPending}>
										Guardar
									</SubmitButton>
								</FormActions>
							</DialogFooter>
						</form>
					</Form>
				</DialogContent>
			</Dialog>

			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error.message}</AlertDescription>
				</Alert>
			)}

			{pending && <VehicleSkeletons />}

			{!pending && !error && vehicles.length === 0 && (
				<Card className="items-center gap-6 border-dashed px-6 py-16 text-center shadow-none sm:px-10 sm:py-20">
					<div className="grid size-16 place-items-center rounded-full bg-seal-soft text-seal dark:bg-accent dark:text-accent-foreground">
						<Car className="size-7" aria-hidden />
					</div>
					<div className="max-w-md space-y-2">
						<h2 className="font-display text-2xl font-bold">
							Todavía no tenés vehículos
						</h2>
						<p className="text-sm leading-relaxed text-ink-3">
							Los servicios, el kilometraje y el historial se quedan con vos
							aunque cambies de taller.
						</p>
					</div>
					<Button type="button" onClick={() => onDialogChange(true)}>
						Registrar mi primer vehículo
					</Button>
				</Card>
			)}

			{!pending && vehicles.length > 0 && (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{vehicles.map((vehicle) => (
						<VehicleCard key={vehicle.id} vehicle={vehicle} />
					))}
				</div>
			)}

			{me.memberships.length === 0 && (
				<section className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center">
					<div className="flex min-w-0 flex-1 items-start gap-4">
						<div className="grid size-11 shrink-0 place-items-center rounded-full bg-seal-soft text-seal dark:bg-accent dark:text-accent-foreground">
							<Store className="size-5" aria-hidden />
						</div>
						<div className="min-w-0">
							<p className="font-display text-base font-semibold">
								¿Tenés un taller?
							</p>
							<p className="mt-1 text-sm leading-relaxed text-ink-3">
								Registrá tus órdenes y compartí el historial con tus clientes.
							</p>
						</div>
					</div>
					<Button
						variant="outline"
						className="w-full shrink-0 sm:w-auto"
						asChild
					>
						<Link to="/onboarding">Registrar mi taller →</Link>
					</Button>
				</section>
			)}
		</main>
	);
}

function VehicleCard({ vehicle }: { vehicle: OwnerVehicle }) {
	const service = serviceSummary(vehicle.last_service);
	return (
		<Link
			to="/mis-vehiculos/$vehicleId"
			params={{ vehicleId: vehicle.id || "" }}
			className="group block h-full rounded-xl transition-transform duration-200 ease-out motion-reduce:transition-none motion-safe:hover:-translate-y-0.5 motion-safe:focus-visible:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
		>
			<Card className="h-full gap-0 p-5 shadow-none transition-[border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none group-hover:border-seal group-hover:shadow-sm group-focus-visible:border-seal group-focus-visible:shadow-sm dark:group-hover:border-primary dark:group-focus-visible:border-primary">
				<div className="flex items-center justify-between gap-3">
					<span
						className={cn(
							"inline-flex max-w-[75%] items-center truncate rounded-md border px-2.5 py-1 font-mono text-xs tracking-[0.16em]",
							vehicle.plate
								? "border-foreground/15 bg-secondary font-medium text-foreground uppercase"
								: "border-dashed text-ink-3",
						)}
					>
						{vehicle.plate || "Sin placa"}
					</span>
					<ChevronRight
						aria-hidden
						className="size-4 shrink-0 text-ink-3 transition-transform duration-200 motion-reduce:transition-none motion-safe:group-hover:translate-x-0.5 motion-safe:group-focus-visible:translate-x-0.5"
					/>
				</div>
				<h2 className="mt-4 font-display text-xl leading-tight font-bold">
					{vehicle.make} {vehicle.model}
				</h2>
				<p className="mt-1 min-h-5 text-sm text-ink-3">{vehicle.year ?? ""}</p>
				<Separator className="my-4" />
				<div className="grid grid-cols-3 gap-3">
					<Stat icon={Wrench} label="Servicio" value={service} />
					<Stat icon={Gauge} label="Km" value={km(vehicle.last_odometer_km)} />
					<Stat
						icon={History}
						label="Historial"
						value={plural(vehicle.history_count ?? 0, "registro", "registros")}
					/>
				</div>
			</Card>
		</Link>
	);
}

function Stat({
	icon: Icon,
	label,
	value,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
}) {
	return (
		<div className="min-w-0">
			<p className="flex items-center gap-1 text-[11px] text-ink-3">
				<Icon className="size-3.5 shrink-0" aria-hidden="true" />
				<span>{label}</span>
			</p>
			<p
				className="mt-1 line-clamp-3 text-sm leading-snug font-medium"
				title={value}
			>
				{value}
			</p>
		</div>
	);
}

function serviceSummary(
	service: components["schemas"]["LastService"] | null | undefined,
) {
	if (!service) return "Sin servicios";
	return service.summary || day(service.performed_on) || "Registrado";
}

function VehicleSkeletons() {
	return (
		<section aria-busy="true">
			<h2 className="sr-only">Cargando vehículos</h2>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{["a", "b", "c"].map((key) => (
					<Card key={key} className="gap-4 p-5 shadow-none">
						<Skeleton className="h-7 w-28" />
						<Skeleton className="h-6 w-40" />
						<Skeleton className="h-4 w-16" />
						<Skeleton className="h-px w-full" />
						<div className="grid grid-cols-3 gap-3">
							<Skeleton className="h-10" />
							<Skeleton className="h-10" />
							<Skeleton className="h-10" />
						</div>
					</Card>
				))}
			</div>
		</section>
	);
}
