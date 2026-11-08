import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Archive,
	BadgeCheck,
	Building2,
	EyeOff,
	FileText,
	MapPin,
	ShieldCheck,
	Trash2,
	UserPlus,
	Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	PageBody,
	PageHeader,
	SectionCard,
} from "@/components/kilora/workshop-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkshopMutation } from "@/features/taller/mutation";
import { useTallerContext, useWorkshopId } from "@/features/taller/session";
import {
	adminActions,
	membersQuery,
	workshopQuery,
} from "@/features/taller/team";
import { date } from "@/lib/format";
import { cn } from "@/lib/utils";

type Role = components["schemas"]["MemberInput"]["role"];

export const Route = createFileRoute("/taller/configuracion")({
	component: SettingsPage,
});

const roleLabel: Record<string, string> = {
	admin: "Administrador",
	recepcion: "Recepción",
	mecanico: "Mecánico",
};
const roleHelp: Record<Role, string> = {
	admin: "Todo, incluido el equipo y la bitácora",
	recepcion: "Vehículos, órdenes, cotizaciones e invitaciones",
	mecanico: "Solo lectura",
};

const projection = [
	{
		who: "Propietario",
		sees: "Todo: trabajos, fecha, kilometraje, taller, costo y notas públicas.",
		tone: "bg-seal-soft text-seal",
	},
	{
		who: "Tu taller",
		sees: "Todo lo de tus órdenes, incluidos costos internos y notas privadas.",
		tone: "bg-ok-soft text-ok",
	},
	{
		who: "Otro taller",
		sees: "Vista ciega: trabajo, fecha y kilometraje. Sin autor, costo ni notas.",
		tone: "bg-secondary text-ink-2",
	},
];

