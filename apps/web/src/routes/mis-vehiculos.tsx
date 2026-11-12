import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { AssistantChat } from "@/components/kilora/assistant-chat";
import { DemoBanner } from "@/components/kilora/demo";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

function initials(name: string) {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const letters =
		parts.length >= 2
			? `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`
			: (parts[0] ?? "").slice(0, 2);
	return letters.toUpperCase() || "·";
}

function Layout() {
	const { me } = Route.useRouteContext();
	const logout = useLogout();
	const navigate = useNavigate();
	return (
		<div className="min-h-dvh bg-background">
			<DemoBanner email={me.user.email} />
			<header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
				<div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-5 sm:h-16">
					<Link
						to="/mis-vehiculos"
						className="font-display text-lg font-bold tracking-[0.22em] sm:text-xl"
					>
						KILORA
					</Link>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								className="ml-auto h-10 gap-2 px-1.5 sm:pr-2"
							>
								<span
									aria-hidden
									className="grid size-8 place-items-center rounded-full bg-seal text-[11px] font-semibold tracking-wide text-white"
								>
									{initials(me.user.full_name)}
								</span>
								<span className="hidden max-w-40 truncate text-sm font-medium sm:inline">
									{me.user.full_name}
								</span>
								<span className="sr-only sm:hidden">{me.user.full_name}</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-64">
							<DropdownMenuLabel className="font-normal">
								<span className="block truncate text-sm font-semibold text-foreground">
									{me.user.full_name}
								</span>
								<span className="block truncate text-xs text-ink-3">
									{me.user.email}
								</span>
							</DropdownMenuLabel>
							{me.memberships.length > 0 && (
								<DropdownMenuItem asChild>
									<Link to="/taller">Panel del taller</Link>
								</DropdownMenuItem>
							)}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onSelect={() => {
									void (async () => {
										await logout.mutateAsync();
										await navigate({
											to: "/login",
											search: { redirect: undefined },
										});
									})();
								}}
							>
								Cerrar sesión
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</header>
			<Outlet />
			<AssistantChat mode="propietario" userName={me.user.full_name} />
		</div>
	);
}
