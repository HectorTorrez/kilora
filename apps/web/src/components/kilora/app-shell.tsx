import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ClipboardList, LayoutDashboard } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { useLogout } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Route as TallerRoute } from "@/routes/taller";

const navigation = [
	{ to: "/taller", label: "Vehículos", icon: LayoutDashboard, exact: true },
	{
		to: "/taller/ordenes",
		label: "Órdenes",
		icon: ClipboardList,
		exact: false,
	},
];

function useIsActive() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	return (to: string, exact: boolean) =>
		exact ? pathname === to : pathname.startsWith(to);
}

const WorkshopContext = createContext("");
export const useWorkshopId = () => useContext(WorkshopContext);

export function AppShell({ children }: { children: ReactNode }) {
	const isActive = useIsActive();
	const { me } = TallerRoute.useRouteContext();
	const logout = useLogout();
	const navigate = useNavigate();
	const [selected, setSelected] = useState("");
	useEffect(() => {
		try {
			setSelected(localStorage.getItem(`kilora-workshop-${me.user.id}`) ?? "");
		} catch {
			setSelected("");
		}
	}, [me.user.id]);
	const active =
		me.memberships.find((m) => m.workshop_id === selected) ?? me.memberships[0];
	const selectWorkshop = (id: string) => {
		setSelected(id);
		try {
			localStorage.setItem(`kilora-workshop-${me.user.id}`, id);
		} catch {}
	};
	const signOut = async () => {
		try {
			await logout.mutateAsync();
			await navigate({ to: "/login", search: { redirect: undefined } });
		} catch {}
	};

	return (
		<div className="flex min-h-dvh bg-background">
			<aside className="sticky top-0 hidden h-dvh w-[236px] shrink-0 flex-col gap-6 border-r bg-card px-3.5 pt-6 pb-4 lg:flex">
				<div className="px-2.5">
					<Link
						to="/taller"
						className="font-display text-[19px] font-bold tracking-[0.2em]"
					>
						KILORA
					</Link>
					<p className="mt-1 text-[11px] text-ink-3">Historial del vehículo</p>
				</div>

				<nav className="flex flex-col gap-0.5">
					{navigation.map((item) => {
						const active = isActive(item.to, item.exact);
						const Icon = item.icon;

						return (
							<Link
								key={item.to}
								to={item.to}
								className={cn(
									"pressable flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium",
									"text-ink-2 hover:bg-paper hover:text-foreground",
									active && "bg-secondary font-semibold text-foreground",
								)}
							>
								<Icon className="size-4 opacity-80" aria-hidden="true" />
								{item.label}
							</Link>
						);
					})}
				</nav>

				<div className="flex-1" />

				<div className="rounded-lg bg-paper px-2.5 py-3">
					<p className="text-[12.5px] font-semibold">{active?.workshop_name}</p>
					<p className="mt-1 text-[11px] leading-snug text-ink-3">
						{active?.branch_name}
					</p>
					{me.memberships.length > 1 && (
						<select
							aria-label="Taller activo"
							value={active?.workshop_id}
							onChange={(event) => selectWorkshop(event.target.value)}
							className="mt-2 w-full rounded border bg-card p-1 text-xs"
						>
							{[
								...new Map(
									me.memberships.map((m) => [m.workshop_id, m]),
								).values(),
							].map((m) => (
								<option key={m.workshop_id} value={m.workshop_id}>
									{m.workshop_name}
								</option>
							))}
						</select>
					)}
				</div>

				<div className="flex items-center gap-2.5 px-0.5">
					<div className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-[10.5px] font-semibold text-ink-2">
						{me.user.full_name.slice(0, 1).toUpperCase()}
					</div>
					<div className="min-w-0 leading-tight">
						<p className="truncate text-[12px] font-semibold">
							{me.user.full_name}
						</p>
						<p className="text-[11px] text-ink-3">{active?.role}</p>
					</div>
				</div>
				<button
					type="button"
					onClick={signOut}
					disabled={logout.isPending}
					className="text-left text-xs font-semibold text-seal"
				>
					Cerrar sesión
				</button>
				{logout.error && (
					<p role="alert" className="text-xs text-destructive">
						{logout.error.message}
					</p>
				)}
			</aside>

			<div className="min-w-0 flex-1">
				<header className="flex items-center justify-between gap-4 border-b bg-card px-5 py-3 lg:hidden">
					<Link
						to="/taller"
						className="font-display text-[15px] font-bold tracking-[0.2em]"
					>
						KILORA
					</Link>
					<nav className="flex items-center gap-1">
						{navigation.map((item) => (
							<Link
								key={item.to}
								to={item.to}
								className={cn(
									"pressable rounded-md px-2.5 py-1.5 text-[12px] font-medium text-ink-2",
									isActive(item.to, item.exact) &&
										"bg-secondary font-semibold text-foreground",
								)}
							>
								{item.label}
							</Link>
						))}
					</nav>
				</header>

				<div className="flex items-center justify-between gap-2 border-b bg-card px-5 py-2 text-xs lg:hidden">
					<span>
						{me.user.full_name} · {active?.workshop_name}
					</span>
					<button
						type="button"
						onClick={signOut}
						disabled={logout.isPending}
						className="font-semibold text-seal"
					>
						Cerrar sesión
					</button>
				</div>
				{logout.error && (
					<p role="alert" className="px-5 text-xs text-destructive lg:hidden">
						{logout.error.message}
					</p>
				)}
				<WorkshopContext.Provider value={active?.workshop_id ?? ""}>
					{children}
				</WorkshopContext.Provider>
			</div>
		</div>
	);
}
