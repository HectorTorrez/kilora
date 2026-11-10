import {
	endOfMonth,
	format,
	isValid,
	parse,
	startOfMonth,
	startOfYear,
	subDays,
	subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, X } from "lucide-react";
import { useState } from "react";
import type { DateRange as PickerRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Rango de fechas en formato AAAA-MM-DD; ambos extremos son inclusivos. */
export type DateRange = { from?: string; to?: string };

const ISO = "yyyy-MM-dd";
const toDate = (value?: string) => {
	if (!value) return undefined;
	const date = parse(value, ISO, new Date());
	return isValid(date) ? date : undefined;
};
const toISO = (date: Date) => format(date, ISO);
const label = (value: string) =>
	format(toDate(value) ?? new Date(), "d MMM yyyy", { locale: es }).replace(
		".",
		"",
	);

function presets(): { label: string; range: Required<DateRange> }[] {
	const today = toDate(todayISO()) ?? new Date();
	const lastMonth = subMonths(today, 1);
	return [
		{ label: "Hoy", range: { from: toISO(today), to: toISO(today) } },
		{
			label: "Ayer",
			range: { from: toISO(subDays(today, 1)), to: toISO(subDays(today, 1)) },
		},
		{
			label: "Últimos 7 días",
			range: { from: toISO(subDays(today, 6)), to: toISO(today) },
		},
		{
			label: "Últimos 30 días",
			range: { from: toISO(subDays(today, 29)), to: toISO(today) },
		},
		{
			label: "Este mes",
			range: { from: toISO(startOfMonth(today)), to: toISO(today) },
		},
		{
			label: "Mes pasado",
			range: {
				from: toISO(startOfMonth(lastMonth)),
				to: toISO(endOfMonth(lastMonth)),
			},
		},
		{
			label: "Este año",
			range: { from: toISO(startOfYear(today)), to: toISO(today) },
		},
	];
}

export function describeRange({ from, to }: DateRange) {
	if (from && to)
		return from === to ? label(from) : `${label(from)} – ${label(to)}`;
	if (from) return `Desde ${label(from)}`;
	if (to) return `Hasta ${label(to)}`;
	return "";
}

/** Filtro por rango de fechas para una columna de la tabla. */
export function DateRangeFilter({
	label: title,
	value,
	onChange,
}: {
	label: string;
	value: DateRange;
	onChange: (value: DateRange) => void;
}) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<PickerRange | undefined>();
	const active = !!(value.from || value.to);
	const options = presets();
	const today = toDate(todayISO()) ?? new Date();
	const apply = (range: DateRange) => {
		onChange(range);
		setOpen(false);
	};
	const selected: PickerRange | undefined =
		draft ??
		(active ? { from: toDate(value.from), to: toDate(value.to) } : undefined);

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				setDraft(undefined);
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className={cn(
						"h-10 gap-2 font-normal",
						!active && "border-dashed text-ink-2",
					)}
				>
					<CalendarDays className="size-4" />
					<span className="font-medium">{title}</span>
					{active && (
						<>
							<span className="h-4 w-px bg-border" aria-hidden="true" />
							<span className="rounded bg-seal-soft px-1.5 text-xs font-semibold text-seal">
								{describeRange(value)}
							</span>
						</>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-0">
				<div className="flex flex-col sm:flex-row">
					<ul className="flex gap-1 overflow-x-auto border-b p-2 sm:flex-col sm:border-r sm:border-b-0">
						{options.map((preset) => {
							const on =
								value.from === preset.range.from &&
								value.to === preset.range.to;
							return (
								<li key={preset.label}>
									<button
										type="button"
										aria-pressed={on}
										onClick={() => apply(preset.range)}
										className={cn(
											"w-full rounded-sm px-2.5 py-1.5 text-left text-sm whitespace-nowrap hover:bg-accent",
											on && "bg-seal-soft font-medium text-seal",
										)}
									>
										{preset.label}
									</button>
								</li>
							);
						})}
					</ul>
					<div>
						<Calendar
							mode="range"
							locale={es}
							numberOfMonths={2}
							defaultMonth={subMonths(selected?.from ?? today, 1)}
							disabled={{ after: today }}
							endMonth={today}
							selected={selected}
							onSelect={(range) => {
								setDraft(range);
								if (range?.from && range.to && draft?.from)
									apply({ from: toISO(range.from), to: toISO(range.to) });
							}}
						/>
						<div className="flex items-center justify-between gap-3 border-t px-3 py-2">
							<p className="text-xs text-ink-3">
								{draft?.from && !draft.to
									? "Elegí la fecha final"
									: draft?.from
										? describeRange({
												from: toISO(draft.from),
												to: draft.to && toISO(draft.to),
											})
										: "Elegí la fecha inicial y la final"}
							</p>
							<div className="flex gap-2">
								{draft?.from && (
									<Button
										size="sm"
										onClick={() =>
											apply({
												from: toISO(draft.from as Date),
												to: toISO(draft.to ?? (draft.from as Date)),
											})
										}
									>
										Aplicar
									</Button>
								)}
								{active && (
									<Button size="sm" variant="ghost" onClick={() => apply({})}>
										<X className="size-3.5" />
										Quitar
									</Button>
								)}
							</div>
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
