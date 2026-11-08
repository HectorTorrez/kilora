import type { components } from "@kilora/contracts";
import { createApiClient } from "@kilora/contracts";
import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { api, apiError } from "./api";

const serverMe = createServerFn({ method: "GET" }).handler(async () => {
	const { getRequest } = await import("@tanstack/react-start/server");
	const request = getRequest();
	const baseUrl = import.meta.env.VITE_API_URL || new URL(request.url).origin;
	const client = createApiClient(baseUrl, (input, init) => {
		const headers = new Headers(init?.headers);
		const cookie = request.headers.get("cookie");
		if (cookie) headers.set("cookie", cookie);
		return fetch(input, { ...init, headers });
	});
	const { data, error, response } = await client.GET("/api/v1/auth/me");
	if (response.status === 401) return null;
	if (error) throw apiError(error);
	return data ?? null;
});
async function getMe() {
	if (import.meta.env.SSR) return serverMe();
	const { data, error, response } = await api.GET("/api/v1/auth/me");
	if (response.status === 401) return null;
	if (error) throw apiError(error);
	return data ?? null;
}
export const meQuery = () =>
	queryOptions({ queryKey: ["me"], queryFn: getMe, retry: false });
export const useMe = () => useQuery(meQuery());
type Schemas = components["schemas"];
export function useLogin() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (body: Schemas["Credentials"]) => {
			const { error } = await api.POST("/api/v1/auth/login", { body });
			if (error) throw apiError(error);
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
	});
}
export function useRegister() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (body: Schemas["Register"]) => {
			const { error } = await api.POST("/api/v1/auth/register", { body });
			if (error) throw apiError(error);
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
	});
}
export function useLogout() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			const { error } = await api.POST("/api/v1/auth/logout");
			if (error) throw apiError(error);
		},
		onSuccess: () => {
			qc.setQueryData(["me"], null);
			qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
		},
	});
}
export function useForgotPassword() {
	return useMutation({
		mutationFn: async (body: Schemas["Email"]) => {
			const { error } = await api.POST("/api/v1/auth/forgot-password", {
				body,
			});
			if (error) throw apiError(error);
		},
	});
}
export function useResetPassword() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (body: Schemas["ResetPassword"]) => {
			const { error } = await api.POST("/api/v1/auth/reset-password", { body });
			if (error) throw apiError(error);
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
	});
}
export function useVerifyEmail() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (body: Schemas["Token"]) => {
			const { error } = await api.POST("/api/v1/auth/verify-email", { body });
			if (error) throw apiError(error);
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
	});
}
export function useCreateWorkshop() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (body: Schemas["CreateWorkshop"]) => {
			const { error } = await api.POST("/api/v1/workshops", { body });
			if (error) throw apiError(error);
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
	});
}
