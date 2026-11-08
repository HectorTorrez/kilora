import type { components } from "@kilora/contracts";
import { BadgeCheck, EyeOff, History as HistoryIcon, Lock } from "lucide-react";
import { EmptyState } from "@/components/kilora/workshop-ui";
import { categoryLabels, trackedCategories } from "@/lib/domain";
import { day, km, money } from "@/lib/format";

type S = components["schemas"];

export function lastByCategory(records: S["HistoryRecord"][]) {
	const sorted = [...records].sort((a, b) =>
		b.performed_on.localeCompare(a.performed_on),
	);
	return trackedCategories.map((category) => {
		const record = sorted.find((r) =>
			r.items.some((i) => i.category === category),
		);
		return {
			category,
			label: categoryLabels[category],
			record,
			item: record?.items.find((i) => i.category === category),
		};
	});
}

export function HistoryTimeline({
	records,
}: {
	records: S["HistoryRecord"][];
}) {
	if (!records.length)
		return (
			<EmptyState
				icon={HistoryIcon}
				title="Sin historial publicado"
				description="Al marcar una orden como lista, el servicio se publica acá de forma permanente."
			/>
		);
	return (
		<ol className="relative space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-line">
			{records.map((r) => {
				const blind = r.source === "taller" && !r.workshop_name;
				return (
					<li key={r.id} className="relative pl-6">
						<span
							className={
								blind
									? "absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-ink-3 bg-card"
									: "absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-seal bg-seal-soft"
							}
						/>
						<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[11.5px] text-ink-3">
							<span>{day(r.performed_on)}</span>
							<span aria-hidden="true">·</span>
							<span>{km(r.odometer_km)}</span>
						</div>
						<p className="mt-1 text-[14px] font-semibold">{r.summary}</p>
						<p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
							{blind ? (
								<>
									<EyeOff className="size-3.5" />
									Otro taller · vista ciega, sin costos ni notas
								</>
							) : r.source === "propietario" ? (
								"Registrado por el propietario"
							) : (
								<>
									<span className="font-medium text-ink-2">
										{r.workshop_name}
									</span>
									{r.workshop_verified_at && (
										<span className="inline-flex items-center gap-0.5 font-semibold text-seal">
											<BadgeCheck className="size-3.5" />
											Verificado
										</span>
									)}
								</>
							)}
						</p>
						{r.items.length > 0 && (
							<ul className="mt-2.5 divide-y rounded-md border bg-background/50 text-[13px]">
								{r.items.map((item, i) => (
									<li
										// biome-ignore lint/suspicious/noArrayIndexKey: items have no IDs.
										key={i}
										className="flex items-center justify-between gap-3 px-3 py-1.5"
									>
										<span className="min-w-0">
											{item.description || item.name}
											{item.category && (
												<span className="ml-2 rounded bg-secondary px-1.5 py-px text-[10.5px] font-medium text-ink-2">
													{categoryLabels[item.category]}
												</span>
											)}
										</span>
										{item.price && (
											<span className="font-mono text-xs tabular-nums">
												{money(item.price)}
											</span>
										)}
									</li>
								))}
							</ul>
						)}
						{(r.total || r.internal_cost) && (
							<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
								{r.total && (
									<span>
										Total{" "}
										<strong className="font-mono tabular-nums">
											{money(r.total)}
										</strong>
									</span>
								)}
								{r.internal_cost && (
									<span className="inline-flex items-center gap-1 text-ink-3">
										<Lock className="size-3" />
										Costo interno {money(r.internal_cost)}
									</span>
								)}
							</div>
						)}
						{r.workshop_notes && (
							<p className="mt-2 text-xs text-ink-2">
								<span className="font-medium">Notas:</span> {r.workshop_notes}
							</p>
						)}
						{r.internal_notes && (
							<p className="mt-1 inline-flex items-start gap-1 text-xs text-ink-3">
								<Lock className="mt-0.5 size-3 shrink-0" />
								{r.internal_notes}
							</p>
						)}
						{!!r.corrections?.length && (
							<p className="mt-2 text-xs font-medium text-warn">
								{r.corrections.length === 1
									? "1 corrección registrada"
									: `${r.corrections.length} correcciones registradas`}
							</p>
						)}
					</li>
				);
			})}
		</ol>
	);
}
