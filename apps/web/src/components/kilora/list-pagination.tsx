import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LIST_PAGE_SIZE } from "@/lib/pagination";
import { cn } from "@/lib/utils";

export function ListPagination({
	page,
	total,
	onPageChange,
	pending = false,
	pageSize = LIST_PAGE_SIZE,
	alwaysVisible = false,
	className,
}: {
	page: number;
	total: number | undefined;
	onPageChange: (page: number) => void;
	pending?: boolean;
	pageSize?: number;
	/** Mostrar la barra aunque no haya resultados. */
	alwaysVisible?: boolean;
	className?: string;
}) {
	const pages = Math.max(1, Math.ceil((total ?? 0) / pageSize));
	useEffect(() => {
		if (!pending && total !== undefined && page > pages) onPageChange(pages);
	}, [page, pages, total, pending, onPageChange]);
	if (!alwaysVisible && page === 1 && (total === undefined || total === 0))
		return null;
	const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
	const last = Math.min(page * pageSize, total ?? 0);
	return (
		<nav
			aria-label="Paginación"
			className={cn(
				"flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3",
				className,
			)}
		>
			<p className="text-xs text-ink-3" aria-live="polite">
				{total === undefined
					? pending
						? "Cargando resultados…"
						: null
					: `${first <= last ? `${first}–${last}` : "0"} de ${total} resultados`}
			</p>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={pending || page <= 1}
					onClick={() => onPageChange(page - 1)}
				>
					<ChevronLeft className="size-4" /> Anterior
				</Button>
				<span className="text-xs text-ink-3 tabular-nums">
					Página {page}
					{total === undefined ? "" : ` de ${pages}`}
				</span>
				<Button
					variant="outline"
					size="sm"
					disabled={pending || page >= pages}
					onClick={() => onPageChange(page + 1)}
				>
					Siguiente <ChevronRight className="size-4" />
				</Button>
			</div>
		</nav>
	);
}
