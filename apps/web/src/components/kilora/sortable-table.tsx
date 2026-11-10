import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDirection } | null;
type SortValue = string | number | null | undefined;

const collator = new Intl.Collator("es", {
	numeric: true,
	sensitivity: "base",
});

function compare(a: SortValue, b: SortValue) {
	if (typeof a === "number" && typeof b === "number") return a - b;
	return collator.compare(String(a), String(b));
}

/**
 * Ordena en el navegador las filas que ya están cargadas. Cada clic en una
 * columna pasa por ascendente → descendente → orden original. Los valores
 * vacíos siempre quedan al final.
 */
export function useTableSort<T, K extends string>(
	rows: T[],
	columns: Record<K, (row: T) => SortValue>,
) {
	const [sort, setSort] = useState<SortState<K>>(null);
	let sorted = rows;
	if (sort) {
		const value = columns[sort.key];
		const sign = sort.dir === "asc" ? 1 : -1;
		sorted = [...rows].sort((left, right) => {
			const a = value(left);
			const b = value(right);
			const emptyA = a === null || a === undefined || a === "";
			const emptyB = b === null || b === undefined || b === "";
			if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
			return compare(a, b) * sign;
		});
	}
	const toggle = (key: K) =>
		setSort((current) =>
			current?.key !== key
				? { key, dir: "asc" }
				: current.dir === "asc"
					? { key, dir: "desc" }
					: null,
		);
	return { rows: sorted, sort, toggle };
}

/** Encabezado de columna que ordena la tabla al hacer clic. */
export function SortableHead<K extends string>({
	children,
	sortKey,
	sort,
	onSort,
	align = "left",
	className,
}: {
	children: ReactNode;
	sortKey: K;
	sort: SortState<K>;
	onSort: (key: K) => void;
	align?: "left" | "right";
	className?: string;
}) {
	const dir = sort?.key === sortKey ? sort.dir : null;
	const Icon =
		dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ChevronsUpDown;
	return (
		<TableHead
			className={className}
			aria-sort={
				dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"
			}
		>
			<button
				type="button"
				onClick={() => onSort(sortKey)}
				title={
					dir === "asc"
						? "Orden ascendente. Clic para descendente"
						: dir === "desc"
							? "Orden descendente. Clic para quitar el orden"
							: "Ordenar"
				}
				className={cn(
					"-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 font-medium hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
					align === "right" && "flex-row-reverse",
					dir ? "text-foreground" : "text-inherit",
				)}
			>
				{children}
				<Icon
					className={cn("size-3.5 shrink-0", dir ? "text-seal" : "text-ink-3")}
					aria-hidden="true"
				/>
			</button>
		</TableHead>
	);
}
