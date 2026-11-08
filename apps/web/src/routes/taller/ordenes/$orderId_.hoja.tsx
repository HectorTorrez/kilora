import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import QRCode from "qrcode";
import { type ReactNode, useEffect, useState } from "react";
import { useWorkshopId } from "@/components/kilora/app-shell";
import {
	categoryLabels,
	lastByCategory,
} from "@/components/kilora/history-timeline";
import { PageBody } from "@/components/kilora/workshop-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { date, day, km, statusLabel } from "@/lib/format";
import {
	historyQuery,
	orderQuery,
	vehicleQuery,
	workshopQuery,
} from "@/lib/workshop";

export const Route = createFileRoute("/taller/ordenes/$orderId_/hoja")({
	head: () => ({ meta: [{ title: "Hoja del mecánico · Kilora" }] }),
	component: MechanicSheet,
});

/**
 * Hoja del mecánico (DECISIONS §6): ficha, motivo, trabajos y últimos
 * registros. Sin costos ni notas privadas: se imprime y se entrega en el taller.
 */
function MechanicSheet() {
	const { orderId } = Route.useParams();
	const workshopID = useWorkshopId();
	const order = useQuery({
		...orderQuery(workshopID, orderId),
		enabled: !!workshopID,
	});
	const vehicleID = order.data?.vehicle_id ?? "";
	const vehicle = useQuery({
		...vehicleQuery(workshopID, vehicleID),
		enabled: !!vehicleID,
	});
	const history = useQuery({
		...historyQuery(workshopID, vehicleID),
		enabled: !!vehicleID,
	});
	const workshop = useQuery(workshopQuery(workshopID));
	const [qr, setQr] = useState("");
	useEffect(() => {
		if (typeof window === "undefined") return;
		void QRCode.toDataURL(window.location.href.replace(/\/hoja$/, ""), {
			margin: 0,
			width: 220,
		}).then(setQr);
	}, []);

	if (order.isLoading || vehicle.isLoading)
		return (
			<PageBody className="max-w-4xl">
				<Skeleton className="h-[600px]" />
			</PageBody>
		);
	if (order.error || !order.data || !vehicle.data)
		return (
			<PageBody className="max-w-4xl">
				<Alert variant="destructive">
					<AlertDescription>
						{order.error?.message ??
							vehicle.error?.message ??
							"Orden no disponible"}
					</AlertDescription>
				</Alert>
			</PageBody>
		);

	const o = order.data;
	const v = vehicle.data;
	const records = history.data?.records ?? [];

	return (
		<PageBody className="max-w-4xl print:max-w-none print:p-0">
			<div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
				<Link
					to="/taller/ordenes/$orderId"
					params={{ orderId: o.id }}
					className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-foreground"
				>
					<ArrowLeft className="size-3.5" />
					Volver a la orden #{o.number}
				</Link>
				<Button onClick={() => window.print()}>
					<Printer className="size-4" />
					Imprimir hoja
				</Button>
			</div>

			<article className="rounded-lg border bg-white p-6 text-[#111827] shadow-sm sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
				<header className="flex items-start justify-between gap-6 border-b-2 border-[#111827] pb-4">
					<div>
						<p className="font-display text-sm font-bold tracking-[0.25em]">
							KILORA
						</p>
						<h1 className="mt-1 font-display text-2xl font-bold">
							Hoja del mecánico
						</h1>
						<p className="mt-0.5 text-sm text-[#3f4a58]">
							{workshop.data?.workshop.name}
						</p>
					</div>
					<div className="text-right">
						<p className="font-mono text-2xl font-bold">#{o.number}</p>
						<p className="text-xs text-[#3f4a58]">
							{date(o.received_at)} · {statusLabel(o.status)}
						</p>
					</div>
				</header>

				<section className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto] print:grid-cols-[1fr_auto]">
					<dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 print:grid-cols-3">
						<Field label="Placa">
							<span className="font-mono text-lg font-bold tracking-wider">
								{v.plate || "SIN PLACA"}
							</span>
						</Field>
						<Field label="Vehículo">
							{v.make} {v.model} {v.year ?? ""}
						</Field>
						<Field label="Kilometraje">
							<span className="font-mono">{km(o.odometer_km)}</span>
						</Field>
						<Field label="VIN">
							<span className="font-mono text-xs">{v.vin || "—"}</span>
						</Field>
						<Field label="Contacto">{v.contact_name || "—"}</Field>
						<Field label="Teléfono">
							<span className="font-mono">{v.contact_phone || "—"}</span>
						</Field>
					</dl>
					{qr && (
						<figure className="text-center">
							<img
								src={qr}
								alt="QR para abrir la orden"
								width="96"
								height="96"
								className="mx-auto"
							/>
							<figcaption className="mt-1 text-[10px] text-[#667180]">
								Abrir la orden
							</figcaption>
						</figure>
					)}
				</section>

				<section className="mt-6 rounded-md border-2 border-[#111827] p-4">
					<h2 className="text-[11px] font-bold tracking-widest uppercase">
						Motivo de ingreso
					</h2>
					<p className="mt-1 text-lg font-semibold">{o.reason}</p>
					{o.public_notes && (
						<p className="mt-1 text-sm text-[#3f4a58]">{o.public_notes}</p>
					)}
				</section>

				<section className="mt-6">
					<h2 className="border-b pb-1 text-[11px] font-bold tracking-widest uppercase">
						Trabajos a realizar
					</h2>
					{o.jobs.length ? (
						<ul className="mt-2 space-y-2">
							{o.jobs.map((j) => (
								<li key={j.id} className="flex gap-3 text-sm">
									<span className="mt-0.5 size-4 shrink-0 rounded-sm border-2 border-[#111827]" />
									<div>
										<p className="font-semibold">
											{j.description}
											{j.category && categoryLabels[j.category] && (
												<span className="ml-2 text-xs font-normal text-[#667180]">
													[{categoryLabels[j.category]}]
												</span>
											)}
										</p>
										{j.parts.length > 0 && (
											<p className="text-xs text-[#3f4a58]">
												Piezas:{" "}
												{j.parts
													.map(
														(p) =>
															`${p.name}${p.brand ? ` (${p.brand})` : ""} ×${Number(p.quantity)}`,
													)
													.join(", ")}
											</p>
										)}
									</div>
								</li>
							))}
						</ul>
					) : (
						<p className="mt-2 text-sm text-[#667180]">
							Pendiente de diagnóstico.
						</p>
					)}
				</section>

				<div className="mt-6 grid gap-6 sm:grid-cols-2 print:grid-cols-2">
					<section>
						<h2 className="border-b pb-1 text-[11px] font-bold tracking-widest uppercase">
							Último cambio por pieza
						</h2>
						<table className="mt-2 w-full text-sm">
							<tbody>
								{lastByCategory(records).map(({ category, label, record }) => (
									<tr key={category} className="border-b border-dashed">
										<td className="py-1.5 font-medium">{label}</td>
										<td className="py-1.5 text-right font-mono text-xs">
											{record
												? `${day(record.performed_on)} · ${km(record.odometer_km)}`
												: "—"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>
					<section>
						<h2 className="border-b pb-1 text-[11px] font-bold tracking-widest uppercase">
							Últimos servicios
						</h2>
						{records.length ? (
							<ul className="mt-2 space-y-1.5 text-sm">
								{records.slice(0, 5).map((r) => (
									<li key={r.id} className="flex justify-between gap-3">
										<span className="min-w-0 truncate">{r.summary}</span>
										<span className="shrink-0 font-mono text-xs text-[#3f4a58]">
											{day(r.performed_on)}
										</span>
									</li>
								))}
							</ul>
						) : (
							<p className="mt-2 text-sm text-[#667180]">
								Sin servicios publicados.
							</p>
						)}
					</section>
				</div>

				<section className="mt-6">
					<h2 className="border-b pb-1 text-[11px] font-bold tracking-widest uppercase">
						Observaciones del mecánico
					</h2>
					<div className="mt-1">
						{Array.from({ length: 4 }, (_, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: static ruled lines.
								key={i}
								className="h-8 border-b border-dashed border-[#c7d0da]"
							/>
						))}
					</div>
				</section>

				<footer className="mt-8 flex justify-between gap-6 text-xs text-[#667180]">
					<span>Sin costos ni notas privadas del taller.</span>
					<span>Firma: ______________________</span>
				</footer>
			</article>
		</PageBody>
	);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div>
			<dt className="text-[10.5px] font-semibold tracking-wider text-[#667180] uppercase">
				{label}
			</dt>
			<dd className="mt-0.5">{children}</dd>
		</div>
	);
}
