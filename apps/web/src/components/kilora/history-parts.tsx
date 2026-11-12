import type { components } from "@kilora/contracts";
import { day, km as formatKm } from "@/lib/format";
import { isPartKey, type PartKey } from "@/lib/part-catalog";
import type { BodyType } from "@/lib/vehicle-plans";
import { PartButton } from "./car-anatomy";

type HistoryRecord = components["schemas"]["HistoryRecord"];

/** Piezas del catálogo que tocó un servicio, sin repetir. */
export function recordParts(record: HistoryRecord): PartKey[] {
	return [
		...new Set(record.items.map((i) => i.part).filter((p) => isPartKey(p))),
	];
}

export function HistoryPartsStrip({
	record,
	bodyType,
	onOpen,
}: {
	record: HistoryRecord;
	bodyType?: BodyType | null;
	onOpen: (part: PartKey, record: HistoryRecord) => void;
}) {
	const parts = recordParts(record);
	if (!parts.length) return null;
	return (
		<div className="mt-3 grid gap-2 sm:grid-cols-2">
			{parts.map((part) => (
				<PartButton
					key={part}
					part={part}
					bodyType={bodyType}
					onOpen={(p) => onOpen(p, record)}
				/>
			))}
		</div>
	);
}

/** Cuándo se cambió esta pieza en el vehículo, del más reciente al más viejo. */
export function PartHistory({
	part,
	records,
}: {
	part: PartKey;
	records: HistoryRecord[];
}) {
	const changes = records
		.filter((r) => r.items.some((i) => i.part === part))
		.sort((a, b) => b.performed_on.localeCompare(a.performed_on));
	return (
		<div className="rounded-lg border p-3 text-sm">
			<p className="mb-2 text-[11px] font-bold tracking-wider text-seal uppercase">
				En tu vehículo
			</p>
			{changes.length === 0 ? (
				<p className="text-ink-3">Todavía no hay cambios registrados.</p>
			) : (
				<ol className="space-y-1.5">
					{changes.slice(0, 5).map((r, i) => (
						<li key={r.id} className="flex justify-between gap-3">
							<span className={i ? "text-ink-3" : "font-medium"}>
								{i === 0 ? "Último cambio · " : ""}
								{day(r.performed_on)}
							</span>
							<span className="text-right text-ink-3">
								{[
									r.odometer_km != null ? formatKm(r.odometer_km) : null,
									r.workshop_name,
								]
									.filter(Boolean)
									.join(" · ")}
							</span>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}