function SettingsPage() {
	const workshopID = useWorkshopId();
	const { me } = useTallerContext();
	const { data, isLoading, error } = useQuery(workshopQuery(workshopID));
	const isAdmin = data?.role === "admin";
	const verified = data?.workshop.verified_at;

	return (
		<PageBody className="max-w-5xl">
			<PageHeader
				eyebrow="Administración"
				title="Mi taller"
				description="Datos del taller, equipo y las reglas con las que Kilora protege tu información."
			/>
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error.message}</AlertDescription>
				</Alert>
			)}

			<div className="grid items-start gap-6 lg:grid-cols-2">
				<SectionCard title="Datos del taller">
					{isLoading ? (
						<Skeleton className="h-24" />
					) : (
						<div className="space-y-4">
							<div className="flex items-start gap-4">
								<span className="grid size-12 shrink-0 place-items-center rounded-lg bg-seal text-white">
									<Building2 className="size-5" />
								</span>
								<dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
									<dt className="text-ink-3">Nombre comercial</dt>
									<dd className="text-right font-semibold">
										{data?.workshop.name}
									</dd>
									<dt className="text-ink-3">NIT</dt>
									<dd className="text-right font-mono">
										{data?.workshop.nit || "Sin registrar"}
									</dd>
									<dt className="text-ink-3">Sucursales</dt>
									<dd className="text-right">{data?.branches.length ?? 0}</dd>
								</dl>
							</div>
							{verified ? (
								<div className="flex items-center gap-3 rounded-md bg-seal-soft p-3 text-seal">
									<BadgeCheck className="size-5 shrink-0" />
									<p className="text-[13px] leading-snug">
										<strong className="font-semibold">Taller verificado</strong>
										<span className="block opacity-80">
											{date(verified)}
											{data?.workshop.verified_by &&
												` · por ${data.workshop.verified_by}`}
										</span>
									</p>
								</div>
							) : (
								<div className="rounded-md border border-dashed p-3 text-[13px] text-ink-2">
									<p className="font-semibold">Sin verificar</p>
									<p className="mt-0.5 text-xs text-ink-3">
										La verificación es manual: se confirma NIT y nombre
										comercial con una llamada. El sello aparece en el historial
										de tus servicios.
									</p>
								</div>
							)}
						</div>
					)}
				</SectionCard>

				<SectionCard
					title="Sucursales"
					description="Las órdenes se registran por sucursal"
					bodyClassName="p-0 sm:p-0"
				>
					{isLoading ? (
						<Skeleton className="m-5 h-20" />
					) : (
						<ul className="divide-y">
							{data?.branches.map((b) => {
								const role = me.memberships.find(
									(m) => m.branch_id === b.id,
								)?.role;
								return (
									<li
										key={b.id}
										className="flex items-center gap-3 px-4 py-3 text-[13px] sm:px-5"
									>
										<MapPin className="size-4 text-ink-3" />
										<span className="flex-1 font-medium">{b.name}</span>
										<span className="text-xs text-ink-3">
											Tu rol: {role ? roleLabel[role] : "sin acceso"}
										</span>
									</li>
								);
							})}
						</ul>
					)}
				</SectionCard>
			</div>

			<TeamCard
				workshopID={workshopID}
				isAdmin={isAdmin}
				currentUserID={me.user.id}
				branches={data?.branches ?? []}
			/>

			<div className="grid items-start gap-6 lg:grid-cols-[1fr_1.4fr]">
				<SectionCard
					title="Políticas de datos"
					description="Aplicadas en el servidor, no configurables"
				>
					<ul className="space-y-3 text-[13px]">
						<li className="flex gap-3">
							<FileText className="mt-0.5 size-4 shrink-0 text-ink-3" />
							<span>
								<strong className="font-semibold">
									Historial append-only.
								</strong>{" "}
								<span className="text-ink-2">
									Un servicio publicado no se edita; se agrega una corrección
									fechada.
								</span>
							</span>
						</li>
						<li className="flex gap-3">
							<Archive className="mt-0.5 size-4 shrink-0 text-ink-3" />
							<span>
								<strong className="font-semibold">Provisionales.</strong>{" "}
								<span className="text-ink-2">
									Sin actividad en 90 días se archivan; a los 12 meses se
									purgan, salvo que tengan orden abierta o historial.
								</span>
							</span>
						</li>
						<li className="flex gap-3">
							<ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-3" />
							<span>
								<strong className="font-semibold">Auditoría.</strong>{" "}
								<span className="text-ink-2">
									Cada cambio sensible queda registrado con autor y fecha.
								</span>
							</span>
						</li>
					</ul>
				</SectionCard>

				<SectionCard
					title={
						<span className="flex items-center gap-2">
							<EyeOff className="size-4 text-ink-3" />
							Quién ve qué del historial
						</span>
					}
					description="Tu competencia nunca ve lo que cobrás."
					bodyClassName="p-0 sm:p-0"
				>
					<ul className="divide-y">
						{projection.map((p) => (
							<li key={p.who} className="flex gap-3 px-4 py-3 sm:px-5">
								<span
									className={cn(
										"h-fit w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-[11.5px] font-semibold",
										p.tone,
									)}
								>
									{p.who}
								</span>
								<p className="text-[13px] text-ink-2">{p.sees}</p>
							</li>
						))}
					</ul>
				</SectionCard>
			</div>
		</PageBody>
	);
}

