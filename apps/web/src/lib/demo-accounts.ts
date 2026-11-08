import type { components } from "@kilora/contracts";
import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";

type DemoInfo = components["schemas"]["DemoInfo"];
const disabled: DemoInfo = { enabled: false, accounts: [] };

async function getDemo(): Promise<DemoInfo> {
	try {
		const { data, error } = await api.GET("/api/v1/public/demo");
		return error ? disabled : (data ?? disabled);
	} catch {
		return disabled;
	}
}

export const demoQuery = () =>
	queryOptions({ queryKey: ["demo"], queryFn: getDemo, retry: false });
