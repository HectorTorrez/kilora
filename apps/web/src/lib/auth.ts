import type { components } from "@kilora/contracts";
import {
	queryOptions,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { api, apiError } from "./api";
import { clearServiceDrafts } from "./service-drafts";

async function getMe() {
	const { data, error, response } = await api.GET("/api/v1/auth/me");
	if (response.status === 401) return null;
	if (error) throw apiError(error, response.status);
	return data ?? null;
}
export const meQuery = () =>
	queryOptions({ queryKey: ["me"], queryFn: getMe, retry: false });
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
		onSuccess: async () => {
			await clearServiceDrafts().catch(() => undefined);
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
export function useResendVerification() {
	return useMutation({
		mutationFn: async (body: Schemas["Email"]) => {
			const { error } = await api.POST("/api/v1/auth/resend-verification", {
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
			const { data, error } = await api.POST("/api/v1/workshops", { body });
			if (error) throw apiError(error);
			return data;
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
	});
}

export function useUpdateProfile() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (body: Schemas["UpdateProfile"]) => {
			const { error, response } = await api.PATCH("/api/v1/auth/me", { body });
			if (!response.ok) throw apiError(error, response.status);
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
	});
}

export function useAccountCredentials() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (input: {
			deleting: boolean;
			current_password: string;
			password?: string;
		}) => {
			const result = input.deleting
				? await api.DELETE("/api/v1/auth/me", {
						body: { current_password: input.current_password },
					})
				: await api.POST("/api/v1/auth/change-password", {
						body: {
							current_password: input.current_password,
							password: input.password ?? "",
						},
					});
			if (!result.response.ok)
				throw apiError(result.error, result.response.status);
		},
		onSuccess: async () => {
			await clearServiceDrafts().catch(() => undefined);
			qc.setQueryData(["me"], null);
			qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
		},
	});
}

export function useUpdateEmailPreferences() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (enabled: boolean) => {
			const { error, response } = await api.PATCH(
				"/api/v1/auth/me/email-preferences",
				{
					body: { maintenance_emails_enabled: enabled },
				},
			);
			if (!response.ok) throw apiError(error, response.status);
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
	});
}
