import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, errorMessage, unwrap } from "@/lib/api";

/**
 * "¿Qué me hicieron?": la IA resume el servicio en palabras simples. Los
 * registros no cambian (solo se agregan correcciones), así que la respuesta
 * se guarda mientras la página siga abierta.
 */
export function ServiceExplanation({
	vehicleID,
	recordID,
	corrections = 0,
}: {
	vehicleID: string;
	recordID: string;
	corrections?: number;
}) {
	const [open, setOpen] = useState(false);
	const explanation = useQuery({
		queryKey: ["owner", "explain", vehicleID, recordID, corrections],
		queryFn: async () =>
			unwrap(
				await api.POST(
					"/api/v1/me/vehicles/{vehicleID}/history/{recordID}/ai/explain",
					{ params: { path: { vehicleID, recordID } } },
				),
			),
		enabled: open,
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
	if (!open)
		return (
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="mt-3 -ml-2 text-seal"
				onClick={() => setOpen(true)}
			>
				<Sparkles className="size-4" aria-hidden />
				¿Qué me hicieron?
			</Button>
		);
	return (
		<div className="mt-3 rounded-md bg-seal-soft/60 p-3 text-sm">
			<p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-seal">
				<Sparkles className="size-3.5" aria-hidden />
				En palabras simples
			</p>
			{explanation.isPending ? (
				<p className="text-ink-3">Leyendo el servicio…</p>
			) : explanation.isError ? (
				<p className="text-destructive">
					{errorMessage(explanation.error)}{" "}
					<button
						type="button"
						className="underline"
						onClick={() => explanation.refetch()}
					>
						Reintentar
					</button>
				</p>
			) : (
				<p className="leading-relaxed">{explanation.data.explanation}</p>
			)}
		</div>
	);
}
