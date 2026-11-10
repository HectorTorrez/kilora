import { Check, ListFilter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type FacetOption<T extends string> = {
	value: T;
	label: string;
	count?: number;
	/** Clase de color para el punto (la misma del badge de estado). */
	dot?: string;
};

/**
 * Filtro desplegable para una columna de la tabla. Permite elegir uno o
 * varios valores; sin selección muestra todo.
 */
export function FacetFilter<T extends string>({
	label,
	options,
	selected,
	onChange,
	multiple = true,
	compact = false,
}: {
	label: string;
	options: FacetOption<T>[];
	selected: T[];
	onChange: (value: T[]) => void;
	multiple?: boolean;
	/** Solo el ícono, para ponerlo dentro del encabezado de la columna. */
	compact?: boolean;
}) {
	const chosen = options.filter((o) => selected.includes(o.value));
	const toggle = (value: T) => {
		if (!multiple) return onChange(selected.includes(value) ? [] : [value]);
		onChange(
			selected.includes(value)
				? selected.filter((v) => v !== value)
				: [...selected, value],
		);
	};
	return (
		<Popover>
			<PopoverTrigger asChild>
				{compact ? (
					<button
						type="button"
						aria-label={
							chosen.length
								? `Filtrar por ${label.toLowerCase()} (${chosen.length} elegidos)`
								: `Filtrar por ${label.toLowerCase()}`
						}
						title={
							chosen.length
								? chosen.map((o) => o.label).join(", ")
								: `Filtrar por ${label.toLowerCase()}`
						}
						className={cn(
							"relative inline-grid size-7 place-items-center rounded text-ink-3 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
							chosen.length > 0 &&
								"bg-seal-soft text-seal hover:bg-seal-soft hover:text-seal",
						)}
					>
						<ListFilter className="size-3.5" />
						{chosen.length > 0 && (
							<span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-seal font-mono text-[9.5px] font-semibold text-white">
								{chosen.length}
							</span>
						)}
					</button>
				) : (
					<Button
						variant="outline"
						className={cn(
							"h-10 gap-2 font-normal",
							!chosen.length && "border-dashed text-ink-2",
						)}
					>
						<ListFilter className="size-4" />
						<span className="font-medium">{label}</span>
						{chosen.length > 0 && (
							<>
								<span className="h-4 w-px bg-border" aria-hidden="true" />
								{chosen.length > 2 ? (
									<span className="rounded bg-seal-soft px-1.5 text-xs font-semibold text-seal">
										{chosen.length} elegidos
									</span>
								) : (
									chosen.map((o) => (
										<span
											key={o.value}
											className="rounded bg-seal-soft px-1.5 text-xs font-semibold text-seal"
										>
											{o.label}
										</span>
									))
								)}
							</>
						)}
					</Button>
				)}
			</PopoverTrigger>
			<PopoverContent align={compact ? "end" : "start"} className="w-60 p-1">
				<p className="px-2 pt-1.5 pb-1 text-xs font-medium text-ink-3">
					{multiple ? `Filtrar por ${label.toLowerCase()}` : label}
				</p>
				<ul aria-label={label}>
					{options.map((o) => {
						const on = selected.includes(o.value);
						return (
							<li key={o.value}>
								<button
									type="button"
									aria-pressed={on}
									onClick={() => toggle(o.value)}
									className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
								>
									<span
										className={cn(
											"grid size-4 shrink-0 place-items-center border border-input",
											multiple ? "rounded-[4px]" : "rounded-full",
											on && "border-seal bg-seal text-white",
										)}
									>
										{on && <Check className="size-3" />}
									</span>
									{o.dot && (
										<span
											className={cn("size-2 shrink-0 rounded-full", o.dot)}
											aria-hidden="true"
										/>
									)}
									<span className="flex-1 truncate">{o.label}</span>
									{o.count !== undefined && (
										<span className="font-mono text-xs text-ink-3 tabular-nums">
											{o.count}
										</span>
									)}
								</button>
							</li>
						);
					})}
				</ul>
				{chosen.length > 0 && (
					<>
						<div className="my-1 h-px bg-border" />
						<button
							type="button"
							onClick={() => onChange([])}
							className="w-full rounded-sm px-2 py-1.5 text-center text-sm hover:bg-accent"
						>
							Limpiar filtro
						</button>
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}

/** Botón para quitar todos los filtros de una lista a la vez. */
export function ClearFilters({
	show,
	onClear,
}: {
	show: boolean;
	onClear: () => void;
}) {
	if (!show) return null;
	return (
		<Button variant="ghost" className="h-10 px-3 text-ink-2" onClick={onClear}>
			Limpiar
			<X className="size-4" />
		</Button>
	);
}
