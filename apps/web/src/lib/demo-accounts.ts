import { type components, createApiClient } from "@kilora/contracts";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { api } from "./api";

type DemoInfo = components["schemas"]["DemoInfo"];
const disabled: DemoInfo = { enabled: false, accounts: [] };

const serverDemo = createServerFn({ method: "GET" }).handler(async () => {
	const { getRequest } = await import("@tanstack/react-start/server");
	const baseUrl =
		import.meta.env.VITE_API_URL || new URL(getRequest().url).origin;
	const { data, error } = await createApiClient(baseUrl).GET(
		"/api/v1/public/demo",
	);
	if (error) throw new Error("No se pudo cargar la demo");
	return data ?? disabled;
});

async function getDemo(): Promise<DemoInfo> {
	try {
		if (import.meta.env.SSR) return await serverDemo();
		const { data, error } = await api.GET("/api/v1/public/demo");
		if (error) return disabled;
		return data ?? disabled;
	} catch {
		return disabled;
	}
}

export const demoQuery = () =>
	queryOptions({ queryKey: ["demo"], queryFn: getDemo, retry: false });
