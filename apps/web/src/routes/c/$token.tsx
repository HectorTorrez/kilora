import { createApiClient } from "@kilora/contracts";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { date, money } from "@/lib/format";

const getQuote = createServerFn({ method: "GET" })
	.validator((token: string) => token)
	.handler(async ({ data: token }) => {
		const { getRequest } = await import("@tanstack/react-start/server");
		const request = getRequest();
		const client = createApiClient(
			import.meta.env.VITE_API_URL || new URL(request.url).origin,
		);
		const result = await client.GET("/api/v1/public/quotes/{token}", {
			params: { path: { token } },
		});
		return result.data || null;
	});
export const Route = createFileRoute("/c/$token")({
	loader: async ({ params }) => {
		const quote = await getQuote({ data: params.token });
		if (!quote) throw notFound();
		return quote;
	},
	notFoundComponent: () => (
		<main className="p-8 text-center">
			<h1 className="text-2xl font-bold">Cotización no disponible</h1>
			<p>El enlace puede haber vencido o ya no estar disponible.</p>
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
			<section className="rounded-lg border bg-card p-5">
				<p className="text-sm text-ink-3">Orden #{q.order_number}</p>
				<h2 className="mt-1 text-xl font-semibold">{q.plate || "Sin placa"}</h2>
				<p>
					{q.make} {q.model} {q.year}
				</p>
			</section>
			<section className="rounded-lg border bg-card p-5">
				<h2 className="mb-3 font-semibold">Detalle de cotización</h2>
				{q.items.map((item, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: Items have no IDs.
						key={`${item.description}-${i}`}
						className="flex justify-between gap-4 border-b py-3 text-sm"
					>
						<div>
							{item.description}
							<p className="text-ink-3">
								{item.kind === "repuesto" ? "Repuesto" : "Mano de obra"} ·{" "}
								{item.quantity} × {money(item.unit_price)}
							</p>
						</div>
						<span>
							{money(Number(item.quantity) * Number(item.unit_price))}
						</span>
					</div>
				))}
				<p className="mt-4 flex justify-between text-lg font-bold">
					<span>Total USD</span>
					<span>{money(q.total)}</span>
				</p>
			</section>
			<p className="text-sm text-ink-3">
				Enviada el {date(q.shared_at)} · válida hasta {date(q.share_expires_at)}
			</p>
		</main>
	);
}
