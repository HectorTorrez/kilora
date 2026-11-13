import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, CalendarClock, Settings2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { day, km, shortDate } from "@/lib/format";
import {
	ownerActions,
	ownerMaintenanceQuery,
	useOwnerMutation,
} from "@/lib/owner";
import { FormActions, NumberField, SubmitButton } from "./form-fields";

type Item = components["schemas"]["OwnerMaintenanceItem"];
const statuses: Record<Item["status"], string> = {
	sin_historial: "Sin registro",
	sin_kilometraje: "Falta kilometraje",
	programado: "Programado",
	proximo: "Próximo",
	vencido: "Revisión pendiente",
};

export function OwnerMaintenanceCard({
	vehicleID,
	email,
	emailsAllowed,
	onUpdateKm,
	onAddService,
}: {
	vehicleID: string;
	email: string;
	emailsAllowed: boolean;
	onUpdateKm: () => void;
	onAddService: () => void;
}) {
	const plan = useQuery(ownerMaintenanceQuery(vehicleID));
	const [editing, setEditing] = useState<Item | null>(null);
	if (plan.isPending)
		return (
			<Skeleton
				className="h-52 rounded-xl"
				aria-label="Cargando próximo mantenimiento…"
			/>
		);
	if (!plan.data)
		return (
			<Alert variant="destructive">
				<AlertDescription>
					No pudimos cargar tu plan de mantenimiento.
					<Button type="button" variant="link" onClick={() => plan.refetch()}>
						Reintentar
					</Button>
				</AlertDescription>
			</Alert>
		);
	const data = plan.data;
	const known = data.items.filter((item) => item.status !== "sin_historial");
	const featured = known.slice(0, 3);
	const featuredCategories = new Set(featured.map((item) => item.category));
	const remaining = data.items.filter(
		(item) => !featuredCategories.has(item.category),
	);
	return (
		<Card className="gap-4 shadow-none">
			<CardHeader className="gap-2">
				<h2 className="flex items-center gap-2 font-display text-xl font-bold">
					<CalendarClock className="size-5 text-seal" aria-hidden />
					Próximo mantenimiento
				</h2>
				<p className="text-sm text-ink-2">
					Estimaciones según tus servicios registrados. Seguí el manual del
					fabricante y la indicación de tu taller.
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				{data.odometer_stale && (
					<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3">
						<p className="text-sm text-ink-2">
							{data.last_odometer_at
								? `Tu última lectura es del ${shortDate(data.last_odometer_at)}.`
								: "Todavía no hay una lectura de kilometraje."}{" "}
							Actualizala para mejorar las estimaciones.
						</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onUpdateKm}
						>
							Actualizar kilometraje
						</Button>
					</div>
				)}
				{known.length === 0 ? (
					<div className="rounded-lg border border-dashed p-4">
						<p className="font-medium">Tu plan empieza con un servicio</p>
						<p className="mt-1 text-sm text-ink-2">
							Agregá tu último cambio de aceite, frenos o batería. Sin ese
							registro no podemos estimar la próxima revisión.
						</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="mt-3"
							onClick={onAddService}
						>
							Agregar un servicio
						</Button>
					</div>
				) : (
					<ul className="divide-y">
						{featured.map((item) => (
							<MaintenanceRow
								key={item.category}
								item={item}
								onEdit={setEditing}
							/>
						))}
					</ul>
				)}
				{remaining.length > 0 && (
					<details className="rounded-lg border px-3">
						<summary className="cursor-pointer py-3 text-sm font-medium">
							Ver el resto del plan y ajustar intervalos
						</summary>
						<ul className="divide-y">
							{remaining.map((item) => (
								<MaintenanceRow
									key={item.category}
									item={item}
									onEdit={setEditing}
								/>
							))}
						</ul>
					</details>
				)}
				<MaintenanceEmailPreferences
					vehicleID={vehicleID}
					email={email}
					emailsAllowed={emailsAllowed}
					enabled={data.email_reminders}
				/>
			</CardContent>
			{editing && (
				<IntervalDialog
					key={editing.category}
					vehicleID={vehicleID}
					item={editing}
					onClose={() => setEditing(null)}
				/>
			)}
		</Card>
	);
}

function MaintenanceEmailPreferences({
	vehicleID,
	email,
	emailsAllowed,
	enabled,
}: {
	vehicleID: string;
	email: string;
	emailsAllowed: boolean;
	enabled: boolean;
}) {
	const reminders = useOwnerMutation((enabled: boolean) =>
		ownerActions.maintenanceEmail(vehicleID, enabled),
	);
	return (
		<>
			{" "}
			{!emailsAllowed && (
				<Alert>
					<AlertDescription>
						Los correos de mantenimiento están desactivados en tu perfil para
						todos tus vehículos.{" "}
						<Link to="/mis-vehiculos/cuenta" className="font-medium underline">
							Cambiar preferencia en Mi cuenta
						</Link>
					</AlertDescription>
				</Alert>
			)}
			<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
				<div className="min-w-0 flex-1 basis-64">
					<p className="flex items-center gap-2 text-sm font-medium">
						<Bell className="size-4" aria-hidden />
						Recordatorios por correo
						{!emailsAllowed
							? " pausados desde tu perfil"
							: enabled
								? " activados"
								: " desactivados"}
					</p>
					<p className="mt-1 break-words text-xs text-ink-2">
						{!emailsAllowed
							? "Habilitá los correos en Mi cuenta para recibir tus avisos. "
							: enabled
								? `Se envían a ${email}. `
								: "Activá los avisos para este vehículo. "}
						Un resumen de revisiones como máximo semanal. Si solo falta
						actualizar el kilometraje, un aviso como máximo mensual. Podés
						desactivarlos aquí.
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={reminders.isPending || !emailsAllowed}
					onClick={() =>
						reminders.mutate(!enabled, {
							onSuccess: () =>
								toast.success(
									enabled
										? "Recordatorios desactivados"
										: "Recordatorios activados",
								),
							onError: (error) => toast.error(errorMessage(error)),
						})
					}
				>
					{reminders.isPending
						? "Guardando…"
						: enabled
							? "Desactivar correos"
							: "Activar correos"}
				</Button>
			</div>
		</>
	);
}

