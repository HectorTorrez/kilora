import type { components } from "@kilora/contracts";
import { day, km, todayISO } from "@/lib/format";

type Rec = components["schemas"]["Recommendation"];
export type Urgency = "vencida" | "proxima" | "programada";

export function urgency(rec: Rec, currentKm?: number | null): Urgency {
	const today = todayISO();
	const soon = new Date(`${today}T00:00:00Z`);
	soon.setUTCDate(soon.getUTCDate() + 30);
	const soonISO = soon.toISOString().slice(0, 10);
	const kmKnown = currentKm != null && rec.due_km != null;
	if (
		(rec.due_date && rec.due_date < today) ||
		(kmKnown && (currentKm as number) >= (rec.due_km as number))
	)
		return "vencida";
	if (
		(rec.due_date && rec.due_date <= soonISO) ||
		(kmKnown && (rec.due_km as number) - (currentKm as number) <= 1000)
	)
		return "proxima";
	return "programada";
}

export const dueText = (rec: Rec) =>
	[rec.due_date && day(rec.due_date), rec.due_km != null && km(rec.due_km)]
		.filter(Boolean)
		.join(" o ");
