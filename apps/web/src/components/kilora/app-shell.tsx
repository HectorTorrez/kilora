import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
	Building2,
	Car,
	ChevronsUpDown,
	ClipboardList,
	FileText,
	LayoutDashboard,
	LogOut,
	Menu,
	Plus,
	ShieldCheck,
	UserRound,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { DemoBanner } from "@/components/kilora/demo";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/components/ui/sheet";
import { useTallerContext, WorkshopProvider } from "@/features/taller/session";
import { useLogout } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = {
	to:
		| "/taller"
		| "/taller/ordenes"
		| "/taller/cotizaciones"
		| "/taller/vehiculos"
		| "/taller/configuracion"
		| "/taller/actividad";
	label: string;
	icon: typeof Car;
	exact?: boolean;
	adminOnly?: boolean;
};

const sections: { label: string; items: NavItem[] }[] = [
	{
		label: "Operación",
		items: [
			{ to: "/taller", label: "Resumen", icon: LayoutDashboard, exact: true },
			{ to: "/taller/ordenes", label: "Órdenes", icon: ClipboardList },
			{ to: "/taller/cotizaciones", label: "Cotizaciones", icon: FileText },
			{ to: "/taller/vehiculos", label: "Vehículos", icon: Car },
		],
	},
	{
		label: "Administración",
		items: [
			{ to: "/taller/configuracion", label: "Mi taller", icon: Building2 },
			{
				to: "/taller/actividad",
				label: "Actividad",
				icon: ShieldCheck,
				adminOnly: true,
			},
		],
	},
];

const roleLabel: Record<string, string> = {
	admin: "Administrador",
	recepcion: "Recepción",
	mecanico: "Mecánico",
};

function useIsActive() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	return (to: string, exact?: boolean) =>
		exact
			? pathname === to || pathname === `${to}/`
			: pathname === to || pathname.startsWith(`${to}/`);
}

const initials = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join("");

export function AppShell({ children }: { children: ReactNode }) {
	const { me } = useTallerContext();
	const logout = useLogout();
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const [selected, setSelected] = useState("");
	const [mobileOpen, setMobileOpen] = useState(false);

	useEffect(() => {
		try {
			setSelected(localStorage.getItem(`kilora-workshop-${me.user.id}`) ?? "");
		} catch {
			setSelected("");
		}
	}, [me.user.id]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer on navigation.
	useEffect(() => setMobileOpen(false), [pathname]);

	const active =
		me.memberships.find((m) => m.workshop_id === selected) ?? me.memberships[0];
	const workshops = [
		...new Map(me.memberships.map((m) => [m.workshop_id, m])).values(),
	];

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
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "No se pudo cerrar sesión.",
			);
		}
	};

	const sidebar = (
		<SidebarContent
			workshopName={active?.workshop_name ?? ""}
			branchName={active?.branch_name ?? ""}
			workshops={workshops.map((w) => ({
				id: w.workshop_id,
				name: w.workshop_name,
			}))}
			activeWorkshop={active?.workshop_id ?? ""}
			onSelectWorkshop={selectWorkshop}
			userName={me.user.full_name}
			userEmail={me.user.email}
			role={roleLabel[active?.role ?? ""] ?? active?.role ?? ""}
			isAdmin={me.memberships.some(
				(m) => m.workshop_id === active?.workshop_id && m.role === "admin",
			)}
			onSignOut={signOut}
			signingOut={logout.isPending}
		/>
	);

	return (
		<div className="kilora-app flex min-h-dvh bg-background">
			<aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 border-r bg-card lg:block print:hidden">
				{sidebar}
			</aside>

			<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
				<SheetContent side="left" className="w-[272px] gap-0 p-0">
					<SheetTitle className="sr-only">Navegación</SheetTitle>
					<SheetDescription className="sr-only">
						Secciones del panel del taller
					</SheetDescription>
					{sidebar}
				</SheetContent>
			</Sheet>

			<div className="flex min-w-0 flex-1 flex-col">
				<header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/90 px-4 backdrop-blur lg:hidden print:hidden">
					<Button
						variant="ghost"
						size="icon"
						aria-label="Abrir menú"
						onClick={() => setMobileOpen(true)}
					>
						<Menu className="size-5" />
					</Button>
					<Link
						to="/taller"
						className="font-display text-[15px] font-bold tracking-[0.2em]"
					>
						KILORA
					</Link>
					<span className="truncate text-xs text-ink-3">
						{active?.workshop_name}
					</span>
					<div className="flex-1" />
					<Button asChild size="sm">
						<Link to="/taller/ordenes/nueva" search={{ vehiculo: undefined }}>
							<Plus className="size-4" />
							<span className="sr-only sm:not-sr-only">Nueva orden</span>
						</Link>
					</Button>
				</header>
				<WorkshopProvider
					key={active?.workshop_id}
					value={active?.workshop_id ?? ""}
				>
					<div className="print:hidden">
						<DemoBanner email={me.user.email} />
					</div>
					{children}
				</WorkshopProvider>
			</div>
		</div>
	);
}

