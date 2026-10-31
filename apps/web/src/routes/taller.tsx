import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/kilora/app-shell";

export const Route = createFileRoute("/taller")({
	component: TallerLayout,
});

function TallerLayout() {
	return (
		<AppShell>
			<Outlet />
		</AppShell>
	);
}
