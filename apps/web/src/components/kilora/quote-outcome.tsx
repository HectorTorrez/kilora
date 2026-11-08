import { Badge } from "@/components/ui/badge";
import { quoteOutcomeLabels } from "@/lib/domain";
import { cn } from "@/lib/utils";

const outcomes = {
	pendiente: {
		className: "bg-secondary text-ink-2",
		dot: "bg-ink-3",
	},
	acepto: { className: "bg-ok-soft text-ok", dot: "bg-ok" },
	rechazo: {
		className: "bg-warn-soft text-warn",
		dot: "bg-warn",
	},
	no_respondio: {
		className: "bg-secondary text-ink-2",
		dot: "bg-ink-3",
	},
} as const;

export function QuoteOutcomeBadge({
	outcome,
	className,
}: {
	outcome: keyof typeof outcomes;
	className?: string;
}) {
	const item = outcomes[outcome];
	return (
		<Badge
			variant="secondary"
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold whitespace-nowrap",
				item.className,
				className,
			)}
		>
			<span className={cn("size-1.5 rounded-full", item.dot)} />
			{quoteOutcomeLabels[outcome]}
		</Badge>
	);
}
