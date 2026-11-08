import type { components } from "@kilora/contracts";
import {
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

type S = components["schemas"];
const serverGet = createServerFn({ method: "GET" })
	.validator((path: string) => {
		if (
			!path.startsWith("/api/v1/me/vehicles") &&
			!path.startsWith("/api/v1/public/invitations/") &&
			!path.startsWith("/api/v1/workshops/")
		)
			throw new Error("Ruta inválida");
		return path;
	})
	.handler(async ({ data: path }) => {
		const { getRequest } = await import("@tanstack/react-start/server");
		const request = getRequest();
		const response = await fetch(
			new URL(path, import.meta.env.VITE_API_URL || request.url),
			{ headers: { cookie: request.headers.get("cookie") || "" } },
		);
		if (!response.ok) throw new Error("No se pudo cargar la información.");
		return response.json();
	});
export async function get<T>(path: string): Promise<T> {
	if (import.meta.env.SSR) return serverGet({ data: path });
	const response = await fetch(path);
	if (!response.ok) throw new Error("No se pudo cargar la información.");
	return response.json();
}
async function post<T>(path: string, body: unknown): Promise<T> {
	const response = await fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const data = await response.json();
	if (!response.ok)
		throw new Error(data.error || "No se pudo completar la solicitud.");
	return data;
}
const base = (id: string) => `/api/v1/me/vehicles/${encodeURIComponent(id)}`;
export const ownerVehiclesQuery = () =>
	queryOptions({
		queryKey: ["owner", "vehicles"],
		queryFn: () => get<S["OwnerVehicle"][]>("/api/v1/me/vehicles"),
	});
export const ownerVehicleQuery = (id: string) =>
	queryOptions({
		queryKey: ["owner", "vehicle", id],
		queryFn: () => get<S["OwnerVehicle"]>(base(id)),
	});
export const ownerHistoryQuery = (id: string) =>
	queryOptions({
		queryKey: ["owner", "history", id],
		queryFn: () => get<S["History"]>(`${base(id)}/history`),
	});
export const invitationQuery = (token: string) =>
	queryOptions({
		queryKey: ["invitation", token],
		queryFn: () =>
			get<S["PublicInvitation"]>(
				`/api/v1/public/invitations/${encodeURIComponent(token)}`,
			),
		retry: false,
	});
const invitationsPath = (wid: string, vid: string) =>
	`/api/v1/workshops/${encodeURIComponent(wid)}/vehicles/${encodeURIComponent(vid)}/invitations`;
export const invitationsQuery = (wid: string, vid: string) =>
	queryOptions({
		queryKey: ["invitations", wid, vid],
		queryFn: () => get<S["Invitation"][]>(invitationsPath(wid, vid)),
	});
export const ownerActions = {
	create: (body: S["OwnerVehicleInput"]) =>
		post<S["OwnerVehicle"]>("/api/v1/me/vehicles", body),
	manual: (id: string, body: S["ManualHistoryInput"]) =>
		post(`${base(id)}/history`, body),
	correction: (id: string, body: S["CorrectionInput"]) =>
		post(`${base(id)}/corrections`, body),
	odometer: (id: string, km: number) =>
		post<{ warning?: string }>(`${base(id)}/odometer`, { km }),
	accept: (token: string) =>
		post<S["OwnerVehicle"]>(
			`/api/v1/invitations/${encodeURIComponent(token)}/accept`,
			{ consent: true },
		),
	invite: (wid: string, vid: string, email: string) =>
		post<S["InvitationResult"]>(invitationsPath(wid, vid), { email }),
};
export function useOwnerMutation<T, R>(fn: (input: T) => Promise<R>) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: ["owner"] });
			void qc.invalidateQueries({ queryKey: ["invitations"] });
		},
	});
}
