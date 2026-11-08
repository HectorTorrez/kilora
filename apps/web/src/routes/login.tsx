import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/kilora/auth-page";
export const Route = createFileRoute("/login")({
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	component: Page,
});
function Page() {
	const { redirect } = Route.useSearch();
	return <AuthPage mode="login" redirectTo={redirect} />;
}
