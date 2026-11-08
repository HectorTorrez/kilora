import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorkshopId } from "@/components/kilora/app-shell";
import { OwnerInvitation } from "@/components/kilora/owner-invitation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { money, statusLabel } from "@/lib/format";
import {
	actions,
	orderQuery,
	useWorkshopMutation,
	vehicleQuery,
} from "@/lib/workshop";

type S = components["schemas"];
export const Route = createFileRoute("/taller/ordenes/$orderId")({
	component: OrderPage,
});
const blank = (): S["QuoteItem"] => ({
	kind: "repuesto",
	description: "",
	quantity: 1,
	unit_price: 0,
});
function OrderPage() {
	const { orderId } = Route.useParams();
	const workshopID = useWorkshopId();
	const order = useQuery(orderQuery(workshopID, orderId));
	const vehicle = useQuery({
		...vehicleQuery(workshopID, order.data?.vehicle_id || ""),
		enabled: !!order.data,
	});
	if (order.isLoading)
		return (
			<main className="p-8">
				<Skeleton className="h-32" aria-label="Cargando orden…" />
			</main>
		);
	if (order.error || !order.data)
		return (
			<main className="p-8">
				<Alert variant="destructive">
					<AlertDescription>
						{order.error?.message || "Orden no disponible"}
					</AlertDescription>
				</Alert>
			</main>
		);
	return (
		<OrderDetail
			key={order.data.id}
			workshopID={workshopID}
			order={order.data}
			vehicle={vehicle.data}
		/>
	);
}
function OrderDetail({
	workshopID,
	order,
	vehicle,
}: {
	workshopID: string;
	order: S["WorkOrderDetail"];
	vehicle?: S["Vehicle"];
}) {
	const a = actions(workshopID, order.id);
	const edit = useWorkshopMutation(workshopID, a.edit);
	const status = useWorkshopMutation(workshopID, a.status);
	const job = useWorkshopMutation(workshopID, a.job);
	const deleteJob = useWorkshopMutation(workshopID, a.deleteJob);
	const part = useWorkshopMutation(workshopID, a.part);
	const deletePart = useWorkshopMutation(workshopID, a.deletePart);
	const quote = useWorkshopMutation(workshopID, a.quote);
	const share = useWorkshopMutation(workshopID, a.share);
	const outcome = useWorkshopMutation(workshopID, a.outcome);
	const [reason, setReason] = useState(order.reason);
	const [km, setKm] = useState(order.odometer_km?.toString() || "");
	const [publicNotes, setPublicNotes] = useState(order.public_notes || "");
	const [internalNotes, setInternalNotes] = useState(
		order.internal_notes || "",
	);
	const [jobName, setJobName] = useState("");
	const [labor, setLabor] = useState("");
	const [partName, setPartName] = useState("");
	const [partPrice, setPartPrice] = useState("");
	const [partJob, setPartJob] = useState("");
	const [items, setItems] = useState<S["QuoteItem"][]>(
		order.quote?.items || [blank()],
	);
	const [url, setUrl] = useState("");
	const [cancelReason, setCancelReason] = useState("");
	useEffect(() => {
		if (order.quote) setItems(order.quote.items);
	}, [order.quote]);
	const next: Partial<Record<S["WorkOrderStatus"], S["WorkOrderStatus"]>> = {
		recibido: "diagnostico",
		diagnostico: "en_reparacion",
		en_reparacion: "listo",
	};
	return (
		<main className="mx-auto max-w-5xl space-y-5 px-5 py-7">
			<header>
				<p className="text-sm text-ink-3">
					Orden #{order.number} · {statusLabel(order.status)}
				</p>
				<h1 className="font-display text-3xl font-bold">
					{vehicle?.plate || "Sin placa"} · {vehicle?.make} {vehicle?.model}
				</h1>
				{order.history_record_id && (
					<p className="mt-2 font-semibold text-seal">
						Publicada en el historial
					</p>
				)}
			</header>
			<Card className="space-y-3 gap-0 rounded-lg p-5 shadow-none">
				<h2 className="font-semibold">Estado de la orden</h2>
				<div className="flex flex-wrap gap-2">
					{next[order.status] && (
						<Button
							onClick={() =>
								status.mutate({
									status: next[order.status] as S["WorkOrderStatus"],
								})
							}
						>
							Avanzar a {statusLabel(next[order.status] ?? "").toLowerCase()}
						</Button>
					)}
					{next[order.status] && (
						<>
							<Input
								className="max-w-xs"
								placeholder="Motivo de cancelación"
								value={cancelReason}
								onChange={(e) => setCancelReason(e.target.value)}
							/>
							<Button
								variant="outline"
								disabled={!cancelReason}
								onClick={() =>
									status.mutate({
										status: "cancelado",
										cancel_reason: cancelReason,
									})
								}
							>
								Cancelar orden
							</Button>
						</>
					)}
				</div>
			</Card>
			<Card className="gap-0 rounded-lg p-5 shadow-none">
				<form
					className="space-y-3"
					onSubmit={(e) => {
						e.preventDefault();
						edit.mutate({
							reason,
							odometer_km: km ? Number(km) : null,
							public_notes: publicNotes || null,
							internal_notes: internalNotes || null,
						});
					}}
				>
					<h2 className="font-semibold">Datos de la orden</h2>
					<Label className="grid gap-2" htmlFor="field-1">
						Motivo
						<Input
							id="field-1"
							required
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
					</Label>
					<Label className="grid gap-2" htmlFor="field-2">
						Kilometraje
						<Input
							id="field-2"
							type="number"
							min="0"
							value={km}
							onChange={(e) => setKm(e.target.value)}
						/>
					</Label>
					<Label className="grid gap-2" htmlFor="field-3">
						Notas públicas · las ve el propietario
						<Textarea
							id="field-3"
							value={publicNotes}
							onChange={(e) => setPublicNotes(e.target.value)}
						/>
					</Label>
					<Label className="grid gap-2" htmlFor="field-4">
						Notas internas · privadas del taller
						<Textarea
							id="field-4"
							value={internalNotes}
							onChange={(e) => setInternalNotes(e.target.value)}
						/>
					</Label>
					<Button>Guardar cambios</Button>
				</form>
			</Card>
			<OwnerInvitation
				workshopID={workshopID}
				vehicleID={order.vehicle_id}
				linked={vehicle?.owner_linked}
				name={vehicle?.owner_name}
			/>
			<Card className="space-y-3 gap-0 rounded-lg p-5 shadow-none">
				<h2 className="font-semibold">Trabajos y piezas</h2>
				{order.jobs.map((j) => (
					<div key={j.id} className="space-y-2 pb-3">
						<Table>
							<TableBody>
								<TableRow>
									<TableCell className="whitespace-normal">
										{j.description} · mano de obra {money(j.labor_price || 0)}
									</TableCell>
									<TableCell className="text-right">
										<Button
											variant="outline"
											size="sm"
											onClick={() => deleteJob.mutate(j.id)}
										>
											Eliminar trabajo
										</Button>
									</TableCell>
								</TableRow>
								{j.parts.map((p) => (
									<TableRow key={p.id}>
										<TableCell className="whitespace-normal pl-4 text-sm">
											{p.name} · {p.quantity} × {money(p.unit_price || 0)}
										</TableCell>
										<TableCell className="text-right">
											<Button
												variant="ghost"
												size="sm"
												type="button"
												onClick={() =>
													deletePart.mutate({ jobID: j.id, partID: p.id })
												}
											>
												Eliminar pieza
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setPartJob(j.id)}
						>
							Agregar pieza
						</Button>
						{partJob === j.id && (
							<form
								className="flex flex-wrap gap-2"
								onSubmit={(e) => {
									e.preventDefault();
									part.mutate(
										{
											jobID: j.id,
											body: {
												name: partName,
												quantity: 1,
												unit_price: partPrice || "0",
											},
										},
										{
											onSuccess: () => {
												setPartName("");
												setPartPrice("");
												setPartJob("");
											},
										},
									);
								}}
							>
								<Input
									className="max-w-xs"
									required
									placeholder="Pieza"
									value={partName}
									onChange={(e) => setPartName(e.target.value)}
								/>
								<Input
									className="max-w-32"
									type="number"
									min="0"
									step="0.01"
									placeholder="Precio"
									value={partPrice}
									onChange={(e) => setPartPrice(e.target.value)}
								/>
								<Button>Guardar pieza</Button>
							</form>
						)}
						<Separator />
					</div>
				))}
				<form
					className="flex flex-wrap gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						job.mutate(
							{ description: jobName, labor_price: labor || "0" },
							{
								onSuccess: () => {
									setJobName("");
									setLabor("");
								},
							},
						);
					}}
				>
					<Input
						required
						className="max-w-xs"
						placeholder="Trabajo realizado"
						value={jobName}
						onChange={(e) => setJobName(e.target.value)}
					/>
					<Input
						className="max-w-36"
						type="number"
						min="0"
						step="0.01"
						placeholder="Mano de obra"
						value={labor}
						onChange={(e) => setLabor(e.target.value)}
					/>
					<Button>Agregar trabajo</Button>
				</form>
			</Card>
			<Card className="space-y-3 gap-0 rounded-lg p-5 shadow-none">
				<h2 className="font-semibold">Cotización</h2>
				{items.map((item, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: Items have no IDs.
						key={`item-${i}`}
						className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr_1fr_auto]"
					>
						<Select
							value={item.kind}
							onValueChange={(value) =>
								setItems(
									items.map((x, n) =>
										n === i
											? { ...x, kind: value as S["QuoteItem"]["kind"] }
											: x,
									),
								)
							}
						>
							<SelectTrigger aria-label="Tipo">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="repuesto">Repuesto</SelectItem>
								<SelectItem value="mano_de_obra">Mano de obra</SelectItem>
							</SelectContent>
						</Select>
						<Input
							aria-label="Descripción"
							placeholder="Descripción"
							value={item.description}
							onChange={(e) =>
								setItems(
									items.map((x, n) =>
										n === i ? { ...x, description: e.target.value } : x,
									),
								)
							}
						/>
						<Input
							aria-label="Cantidad"
							type="number"
							min="0.01"
							step="0.01"
							value={item.quantity}
							onChange={(e) =>
								setItems(
									items.map((x, n) =>
										n === i ? { ...x, quantity: e.target.value } : x,
									),
								)
							}
						/>
						<Input
							aria-label="Precio"
							type="number"
							min="0"
							step="0.01"
							value={item.unit_price}
							onChange={(e) =>
								setItems(
									items.map((x, n) =>
										n === i ? { ...x, unit_price: e.target.value } : x,
									),
								)
							}
						/>
						<Button
							variant="outline"
							onClick={() => setItems(items.filter((_, n) => n !== i))}
						>
							Quitar
						</Button>
					</div>
				))}
				<p className="text-right font-semibold">
					Total:{" "}
					{money(
						items.reduce(
							(sum, i) => sum + Number(i.quantity) * Number(i.unit_price),
							0,
						),
					)}
				</p>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						onClick={() => setItems([...items, blank()])}
					>
						Agregar ítem
					</Button>
					<Button onClick={() => quote.mutate({ items })}>
						Guardar cotización
					</Button>
					<Button
						variant="outline"
						onClick={async () => {
							try {
								const result = await share.mutateAsync();
								setUrl(result.url);
								window.open(
									result.whatsapp_url,
									"_blank",
									"noopener,noreferrer",
								);
							} catch {}
						}}
					>
						Compartir por WhatsApp
					</Button>
				</div>
				{url && (
					<div className="flex gap-2">
						<Input readOnly value={url} />
						<Button
							variant="outline"
							onClick={async () => {
								await navigator.clipboard.writeText(url);
								toast.success("Enlace copiado");
							}}
						>
							Copiar
						</Button>
					</div>
				)}
				{order.quote && (
					<div className="flex flex-wrap items-center gap-2">
						<span>Resultado: {order.quote.outcome.replaceAll("_", " ")}</span>
						{(
							[
								["acepto", "Aceptó"],
								["rechazo", "Rechazó"],
								["no_respondio", "No respondió"],
							] as const
						).map(([value, label]) => (
							<Button
								key={value}
								variant="outline"
								size="sm"
								onClick={() => outcome.mutate({ outcome: value })}
							>
								{label}
							</Button>
						))}
					</div>
				)}
				{order.quote_comparison && (
					<p>
						Cotizado: {money(order.quote_comparison.quote_total || 0)} ·
						Cobrado: {money(order.quote_comparison.charged_total || 0)} ·
						Diferencia: {money(order.quote_comparison.difference || 0)}
					</p>
				)}
			</Card>
		</main>
	);
}
