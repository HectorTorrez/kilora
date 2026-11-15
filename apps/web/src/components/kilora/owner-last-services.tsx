import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { day, km } from "@/lib/format";
import { ownerMaintenanceQuery } from "@/lib/owner";

const featured = ["aceite", "frenos", "bateria"];

export function OwnerLastServices({
	vehicleID,
	onAddService,
}: {
	vehicleID: string;
	onAddService: () => void;
}) {
	const plan = useQuery(ownerMaintenanceQuery(vehicleID));
	const items = [...(plan.data?.items ?? [])].sort((a, b) => {
		const rank = (category: string) =>
			featured.includes(category)
				? featured.indexOf(category)
				: featured.length;
		return (
			rank(a.category) - rank(b.category) ||
			a.label.localeCompare(b.label, "es")
		);
	});
	return (
		<Card className="gap-4 shadow-none">
			<CardHeader>
				<h2 className="flex items-center gap-2 font-display text-xl font-bold">
					<History className="size-5 text-seal" aria-hidden />
					Últimos servicios por categoría
				</h2>
				<p className="text-sm text-ink-2">
					Consultá cuándo se registró por última vez un trabajo de aceite,
					frenos o batería. Una revisión no implica que se haya reemplazado la
					pieza.
				</p>
			</CardHeader>
			<CardContent>
				{plan.isPending ? (
					<Skeleton className="h-36" aria-label="Cargando últimos servicios…" />
				) : plan.isError ? (
					<Alert variant="destructive">
						<AlertDescription>
							No pudimos cargar los últimos servicios.{" "}
							<Button variant="link" onClick={() => plan.refetch()}>
								Reintentar
							</Button>
						</AlertDescription>
					</Alert>
				) : (
					<>
						<dl className="grid gap-3 sm:grid-cols-3">
							{items
								.filter((item) => featured.includes(item.category))
								.map((item) => (
									<LastService key={item.category} item={item} />
								))}
						</dl>
						<details className="mt-4 rounded-lg border p-3">
							<summary className="min-h-6 cursor-pointer text-sm font-medium">
								Ver otras categorías
							</summary>
							<dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
								{items
									.filter((item) => !featured.includes(item.category))
									.map((item) => (
										<LastService key={item.category} item={item} />
									))}
							</dl>
						</details>
						{items.every((item) => !item.last_performed_on) && (
							<Button
								className="mt-4"
								type="button"
								variant="outline"
								onClick={onAddService}
							>
								Registrar mi último servicio
							</Button>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}

function LastService({
	item,
}: {
	item: components["schemas"]["OwnerMaintenanceItem"];
}) {
	return (
		<div className="min-w-0 rounded-lg bg-muted/60 p-4">
			<dt className="text-sm font-semibold">{item.label}</dt>
			<dd className="mt-2 space-y-1 text-sm">
				{item.last_performed_on ? (
					<>
						<p className="font-medium">{day(item.last_performed_on)}</p>
						<p className="text-xs text-ink-3">
							{item.last_odometer_km != null
								? km(item.last_odometer_km)
								: "Sin kilometraje registrado"}
						</p>
						<p className="break-words text-xs text-ink-2">
							{item.last_summary}
						</p>
					</>
				) : (
					<p className="text-ink-3">Sin servicio registrado</p>
				)}
			</dd>
		</div>
	);
}
