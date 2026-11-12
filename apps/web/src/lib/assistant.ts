import type { components } from "@kilora/contracts";
import { ApiError, apiError } from "@/lib/api";

export type AssistantEvent = components["schemas"]["AssistantEvent"];
export type AssistantSource = components["schemas"]["AssistantSource"];
export type AssistantTurn = { role: "user" | "assistant"; content: string };

/**
 * Envía la conversación y entrega cada evento del stream SSE a medida que
 * llega. openapi-fetch no expone streams, así que se usa fetch directo.
 */
export async function streamAssistant(
	body: { messages: AssistantTurn[]; workshop_id?: string; page?: string },
	onEvent: (event: AssistantEvent) => void,
	signal: AbortSignal,
) {
	const response = await fetch(
		`${import.meta.env.VITE_API_URL ?? ""}/api/v1/assistant/chat`,
		{
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal,
		},
	);
	if (!response.ok || !response.body) {
		const error = await response.json().catch(() => undefined);
		throw apiError(error, response.status);
	}
	if (!response.headers.get("content-type")?.includes("text/event-stream"))
		throw new ApiError(interrupted, response.status);
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let finished = false;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let boundary = buffer.indexOf("\n\n");
		while (boundary !== -1) {
			const frame = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary + 2);
			const data = frame
				.split("\n")
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice(5).trimStart())
				.join("\n");
			if (data) {
				const event = JSON.parse(data) as AssistantEvent;
				if (event.type === "error")
					throw new ApiError(event.text ?? "Error del asistente", 502);
				if (event.type === "done") finished = true;
				onEvent(event);
			}
			boundary = buffer.indexOf("\n\n");
		}
	}
	// Sin "done" la respuesta quedó incompleta (conexión cortada, proxy, API
	// desactualizado): mejor un error visible que un mensaje vacío.
	if (!finished) throw new ApiError(interrupted, 502);
}

const interrupted =
	"La respuesta del asistente se interrumpió. Intenta de nuevo.";
