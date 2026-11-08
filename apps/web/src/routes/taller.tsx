import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/kilora/app-shell";
import { meQuery } from "@/lib/auth";

export const Route = createFileRoute("/taller")({
	beforeLoad: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(meQuery());
		if (!me)
			throw redirect({ to: "/login", search: { redirect: location.href } });
		if (!me.memberships.length) throw redirect({ to: "/onboarding" });
		return { me };
	},
	component: TallerLayout,
});

function TallerLayout() {
	return (
		<AppShell>
			<Outlet />
		</AppShell>
	);
}
