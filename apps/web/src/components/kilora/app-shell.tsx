import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
	Building2,
	Car,
	Check,
	ChevronsUpDown,
	ClipboardList,
	FileText,
	LayoutDashboard,
	LogOut,
	MapPin,
	Menu,
	Plus,
	ShieldCheck,
	UserRound,
	Users,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AssistantChat } from "@/components/kilora/assistant-chat";
import { DemoBanner } from "@/components/kilora/demo";
import { FormDialog } from "@/components/kilora/form-dialog";
import {
	applyFormError,
	FormActions,
	NitField,
	RequiredLegend,
	RootError,
	SubmitButton,
	TextField,
} from "@/components/kilora/form-fields";
import {
	optionalNit,
	requiredText,
	workshopName,
} from "@/components/kilora/form-schemas";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Form } from "@/components/ui/form";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	BranchProvider,
	useTallerContext,
	WorkshopProvider,
} from "@/features/taller/session";
import { useCreateWorkshop, useLogout } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = {
	to:
		| "/taller"
		| "/taller/ordenes"
		| "/taller/cotizaciones"
		| "/taller/vehiculos"
		| "/taller/clientes"
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
			{ to: "/taller/clientes", label: "Clientes", icon: Users },
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
	const rank: Record<string, number> = { admin: 3, recepcion: 2, mecanico: 1 };
	const workshops = [
		...me.memberships
			.reduce((acc, m) => {
				const current = acc.get(m.workshop_id);
				acc.set(m.workshop_id, {
					id: m.workshop_id,
					name: m.workshop_name,
					branches: (current?.branches ?? 0) + 1,
					role:
						current && rank[current.role] >= rank[m.role]
							? current.role
							: m.role,
				});
				return acc;
			}, new Map<string, WorkshopOption>())
			.values(),
	];
	const activeOption = workshops.find((w) => w.id === active?.workshop_id);
	const activeWorkshopID = active?.workshop_id ?? "";
	const branches: BranchOption[] = me.memberships
		.filter((m) => m.workshop_id === activeWorkshopID)
		.map((m) => ({ id: m.branch_id, name: m.branch_name }));

	// Sucursal elegida, recordada por taller. Con una sola sucursal no hay nada
	// que elegir; "" significa todas.
	const branchKey = `kilora-branch-${me.user.id}-${activeWorkshopID}`;
	const [storedBranch, setStoredBranch] = useState("");
	useEffect(() => {
		try {
			setStoredBranch(localStorage.getItem(branchKey) ?? "");
		} catch {
			setStoredBranch("");
		}
	}, [branchKey]);
	const activeBranchID =
		branches.length > 1 && branches.some((b) => b.id === storedBranch)
			? storedBranch
			: "";
	const activeBranch = branches.find((b) => b.id === activeBranchID);

	const selectBranch = (id: string) => {
		if (id === activeBranchID) return;
		setStoredBranch(id);
		try {
			if (id) localStorage.setItem(branchKey, id);
			else localStorage.removeItem(branchKey);
		} catch {}
		const name = branches.find((b) => b.id === id)?.name;
		toast.success(
			name
				? `Ahora estás en la sucursal ${name}`
				: "Viendo todas las sucursales",
		);
	};

	const selectWorkshop = (id: string) => {
		if (id === active?.workshop_id) return;
		setSelected(id);
		try {
			localStorage.setItem(`kilora-workshop-${me.user.id}`, id);
		} catch {}
		const name = workshops.find((w) => w.id === id)?.name;
		if (name) toast.success(`Ahora estás en ${name}`);
		// Un detalle (una orden, un vehículo) es del taller anterior: volvé a la
		// lista de la misma sección.
		const section = pathname.split("/").slice(0, 3).join("/");
		if (section !== pathname) void navigate({ to: section });
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
			branchName={
				activeBranch?.name ??
				(activeOption && activeOption.branches > 1
					? `Todas las sucursales (${activeOption.branches})`
					: (active?.branch_name ?? ""))
			}
			branches={branches}
			activeBranch={activeBranchID}
			onSelectBranch={selectBranch}
			workshops={workshops}
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
					<BranchProvider value={{ id: activeBranchID, setId: selectBranch }}>
						<div className="print:hidden">
							<DemoBanner email={me.user.email} />
						</div>
						{children}
					</BranchProvider>
				</WorkshopProvider>
				<AssistantChat
					mode="taller"
					userName={me.user.full_name}
					workshopId={active?.workshop_id}
				/>
			</div>
		</div>
	);
}

