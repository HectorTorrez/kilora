import type { components } from "@kilora/contracts";
import { categoryLabels, trackedCategories } from "@/lib/domain";

export function lastByCategory(
	records: components["schemas"]["HistoryRecord"][],
) {
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
