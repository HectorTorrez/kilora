import { createFileRoute, notFound } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { api, isNotFound, unwrap } from "@/lib/api";
import { date, day, money } from "@/lib/format";
import { formatCents, lineCents } from "@/lib/money";

async function getQuote(token: string) {
	try {
		return unwrap(
			await api.GET("/api/v1/public/quotes/{token}", {
				params: { path: { token } },
			}),
		);
	} catch (error) {
		if (isNotFound(error)) return null;
		throw error;
	}
}

export const Route = createFileRoute("/c/$token")({
	loader: async ({ params }) => {
		const quote = await getQuote(params.token);
		if (!quote) throw notFound();
		return quote;
	},
	notFoundComponent: () => (
		<main className="p-8 text-center">
			<Alert>
				<AlertTitle>Cotización no disponible</AlertTitle>
				<AlertDescription>
					El enlace puede haber vencido o ya no estar disponible.
				</AlertDescription>
			</Alert>
		</main>
	),
	component: PublicQuote,
});
function PublicQuote() {
	const q = Route.useLoaderData();
	return (
		<main className="mx-auto max-w-xl space-y-6 px-5 py-8">
			<header>
				<p className="text-xs font-bold tracking-widest">KILORA · COTIZACIÓN</p>
				<h1 className="mt-3 text-2xl font-bold">{q.workshop_name}</h1>
				{q.verified_at && (
					<p className="text-sm text-seal">✓ Taller verificado</p>
				)}
			</header>
			<Card className="gap-0 rounded-lg p-5 shadow-none">
				<p className="text-sm text-ink-3">
					{q.order_number != null
						? `Orden #${q.order_number}`
						: `Cotización COT-${String(q.quote_number).padStart(4, "0")}`}
				</p>
				{q.customer_name ? (
					<p className="mt-1 font-medium">{q.customer_name}</p>
				) : null}
				<h2 className="mt-1 text-xl font-semibold">{q.plate || "Sin placa"}</h2>
				<p>{[q.make, q.model, q.year].filter(Boolean).join(" ")}</p>
			</Card>
			<Card className="gap-0 rounded-lg p-5 shadow-none">
				<h2 className="mb-3 font-semibold">Detalle de cotización</h2>
				<Table>
					<TableBody>
						{q.items.map((item, i) => (
							<TableRow
								// biome-ignore lint/suspicious/noArrayIndexKey: Items have no IDs.
								key={`${item.description}-${i}`}
								className="text-sm"
							>
								<TableCell className="whitespace-normal">
									{item.description}
									<p className="text-ink-3">
										{item.kind === "repuesto" ? "Repuesto" : "Mano de obra"} ·{" "}
										{item.quantity} × {money(item.unit_price)}
									</p>
								</TableCell>
								<TableCell className="text-right">
									{money(
										formatCents(lineCents(item.quantity, item.unit_price)),
									)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				<p className="mt-4 flex justify-between text-lg font-bold">
					<span>Total USD</span>
					<span>{money(q.total)}</span>
				</p>
			</Card>
			{q.notes ? <p className="text-sm">{q.notes}</p> : null}
			<p className="text-sm text-ink-3">
				Enviada el {date(q.shared_at)} · válida hasta{" "}
				{q.valid_until ? day(q.valid_until) : date(q.share_expires_at)}
			</p>
		</main>
	);
}