function SidebarContent({
	workshopName,
	branchName,
	branches,
	activeBranch,
	onSelectBranch,
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
	branches: BranchOption[];
	activeBranch: string;
	onSelectBranch: (id: string) => void;
	workshops: WorkshopOption[];
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
			{/* En el menú móvil, deja lugar al botón de cerrar de la hoja. */}
			<div className="flex items-center justify-between px-2 in-data-[slot=sheet-content]:pr-9">
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
				branches={branches}
				activeBranch={activeBranch}
				onSelectBranch={onSelectBranch}
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
						<Link to="/mis-vehiculos/cuenta">
							<UserRound className="size-4" />
							Mi cuenta
						</Link>
					</DropdownMenuItem>
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

type WorkshopOption = {
	id: string;
	name: string;
	role: string;
	branches: number;
};

type BranchOption = { id: string; name: string };

function WorkshopSwitcher({
	name,
	branch,
	branches,
	activeBranch,
	onSelectBranch,
	workshops,
	active,
	onSelect,
}: {
	name: string;
	branch: string;
	branches: BranchOption[];
	activeBranch: string;
	onSelectBranch: (id: string) => void;
	workshops: WorkshopOption[];
	active: string;
	onSelect: (id: string) => void;
}) {
	const [creating, setCreating] = useState(false);
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label={`Taller actual: ${name}, ${branch}. Cambiar de taller o sucursal`}
						className="pressable flex w-full items-center gap-2.5 rounded-lg border bg-background/60 p-2 text-left hover:bg-secondary"
					>
						<span className="grid size-8 shrink-0 place-items-center rounded-md bg-seal text-[11px] font-bold text-white">
							{initials(name)}
						</span>
						<span className="min-w-0 flex-1 leading-tight">
							<span className="block truncate text-[13px] font-semibold">
								{name}
							</span>
							<span className="block truncate text-[11.5px] text-ink-3">
								{branch}
							</span>
						</span>
						<ChevronsUpDown className="size-4 shrink-0 text-ink-3" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-64">
					{branches.length > 1 && (
						<>
							<DropdownMenuLabel className="text-xs font-medium text-ink-3">
								Sucursal
							</DropdownMenuLabel>
							<DropdownMenuItem
								onSelect={() => onSelectBranch("")}
								className="gap-2.5"
							>
								<MapPin className="size-4 text-ink-3" />
								<span className="flex-1 truncate">Todas las sucursales</span>
								{activeBranch === "" && (
									<Check
										className="size-4 shrink-0 text-seal"
										aria-label="Actual"
									/>
								)}
							</DropdownMenuItem>
							{branches.map((b) => (
								<DropdownMenuItem
									key={b.id}
									onSelect={() => onSelectBranch(b.id)}
									className="gap-2.5"
								>
									<MapPin className="size-4 text-ink-3" />
									<span className="flex-1 truncate">{b.name}</span>
									{b.id === activeBranch && (
										<Check
											className="size-4 shrink-0 text-seal"
											aria-label="Actual"
										/>
									)}
								</DropdownMenuItem>
							))}
							<DropdownMenuSeparator />
						</>
					)}
					<DropdownMenuLabel className="text-xs font-medium text-ink-3">
						{workshops.length > 1 ? "Tus talleres" : "Tu taller"}
					</DropdownMenuLabel>
					{workshops.map((w) => (
						<DropdownMenuItem
							key={w.id}
							onSelect={() => onSelect(w.id)}
							className="gap-2.5 py-2"
						>
							<span className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-[10px] font-bold text-ink-2">
								{initials(w.name)}
							</span>
							<span className="min-w-0 flex-1 leading-tight">
								<span className="block truncate text-[13px] font-medium">
									{w.name}
								</span>
								<span className="block truncate text-[11.5px] text-ink-3">
									{roleLabel[w.role] ?? w.role}
									{w.branches > 1 ? ` · ${w.branches} sucursales` : ""}
								</span>
							</span>
							{w.id === active && (
								<Check
									className="size-4 shrink-0 text-seal"
									aria-label="Actual"
								/>
							)}
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={() => setCreating(true)}>
						<Plus />
						Registrar otro taller
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<FormDialog
				open={creating}
				onOpenChange={setCreating}
				title="Registrar otro taller"
				description="Quedás como administrador. Podés cambiar entre tus talleres desde este menú cuando quieras."
			>
				<NewWorkshopForm
					onCancel={() => setCreating(false)}
					onCreated={(id) => {
						setCreating(false);
						onSelect(id);
					}}
				/>
			</FormDialog>
		</>
	);
}

const newWorkshopSchema = z.object({
	name: workshopName,
	nit: optionalNit,
	branch_name: requiredText("Ingresá el nombre de la sucursal").max(
		100,
		"Usá como máximo 100 caracteres",
	),
});

function NewWorkshopForm({
	onCancel,
	onCreated,
}: {
	onCancel: () => void;
	onCreated: (id: string) => void;
}) {
	const create = useCreateWorkshop();
	const qc = useQueryClient();
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(newWorkshopSchema),
		defaultValues: { name: "", nit: "", branch_name: "Principal" },
	});
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			const created = await create.mutateAsync({
				name: values.name,
				branch_name: values.branch_name,
				nit: values.nit || null,
			});
			await qc.refetchQueries({ queryKey: ["me"] });
			toast.success(`${values.name} registrado. Ya estás trabajando en él.`);
			if (created?.id) onCreated(created.id);
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<Form {...form}>
			<form onSubmit={submit} className="grid gap-5" noValidate>
				<RequiredLegend />
				<TextField
					name="name"
					label="Nombre del taller"
					maxLength={100}
					autoFocus
					required
				/>
				<div className="grid gap-5 sm:grid-cols-2">
					<TextField
						name="branch_name"
						label="Primera sucursal"
						maxLength={100}
						description="Después podés tener más."
						required
					/>
					<NitField optional />
				</div>
				<RootError />
				<FormActions>
					<Button
						type="button"
						variant="outline"
						className="w-full sm:w-auto"
						onClick={onCancel}
					>
						Cancelar
					</Button>
					<SubmitButton pending={create.isPending} pendingLabel="Registrando…">
						Registrar taller
					</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}
