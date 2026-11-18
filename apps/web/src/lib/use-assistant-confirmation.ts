import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { createCounterQuoteAction } from "@/features/taller/quotes";
import { ApiError, errorMessage } from "@/lib/api";
import type { AssistantEvent } from "@/lib/assistant";
import { quoteCode } from "@/lib/format";
import { DuplicateServiceError, ownerActions } from "@/lib/owner";

type Proposal = NonNullable<AssistantEvent["proposal"]>;

/**
 * Guarda el borrador que propuso el asistente. `onSaved` recibe el aviso
 * final y retira el borrador: tras guardarse, o cuando un fallo del servidor
 * deja dudas de si se guardó (reintentar podría duplicarlo). Un rechazo de
 * validación conserva el borrador y queda en `error` para reintentar.
 */
export function useAssistantConfirmation(
	proposal: AssistantEvent["proposal"],
	mode: "taller" | "propietario",
	workshopId: string | undefined,
	onSaved: (message: string) => void,
) {
	const queryClient = useQueryClient();
	const savingRef = useRef(false);
	const [saving, setSaving] = useState(false);
	// Ligado al borrador: un borrador nuevo descarta avisos del anterior.
	const [review, setReview] = useState<{
		proposal: Proposal;
		duplicate?: DuplicateServiceError;
		error?: string;
	} | null>(null);
	const current = review && review.proposal === proposal ? review : null;
	const duplicate = current?.duplicate ?? null;
	const confirmProposal = async (allowDuplicate = false) => {
		if (!proposal || savingRef.current || (allowDuplicate && !duplicate))
			return;
		savingRef.current = true;
		setSaving(true);
		setReview(null);
		try {
			let result: string;
			let queryKey: string[];
			if (
				"quote" in proposal &&
				proposal.workshop_id === workshopId &&
				mode === "taller"
			) {
				const quote = await createCounterQuoteAction(proposal.workshop_id)(
					proposal.quote,
				);
				result = `Cotización ${quoteCode(quote.number)} guardada.`;
				queryKey = ["workshop", proposal.workshop_id];
			} else if ("service" in proposal && mode === "propietario") {
				await ownerActions.manual(proposal.vehicle_id, {
					...proposal.service,
					allow_duplicate: allowDuplicate,
				});
				result = "Servicio guardado en el historial.";
				queryKey = ["owner"];
			} else return;
			onSaved(result);
			void queryClient.invalidateQueries({ queryKey });
		} catch (error) {
			if (error instanceof DuplicateServiceError) {
				setReview({ proposal, duplicate: error });
			} else if (error instanceof ApiError && error.status < 500) {
				setReview({ proposal, error: errorMessage(error) });
			} else {
				onSaved(
					"No pudimos verificar si se guardó. Revisá los registros antes de volver a intentarlo.",
				);
			}
		} finally {
			savingRef.current = false;
			setSaving(false);
		}
	};
	return {
		saving,
		duplicate,
		error: current?.error ?? null,
		confirmProposal,
		cancelDuplicate: () => setReview(null),
	};
}
