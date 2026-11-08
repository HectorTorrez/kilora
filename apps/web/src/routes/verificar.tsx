import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/kilora/auth-page";
export const Route = createFileRoute("/verificar")({
	validateSearch: (search: { [key: string]: unknown }) => ({
		token: typeof search.token === "string" ? search.token : "",
	}),
	component: Page,
});
function Page() {
	const { token } = Route.useSearch();
	return <AuthPage mode="verificar" token={token} />;
}
