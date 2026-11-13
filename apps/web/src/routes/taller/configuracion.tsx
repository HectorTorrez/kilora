import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Archive,
	BadgeCheck,
	Building2,
	FileText,
	MapPin,
	Pencil,
	ShieldCheck,
	UserPlus,
	X,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FormDialog } from "@/components/kilora/form-dialog";
import {
	applyFormError,
	FormActions,
	RootError,
	SelectField,
	SubmitButton,
	TextField,
} from "@/components/kilora/form-fields";
import { emailField, nitLabel } from "@/components/kilora/form-schemas";
import { EditWorkshopDialog } from "@/components/kilora/workshop-form";
import {
	DetailList,
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
import { Form } from "@/components/ui/form";
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
	const [editing, setEditing] = useState(false);

	return (
		<PageBody>
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
				<SectionCard
					title="Datos del taller"
					actions={
						isAdmin && (
							<Button
								size="sm"
								variant="ghost"
								onClick={() => setEditing(true)}
							>
								<Pencil className="size-3.5" />
								Editar
							</Button>
						)
					}
				>
					{isLoading ? (
						<Skeleton className="h-24" />
					) : (
						<div className="space-y-4">
							<div className="flex items-start gap-4">
								<span className="grid size-12 shrink-0 place-items-center rounded-lg bg-seal text-white">
									<Building2 className="size-5" />
								</span>
								<DetailList
									className="flex-1"
									items={[
										{ label: "Nombre comercial", value: data?.workshop.name },
										{
											label: nitLabel(data?.workshop.nit),
											value: data?.workshop.nit,
											mono: true,
											empty: "Sin registrar",
										},
									]}
								/>
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
										La verificación es manual: se confirma{" "}
										{nitLabel(data?.workshop.nit)} y nombre comercial con una
										llamada. El sello aparece en el historial de tus servicios.
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

			{data && isAdmin && (
				<EditWorkshopDialog
					workshopID={workshopID}
					workshop={data.workshop}
					open={editing}
					onOpenChange={setEditing}
				/>
			)}

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
									Historial inalterable.
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
					title="Quién ve qué del historial"
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

type Member = components["schemas"]["Member"];

const memberSchema = z.object({
	email: emailField,
	branch_id: z.string().min(1, "Elegí una sucursal"),
	role: z.enum(["recepcion", "mecanico", "admin"]),
});

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
	const remove = useWorkshopMutation(
		workshopID,
		adminActions(workshopID).removeMember,
	);
	const [open, setOpen] = useState(false);
	const [removing, setRemoving] = useState<Member | null>(null);
	const people = Object.values(
		data.reduce<Record<string, Member[]>>((acc, m) => {
			acc[m.user_id] = [...(acc[m.user_id] ?? []), m];
			return acc;
		}, {}),
	);

	return (
		<SectionCard
			title="Equipo"
			description="Quién puede entrar al panel, en qué sucursal y con qué permisos."
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
					{people.map((memberships) => {
						const m = memberships[0];
						const self = m.user_id === currentUserID;
						return (
							<li
								key={m.user_id}
								className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
							>
								<span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-ink-2">
									{m.full_name
										.split(/\s+/)
										.slice(0, 2)
										.map((w) => w[0]?.toUpperCase())
										.join("")}
								</span>
								<div className="min-w-0 flex-1">
									<p className="truncate text-[13px] font-semibold">
										{m.full_name}
										{self && (
											<span className="ml-1.5 font-normal text-ink-3">
												(vos)
											</span>
										)}
									</p>
									<p className="truncate text-xs text-ink-3">{m.email}</p>
								</div>
								<ul className="flex flex-wrap gap-1.5">
									{memberships.map((ms) => (
										<li
											key={ms.id}
											className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-1 pl-2.5 text-xs"
										>
											<span className="text-ink-2">{ms.branch_name}</span>
											<span
												className={cn(
													"rounded-full px-2 py-px text-[11px] font-semibold",
													ms.role === "admin"
														? "bg-seal-soft text-seal"
														: "bg-secondary text-ink-2",
												)}
											>
												{roleLabel[ms.role]}
											</span>
											{isAdmin && !self && (
												<button
													type="button"
													className="grid size-5 place-items-center rounded-full text-ink-3 hover:bg-destructive/10 hover:text-destructive"
													aria-label={`Quitar a ${ms.full_name} de ${ms.branch_name}`}
													title={`Quitar de ${ms.branch_name}`}
													onClick={() => setRemoving(ms)}
												>
													<X className="size-3" />
												</button>
											)}
										</li>
									))}
								</ul>
							</li>
						);
					})}
				</ul>
			)}

			<FormDialog
				open={open}
				onOpenChange={setOpen}
				title="Agregar miembro"
				description="La persona necesita una cuenta de Kilora con ese correo. Si trabaja en varias sucursales, agregala una vez por sucursal."
			>
				<MemberForm
					workshopID={workshopID}
					branches={branches}
					onDone={() => setOpen(false)}
				/>
			</FormDialog>

			<Dialog
				open={!!removing}
				onOpenChange={(v) => {
					if (!v) setRemoving(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							¿Quitar a {removing?.full_name} de {removing?.branch_name}?
						</DialogTitle>
						<DialogDescription>
							Pierde el acceso a esa sucursal. Sus órdenes y registros se
							conservan.
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
							Quitar acceso
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</SectionCard>
	);
}

function MemberForm({
	workshopID,
	branches,
	onDone,
}: {
	workshopID: string;
	branches: components["schemas"]["Branch"][];
	onDone: () => void;
}) {
	const add = useWorkshopMutation(
		workshopID,
		adminActions(workshopID).addMember,
		{ inlineErrors: true },
	);
	const form = useForm({
		mode: "onChange",
		resolver: zodResolver(memberSchema),
		defaultValues: {
			email: "",
			branch_id: branches[0]?.id ?? "",
			role: "recepcion" as Role,
		},
	});
	const role = form.watch("role");
	const submit = form.handleSubmit(async (values) => {
		form.clearErrors("root");
		try {
			await add.mutateAsync(values);
			toast.success("Miembro agregado");
			onDone();
		} catch (error) {
			applyFormError(form, error);
		}
	});
	return (
		<Form {...form}>
			<form onSubmit={submit} className="grid gap-5" noValidate>
				<TextField
					name="email"
					label="Correo"
					type="email"
					autoComplete="off"
					placeholder="persona@taller.com"
					autoFocus
					required
				/>
				<div className="grid gap-5 sm:grid-cols-2">
					<SelectField
						name="branch_id"
						label="Sucursal"
						options={branches.map((b) => ({ value: b.id, label: b.name }))}
						required
					/>
					<SelectField
						name="role"
						label="Rol"
						options={(["recepcion", "mecanico", "admin"] as Role[]).map(
							(r) => ({ value: r, label: roleLabel[r] }),
						)}
						description={roleHelp[role]}
						required
					/>
				</div>
				<RootError />
				<FormActions>
					<Button
						type="button"
						variant="outline"
						className="w-full sm:w-auto"
						onClick={onDone}
					>
						Cancelar
					</Button>
					<SubmitButton pending={add.isPending} pendingLabel="Agregando…">
						Agregar miembro
					</SubmitButton>
				</FormActions>
			</form>
		</Form>
	);
}
