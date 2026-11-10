import { Badge } from "@/components/ui/badge";
import { quoteOutcomeActions, quoteOutcomeLabels } from "@/lib/domain";
import { date } from "@/lib/format";
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

type Outcome = keyof typeof outcomes;

export const outcomeDot = (outcome: Outcome) => outcomes[outcome].dot;

/** Selector de la respuesta del cliente, igual en cotizaciones de orden y de mostrador. */
export function QuoteOutcomePicker({
	value,
	markedAt,
	pending,
	onChange,
}: {
	value: Outcome;
	markedAt?: string | null;
	pending?: boolean;
	onChange: (value: Exclude<Outcome, "pendiente">) => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-secondary/50 p-3">
			<span className="text-[13px] font-medium">
				¿Qué respondió el cliente?
			</span>
			<fieldset className="inline-flex rounded-md border bg-card p-0.5">
				<legend className="sr-only">Respuesta del cliente</legend>
				{quoteOutcomeActions.map(([option, label]) => (
					<button
						key={option}
						type="button"
						aria-pressed={value === option}
						disabled={pending}
						onClick={() => onChange(option)}
						className={cn(
							"rounded px-2.5 py-1 text-[12.5px] font-medium text-ink-3 hover:text-foreground disabled:opacity-60",
							value === option && outcomes[option].className,
						)}
					>
						{label}
					</button>
				))}
			</fieldset>
			{markedAt && value !== "pendiente" ? (
				<span className="text-[11.5px] text-ink-3">
					Marcado el {date(markedAt)}
				</span>
			) : null}
		</div>
	);
}
