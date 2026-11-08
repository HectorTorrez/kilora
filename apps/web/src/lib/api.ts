import { createApiClient } from "@kilora/contracts";

export const api = createApiClient(import.meta.env.VITE_API_URL ?? "");
export function apiError(error: { error: string } | undefined): Error {
	return new Error(
		error?.error ?? "No se pudo completar la solicitud. Intenta de nuevo.",
	);
}