function MaintenanceRow({
	item,
	onEdit,
}: {
	item: Item;
	onEdit: (item: Item) => void;
}) {
	const targets = [
		item.due_date ? day(item.due_date) : null,
		item.due_km !== null ? km(item.due_km) : null,
	].filter(Boolean);
	const interval = [
		item.interval_km > 0 ? km(item.interval_km) : null,
		item.interval_months > 0 ? `${item.interval_months} meses` : null,
	]
		.filter(Boolean)
		.join(" o ");
	return (
		<li className="py-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<h3 className="text-sm font-semibold">{item.label}</h3>
					<Badge
						variant={item.status === "vencido" ? "destructive" : "secondary"}
					>
						{statuses[item.status]}
					</Badge>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					aria-label={`Ajustar intervalo de ${item.label}`}
					onClick={() => onEdit(item)}
				>
					<Settings2 className="size-3.5" aria-hidden />
					Ajustar
				</Button>
			</div>
			{item.last_performed_on ? (
				<>
					<p className="mt-1 text-sm">
						{targets.length > 0
							? `Próxima revisión: ${targets.join(" o ")}${targets.length === 2 ? ", lo que ocurra primero" : ""}.`
							: "Agregá el kilometraje del último servicio para estimar la próxima revisión."}
					</p>
					<p className="mt-1 break-words text-xs text-ink-2">
						Basado en: {item.last_summary} · {day(item.last_performed_on)}
						{item.last_odometer_km !== null
							? ` · ${km(item.last_odometer_km)}`
							: ""}
						.
					</p>
				</>
			) : (
				<p className="mt-1 text-sm text-ink-2">
					No hay un servicio registrado para estimar la próxima revisión.
				</p>
			)}
			<p className="mt-1 text-xs text-ink-3">
				{item.custom_interval ? "Tu intervalo" : "Referencia general"}:{" "}
				{interval}.
			</p>
		</li>
	);
}

const intervalNumber = (max: number) =>
	z
		.string()
		.trim()
		.refine(
			(value) => value === "" || (/^\d+$/.test(value) && Number(value) <= max),
			`Ingresá un número entero entre 0 y ${max}`,
		);
const intervalSchema = z
	.object({ km: intervalNumber(1000000), months: intervalNumber(120) })
	.refine((value) => Number(value.km) > 0 || Number(value.months) > 0, {
		path: ["km"],
		message: "Indicá al menos un intervalo mayor que cero",
	});

function IntervalDialog({
	vehicleID,
	item,
	onClose,
}: {
	vehicleID: string;
	item: Item;
	onClose: () => void;
}) {
	const form = useForm({
		resolver: zodResolver(intervalSchema),
		defaultValues: {
			km: String(item.interval_km || ""),
			months: String(item.interval_months || ""),
		},
	});
	const save = useOwnerMutation(
		(body: components["schemas"]["MaintenanceIntervalInput"]) =>
			ownerActions.maintenanceInterval(vehicleID, item.category, body),
	);
	const reset = useOwnerMutation(() =>
		ownerActions.resetMaintenanceInterval(vehicleID, item.category),
	);
	const pending = save.isPending || reset.isPending;
	const saved = () => {
		toast.success("Intervalo actualizado");
		onClose();
	};
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
		>
			<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Intervalo de {item.label.toLowerCase()}</DialogTitle>
					<DialogDescription>
						Usá el intervalo del manual o el indicado por tu taller. Se aplica
						solo a este vehículo. Dejá vacío o en cero el límite que no uses; si
						indicás ambos, se usa el que ocurra primero.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						className="space-y-4"
						onSubmit={form.handleSubmit((values) =>
							save.mutate(
								{ km: Number(values.km), months: Number(values.months) },
								{
									onSuccess: saved,
									onError: (error) => toast.error(errorMessage(error)),
								},
							),
						)}
					>
						<NumberField
							name="km"
							label="Cada cuántos kilómetros"
							optional
							min={0}
							max={1000000}
							step={1}
						/>
						<NumberField
							name="months"
							label="Cada cuántos meses"
							optional
							min={0}
							max={120}
							step={1}
						/>
						<FormActions>
							<Button
								type="button"
								variant="outline"
								onClick={onClose}
								disabled={pending}
							>
								Cancelar
							</Button>
							<SubmitButton pending={pending}>Guardar intervalo</SubmitButton>
						</FormActions>
					</form>
				</Form>
				{item.custom_interval && (
					<Button
						type="button"
						variant="ghost"
						disabled={pending}
						onClick={() =>
							reset.mutate(undefined, {
								onSuccess: saved,
								onError: (error) => toast.error(errorMessage(error)),
							})
						}
					>
						Restaurar referencia general
					</Button>
				)}
			</DialogContent>
		</Dialog>
	);
}
