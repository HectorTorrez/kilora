import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/kilora/auth-page";
export const Route = createFileRoute("/registro")({
	validateSearch: (search: { [key: string]: unknown }) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	component: Page,
});
function Page() {
	const { redirect } = Route.useSearch();
	return <AuthPage mode="registro" redirectTo={redirect} />;
}
