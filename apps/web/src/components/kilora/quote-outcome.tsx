import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const outcomes = {
	pendiente: {
		label: "Pendiente",
		className: "bg-secondary text-ink-2",
		dot: "bg-ink-3",
	},
	acepto: { label: "Aceptó", className: "bg-ok-soft text-ok", dot: "bg-ok" },
	rechazo: {
		label: "Rechazó",
		className: "bg-warn-soft text-warn",
		dot: "bg-warn",
	},
	no_respondio: {
		label: "No respondió",
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
			{item.label}
		</Badge>
	);
}
