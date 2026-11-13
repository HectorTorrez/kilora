import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { nitLabel } from "@/components/kilora/form-schemas";
import {
	PrintDocument,
	useDocumentQr,
} from "@/components/kilora/print-document";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { counterQuoteQuery, storedQuoteShare } from "@/features/taller/quotes";
import { useWorkshopId } from "@/features/taller/session";
import { date, day, money, phone, quoteCode } from "@/lib/format";
import { formatCents, lineCents } from "@/lib/money";

export const Route = createFileRoute("/taller/cotizaciones/$quoteId/imprimir")({
	component: PrintQuotePage,
});

function kindLabel(kind: string) {
	return kind === "mano_de_obra" ? "Mano de obra" : "Repuesto";
}

function PrintQuotePage() {
	const { quoteId } = Route.useParams();
	const workshopID = useWorkshopId();
	const { data, isLoading, error } = useQuery(
		counterQuoteQuery(workshopID, quoteId),
	);
	const shareUrl = data?.shared_at ? storedQuoteShare(data.id) : "";
	const qr = useDocumentQr(shareUrl, 1, 128);
	if (isLoading) {
		return (
			<main className="mx-auto max-w-3xl px-5 py-7">
				<Skeleton className="h-96" />
			</main>
		);
	}
	if (error || !data) {
		return (
			<main className="mx-auto max-w-3xl px-5 py-7">
				<Alert variant="destructive">
					<AlertDescription>
						{error?.message ?? "No se encontró la cotización."}
					</AlertDescription>
				</Alert>
			</main>
		);
	}
	let parts = 0;
	let labor = 0;
	for (const item of data.items) {
		const cents = lineCents(String(item.quantity), String(item.unit_price));
		if (item.kind === "mano_de_obra") labor += cents;
		else parts += cents;
	}
	const vehicle = [data.vehicle_make, data.vehicle_model, data.vehicle_year]
		.filter(Boolean)
		.join(" ");
	return (
		<PrintDocument
			appearance="quote"
			back={
				<Button asChild variant="outline">
					<Link
						to="/taller/cotizaciones/$quoteId"
						params={{ quoteId: data.id }}
					>
						Volver
					</Link>
				</Button>
			}
			printLabel="Imprimir"
		>
			<header className="avoid-break flex items-start justify-between gap-6 border-b border-black pb-4">
				<div>
					<p className="text-xs tracking-[0.16em]">COTIZACIÓN</p>
					<h1 className="mt-1 text-2xl font-bold">{data.workshop_name}</h1>
					<p className="text-sm">
						{data.workshop_nit
							? `${nitLabel(data.workshop_nit)} ${data.workshop_nit} · `
							: ""}
						{data.branch_name}
					</p>
					{data.verified_at ? (
						<p className="mt-2 inline-block border border-black px-2 py-0.5 text-xs font-semibold">
							Taller verificado
						</p>
					) : null}
				</div>
				<p className="text-right text-xs">Generado con Kilora</p>
			</header>
			<section className="avoid-break mt-4 grid gap-4 sm:grid-cols-2">
				<div>
					<p className="font-mono text-lg font-bold">
						{quoteCode(data.number)}
					</p>
					<p className="text-sm">Fecha {date(data.created_at)}</p>
					{data.valid_until ? (
						<p className="text-sm">Válida hasta {day(data.valid_until)}</p>
					) : null}
				</div>
				<div className="text-sm">
					<p className="font-semibold">Cliente</p>
					<p>{data.customer_name}</p>
					<p>{phone(data.customer_phone) || "Sin teléfono"}</p>
					<p className="mt-2 font-semibold">Vehículo</p>
					<p>{data.vehicle_plate || "Sin placa"}</p>
					<p>{vehicle}</p>
				</div>
			</section>
			<table className="mt-5 w-full border-collapse text-sm">
				<thead>
					<tr className="border-b border-black text-left">
						<th className="py-1 pr-2 font-semibold">Tipo</th>
						<th className="py-1 pr-2 font-semibold">Descripción</th>
						<th className="py-1 pr-2 text-right font-semibold">Cant.</th>
						<th className="py-1 pr-2 text-right font-semibold">P. unitario</th>
						<th className="py-1 text-right font-semibold">Subtotal</th>
					</tr>
				</thead>
				<tbody>
					{data.items.map((item, index) => {
						const cents = lineCents(
							String(item.quantity),
							String(item.unit_price),
						);
						return (
							<tr
								// biome-ignore lint/suspicious/noArrayIndexKey: Los ítems no tienen id.
								key={`${item.description}{item.brand && <span className="ml-1 text-ink-3">· {item.brand}</span>}-${index}`}
								className="border-b border-black/30"
							>
								<td className="py-1 pr-2">{kindLabel(item.kind)}</td>
								<td className="py-1 pr-2">
									{item.description}
									{item.brand && (
										<span className="ml-1 text-ink-3">· {item.brand}</span>
									)}
								</td>
								<td className="py-1 pr-2 text-right tabular-nums">
									{item.quantity}
								</td>
								<td className="py-1 pr-2 text-right tabular-nums">
									{money(item.unit_price)}
								</td>
								<td className="py-1 text-right tabular-nums">
									{money(formatCents(cents))}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
			<div className="avoid-break mt-3 ml-auto w-full max-w-xs text-sm">
				<p className="flex justify-between gap-4">
					<span>Subtotal repuestos</span>
					<span className="tabular-nums">{money(formatCents(parts))}</span>
				</p>
				<p className="flex justify-between gap-4">
					<span>Subtotal mano de obra</span>
					<span className="tabular-nums">{money(formatCents(labor))}</span>
				</p>
				<p className="mt-1 flex justify-between gap-4 border-t border-black pt-1 text-base font-bold">
					<span>Total USD</span>
					<span className="tabular-nums">{money(data.total)}</span>
				</p>
			</div>
			{data.notes ? (
				<p className="avoid-break mt-4 text-sm">
					<span className="font-semibold">Notas. </span>
					{data.notes}
				</p>
			) : null}
			{qr ? (
				<div className="avoid-break mt-4 flex items-center gap-3">
					<img src={qr} alt="" width={96} height={96} />
					<p className="text-xs">
						Consultá el detalle en línea
						<br />
						{shareUrl}
					</p>
				</div>
			) : null}
			<footer className="mt-6 border-t border-black pt-2 text-xs">
				Presupuesto informativo; precios sujetos a disponibilidad de repuestos.
			</footer>
		</PrintDocument>
	);
}
