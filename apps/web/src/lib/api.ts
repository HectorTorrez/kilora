import { createApiClient } from "@kilora/contracts";
import { createServerFn } from "@tanstack/react-start";

const fallbackMessage = "No se pudo completar la solicitud. Intenta de nuevo.";
const ssrBaseUrl = "http://kilora.invalid";

const serverGet = createServerFn({ method: "GET" })
	.validator((path: string) => {
		if (!path.startsWith("/api/v1/")) throw new Error("Ruta inválida");
		return path;
	})
	.handler(async ({ data: path }) => {
		const { getRequest } = await import("@tanstack/react-start/server");
		const request = getRequest();
		const response = await fetch(
			new URL(path, import.meta.env.VITE_API_URL || request.url),
			{ headers: { cookie: request.headers.get("cookie") || "" } },
		);
		return { status: response.status, body: await response.text() };
	});

async function ssrFetch(input: RequestInfo | URL) {
	const url = new URL(input instanceof Request ? input.url : String(input));
	const { status, body } = await serverGet({
		data: url.pathname + url.search,
	});
	return new Response(status === 204 ? null : body, {
		status,
		headers: { "content-type": "application/json" },
	});
}

export const api = import.meta.env.SSR
	? createApiClient(ssrBaseUrl, ssrFetch)
	: createApiClient(import.meta.env.VITE_API_URL ?? "");

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

export function apiError(
	error: { error?: string } | undefined,
	status = 0,
): ApiError {
	return new ApiError(error?.error ?? fallbackMessage, status);
}

export function unwrap<T>(result: {
	data?: T;
	error?: { error?: string };
	response: Response;
}): T {
	if (result.error || !result.response.ok) {
		throw apiError(result.error, result.response.status);
	}
	return result.data as T;
}

export function errorMessage(error: unknown): string {
	if (typeof error === "string" && error) return error;
	return error instanceof Error && error.message
		? error.message
		: fallbackMessage;
}

export const isNotFound = (error: unknown) =>
	error instanceof ApiError && error.status === 404;
