import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ClipboardList, FileText, LayoutDashboard } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { DemoBanner } from "@/components/kilora/demo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
	{
		to: "/taller/cotizaciones",
		label: "Cotizaciones",
		icon: FileText,
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
		<div className="kilora-app flex min-h-dvh bg-background">
			<aside className="print-hidden sticky top-0 hidden h-dvh w-[236px] shrink-0 flex-col gap-6 border-r bg-card px-3.5 pt-6 pb-4 lg:flex">
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
						<Select value={active?.workshop_id} onValueChange={selectWorkshop}>
							<SelectTrigger
								aria-label="Taller activo"
								className="mt-2 w-full text-xs"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{[
									...new Map(
										me.memberships.map((m) => [m.workshop_id, m]),
									).values(),
								].map((m) => (
									<SelectItem key={m.workshop_id} value={m.workshop_id}>
										{m.workshop_name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
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
				<Button
					variant="ghost"
					size="sm"
					type="button"
					onClick={signOut}
					disabled={logout.isPending}
					className="text-left text-xs font-semibold text-seal"
				>
					Cerrar sesión
				</Button>
				{logout.error && (
					<Alert variant="destructive" className="text-xs text-destructive">
						<AlertDescription>{logout.error.message}</AlertDescription>
					</Alert>
				)}
			</aside>

			<div className="min-w-0 flex-1">
				<header className="print-hidden flex items-center justify-between gap-4 border-b bg-card px-5 py-3 lg:hidden">
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

				<div className="print-hidden flex items-center justify-between gap-2 border-b bg-card px-5 py-2 text-xs lg:hidden">
					<span>
						{me.user.full_name} · {active?.workshop_name}
					</span>
					<Button
						variant="ghost"
						size="sm"
						type="button"
						onClick={signOut}
						disabled={logout.isPending}
						className="font-semibold text-seal"
					>
						Cerrar sesión
					</Button>
				</div>
				{logout.error && (
					<Alert
						variant="destructive"
						className="print-hidden px-5 text-xs text-destructive lg:hidden"
					>
						<AlertDescription>{logout.error.message}</AlertDescription>
					</Alert>
				)}
				<WorkshopContext.Provider value={active?.workshop_id ?? ""}>
					<DemoBanner email={me.user.email} />
					{children}
				</WorkshopContext.Provider>
			</div>
		</div>
	);
}