function SidebarContent({
	workshopName,
	branchName,
	workshops,
	activeWorkshop,
	onSelectWorkshop,
	userName,
	userEmail,
	role,
	isAdmin,
	onSignOut,
	signingOut,
}: {
	workshopName: string;
	branchName: string;
	workshops: { id: string; name: string }[];
	activeWorkshop: string;
	onSelectWorkshop: (id: string) => void;
	userName: string;
	userEmail: string;
	role: string;
	isAdmin: boolean;
	onSignOut: () => void;
	signingOut: boolean;
}) {
	const isActive = useIsActive();
	return (
		<div className="flex h-full flex-col gap-5 px-3 pt-5 pb-3">
			<div className="flex items-center justify-between px-2">
				<Link
					to="/taller"
					className="font-display text-[18px] font-bold tracking-[0.22em]"
				>
					KILORA
				</Link>
				<span className="rounded bg-seal-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-seal uppercase">
					Taller
				</span>
			</div>

			<WorkshopSwitcher
				name={workshopName}
				branch={branchName}
				workshops={workshops}
				active={activeWorkshop}
				onSelect={onSelectWorkshop}
			/>

			<Button asChild className="w-full justify-start">
				<Link to="/taller/ordenes/nueva" search={{ vehiculo: undefined }}>
					<Plus className="size-4" />
					Nueva orden
				</Link>
			</Button>

			<nav className="flex flex-col gap-5" aria-label="Panel del taller">
				{sections.map((section) => (
					<div key={section.label}>
						<p className="px-2.5 pb-1.5 font-mono text-[10.5px] tracking-widest text-ink-3 uppercase">
							{section.label}
						</p>
						<ul className="flex flex-col gap-0.5">
							{section.items
								.filter((item) => !item.adminOnly || isAdmin)
								.map((item) => {
									const on = isActive(item.to, item.exact);
									const Icon = item.icon;
									return (
										<li key={item.to}>
											<Link
												to={item.to}
												aria-current={on ? "page" : undefined}
												className={cn(
													"pressable relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium text-ink-2",
													"hover:bg-secondary hover:text-foreground",
													on &&
														"bg-seal-soft font-semibold text-seal hover:bg-seal-soft hover:text-seal",
												)}
											>
												{on && (
													<span className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r bg-seal" />
												)}
												<Icon className="size-4" aria-hidden="true" />
												{item.label}
											</Link>
										</li>
									);
								})}
						</ul>
					</div>
				))}
			</nav>

			<div className="flex-1" />

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="pressable flex w-full items-center gap-2.5 rounded-md p-2 text-left hover:bg-secondary"
					>
						<span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">
							{initials(userName)}
						</span>
						<span className="min-w-0 flex-1 leading-tight">
							<span className="block truncate text-[13px] font-semibold">
								{userName}
							</span>
							<span className="block truncate text-[11.5px] text-ink-3">
								{role}
							</span>
						</span>
						<ChevronsUpDown className="size-4 text-ink-3" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="top" align="start" className="w-56">
					<DropdownMenuLabel className="font-normal">
						<p className="text-sm font-semibold">{userName}</p>
						<p className="truncate text-xs text-ink-3">{userEmail}</p>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem asChild>
						<Link to="/mis-vehiculos">
							<UserRound className="size-4" />
							Mis vehículos
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						disabled={signingOut}
						onSelect={onSignOut}
					>
						<LogOut className="size-4" />
						{signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

function WorkshopSwitcher({
	name,
	branch,
	workshops,
	active,
	onSelect,
}: {
	name: string;
	branch: string;
	workshops: { id: string; name: string }[];
	active: string;
	onSelect: (id: string) => void;
}) {
	const card = (
		<>
			<span className="grid size-8 shrink-0 place-items-center rounded-md bg-seal text-[11px] font-bold text-white">
				{initials(name)}
			</span>
			<span className="min-w-0 flex-1 leading-tight">
				<span className="block truncate text-[13px] font-semibold">{name}</span>
				<span className="block truncate text-[11.5px] text-ink-3">
					{branch}
				</span>
			</span>
		</>
	);
	if (workshops.length < 2)
		return (
			<div className="flex items-center gap-2.5 rounded-lg border bg-background/60 p-2">
				{card}
			</div>
		);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Cambiar de taller"
					className="pressable flex w-full items-center gap-2.5 rounded-lg border bg-background/60 p-2 text-left hover:bg-secondary"
				>
					{card}
					<ChevronsUpDown className="size-4 text-ink-3" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				<DropdownMenuLabel className="text-xs text-ink-3">
					Talleres
				</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={active} onValueChange={onSelect}>
					{workshops.map((w) => (
						<DropdownMenuRadioItem key={w.id} value={w.id}>
							{w.name}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