function TeamCard({
	workshopID,
	isAdmin,
	currentUserID,
	branches,
}: {
	workshopID: string;
	isAdmin: boolean;
	currentUserID: string;
	branches: components["schemas"]["Branch"][];
}) {
	const { data = [], isLoading, error } = useQuery(membersQuery(workshopID));
	const a = adminActions(workshopID);
	const add = useWorkshopMutation(workshopID, a.addMember);
	const remove = useWorkshopMutation(workshopID, a.removeMember);
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [branch, setBranch] = useState("");
	const [role, setRole] = useState<Role>("recepcion");
	const [removing, setRemoving] = useState<(typeof data)[number] | null>(null);
	const branchID = branch || branches[0]?.id || "";

	return (
		<SectionCard
			title={
				<span className="flex items-center gap-2">
					<Users className="size-4 text-ink-3" />
					Equipo
				</span>
			}
			description="Quién puede entrar al panel y con qué permisos"
			actions={
				isAdmin && (
					<Button size="sm" onClick={() => setOpen(true)}>
						<UserPlus className="size-4" />
						Agregar miembro
					</Button>
				)
			}
			bodyClassName="p-0 sm:p-0"
		>
			{isLoading ? (
				<Skeleton className="m-5 h-24" />
			) : error ? (
				<Alert variant="destructive" className="m-4">
					<AlertDescription>{error.message}</AlertDescription>
				</Alert>
			) : (
				<ul className="divide-y">
					{data.map((m) => (
						<li
							key={m.id}
							className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
						>
							<span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-ink-2">
								{m.full_name
									.split(/\s+/)
									.slice(0, 2)
									.map((w) => w[0]?.toUpperCase())
									.join("")}
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate text-[13px] font-semibold">
									{m.full_name}
									{m.user_id === currentUserID && (
										<span className="ml-1.5 font-normal text-ink-3">(vos)</span>
									)}
								</p>
								<p className="truncate text-xs text-ink-3">
									{m.email} · {m.branch_name}
								</p>
							</div>
							<span
								className={cn(
									"rounded-full px-2 py-0.5 text-[11.5px] font-semibold",
									m.role === "admin"
										? "bg-seal-soft text-seal"
										: "bg-secondary text-ink-2",
								)}
							>
								{roleLabel[m.role]}
							</span>
							{isAdmin && (
								<Button
									variant="ghost"
									size="icon"
									className="size-8 text-ink-3 hover:text-destructive"
									aria-label={`Quitar a ${m.full_name} de ${m.branch_name}`}
									onClick={() => setRemoving(m)}
								>
									<Trash2 className="size-4" />
								</Button>
							)}
						</li>
					))}
				</ul>
			)}

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Agregar miembro</DialogTitle>
						<DialogDescription>
							La persona necesita una cuenta de Kilora con ese correo.
						</DialogDescription>
					</DialogHeader>
					<form
						id="member-form"
						className="grid gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							add.mutate(
								{ email, branch_id: branchID, role },
								{
									onSuccess: () => {
										toast.success("Miembro agregado");
										setEmail("");
										setOpen(false);
									},
								},
							);
						}}
					>
						<Label className="grid gap-1.5" htmlFor="member-email">
							Correo
							<Input
								id="member-email"
								type="email"
								required
								autoFocus
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</Label>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="grid gap-1.5">
								<Label htmlFor="member-branch">Sucursal</Label>
								<Select value={branchID} onValueChange={setBranch}>
									<SelectTrigger id="member-branch" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{branches.map((b) => (
											<SelectItem key={b.id} value={b.id}>
												{b.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="member-role">Rol</Label>
								<Select value={role} onValueChange={(v) => setRole(v as Role)}>
									<SelectTrigger id="member-role" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{(["recepcion", "mecanico", "admin"] as Role[]).map((r) => (
											<SelectItem key={r} value={r}>
												{roleLabel[r]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
						<p className="-mt-2 text-xs text-ink-3">{roleHelp[role]}</p>
					</form>
					<DialogFooter>
						<Button variant="outline" onClick={() => setOpen(false)}>
							Cancelar
						</Button>
						<Button
							type="submit"
							form="member-form"
							disabled={add.isPending || !email}
						>
							{add.isPending ? "Agregando…" : "Agregar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={!!removing}
				onOpenChange={(v) => {
					if (!v) setRemoving(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>¿Quitar a {removing?.full_name}?</DialogTitle>
						<DialogDescription>
							Pierde el acceso a {removing?.branch_name}. Sus órdenes y
							registros se conservan.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRemoving(null)}>
							Cancelar
						</Button>
						<Button
							variant="destructive"
							disabled={remove.isPending}
							onClick={() =>
								removing &&
								remove.mutate(removing.id, {
									onSuccess: () => {
										toast.success("Miembro quitado");
										setRemoving(null);
									},
								})
							}
						>
							Quitar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</SectionCard>
	);
}
