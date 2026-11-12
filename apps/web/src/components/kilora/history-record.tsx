import type { components } from "@kilora/contracts";
import { categoryLabels } from "@/lib/domain";
import { money } from "@/lib/format";

export function HistoryItems({
	items,
	appearance = "plain",
}: {
	items: components["schemas"]["HistoryItem"][];
	appearance?: "plain" | "categorized";
}) {
	const categorized = appearance === "categorized";
	if (categorized && !items.length) return null;
	return (
		<ul
			className={
				categorized
					? "mt-2.5 divide-y rounded-md border bg-background/50 text-[13px]"
					: "mt-3 space-y-1"
			}
		>
			{items.map((item, index) => (
				<li
					// biome-ignore lint/suspicious/noArrayIndexKey: history items have no IDs and are immutable.
					key={index}
					className={
						categorized
							? "flex items-center justify-between gap-3 px-3 py-1.5"
							: "flex justify-between gap-4 text-sm"
					}
				>
					<span className={categorized ? "min-w-0" : undefined}>
						{categorized ? item.description || item.name : item.description}
						{item.brand && (
							<span className="ml-1 text-ink-3">· {item.brand}</span>
						)}
						{categorized && item.category && (
							<span className="ml-2 rounded bg-secondary px-1.5 py-px text-[10.5px] font-medium text-ink-2">
								{categoryLabels[item.category]}
							</span>
						)}
					</span>
					{(!categorized || item.price) && (
						<span
							className={
								categorized ? "font-mono text-xs tabular-nums" : undefined
							}
						>
							{item.price && money(item.price)}
						</span>
					)}
				</li>
			))}
		</ul>
	);
}
