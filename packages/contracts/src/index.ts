import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export function createApiClient(baseUrl: string, fetcher?: typeof fetch) {
 return createClient<paths>({ baseUrl, credentials: "include", fetch: fetcher });
}
export type { components, paths } from "./schema";
export type Vehicle = components["schemas"]["Vehicle"];
export type WorkOrder = components["schemas"]["WorkOrder"];
export type Me = components["schemas"]["Me"];
export type Membership = components["schemas"]["Membership"];
