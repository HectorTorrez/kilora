import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/kilora/auth-page";
import { demoQuery } from "@/lib/demo-accounts";
export const Route = createFileRoute("/login")({
	validateSearch: (search: { [key: string]: unknown }) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	loader: ({ context }) => context.queryClient.ensureQueryData(demoQuery()),
	component: Page,
});
function Page() {
	const { redirect } = Route.useSearch();
	return (
		<AuthPage mode="login" redirectTo={redirect} demo={Route.useLoaderData()} />
	);
}
