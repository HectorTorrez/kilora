import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { meQuery, useLogout } from "@/lib/auth";
export const Route = createFileRoute("/mis-vehiculos")({
	beforeLoad: async ({ context, location }) => {
		const me = await context.queryClient.ensureQueryData(meQuery());
		if (!me)
			throw redirect({ to: "/login", search: { redirect: location.href } });
		return { me };
	},
	component: Layout,
});
function Layout() {
	const { me } = Route.useRouteContext();
	const logout = useLogout();
	const navigate = useNavigate();
	return (
		<div className="min-h-dvh bg-background">
			<header className="border-b bg-card">
				<div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-5 py-4">
					<Link
						to="/mis-vehiculos"
						className="font-display text-xl font-bold tracking-widest"
					>
						KILORA
					</Link>
					<span className="ml-auto text-sm">{me.user.full_name}</span>
					{me.memberships.length > 0 && (
						<Link to="/taller" className="text-sm text-seal">
							Panel del taller
						</Link>
					)}
					<Button
						variant="ghost"
						size="sm"
						onClick={async () => {
							await logout.mutateAsync();
							await navigate({ to: "/login", search: { redirect: undefined } });
						}}
					>
						Cerrar sesión
					</Button>
				</div>
			</header>
			<Outlet />
		</div>
	);
}
