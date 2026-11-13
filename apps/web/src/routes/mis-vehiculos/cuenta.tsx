import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FormDialog } from "@/components/kilora/form-dialog";
import {
	applyFormError,
	PasswordField,
	PhoneField,
	RootError,
	SubmitButton,
	TextField,
} from "@/components/kilora/form-fields";
import { optionalPhone, personName } from "@/components/kilora/form-schemas";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { meQuery, useAccountCredentials, useUpdateProfile } from "@/lib/auth";

export const Route = createFileRoute("/mis-vehiculos/cuenta")({
	component: AccountPage,
});

const profileSchema = z.object({ full_name: personName, phone: optionalPhone });
const credentialSchema = z.object({
	current_password: z.string().min(1, "Ingresá tu contraseña actual"),
	password: z.string(),
	confirmation: z.string(),
});

function AccountPage() {
	const { data: me } = useQuery(meQuery());
	const [deleting, setDeleting] = useState(false);
	if (!me) return null;
	const demo = me.user.email.endsWith("@demo.kilora.app");
	return (
		<main className="mx-auto grid max-w-2xl gap-6 px-5 py-8 pb-28">
			<Link
				to="/mis-vehiculos"
				className="flex items-center gap-2 text-sm text-ink-3"
			>
				<ArrowLeft className="size-4" />
				Mis vehículos
			</Link>
			<div>
				<h1 className="font-display text-3xl font-semibold">Mi cuenta</h1>
				<p className="mt-2 text-sm text-ink-3">
					Administrá tus datos personales y la seguridad de tu cuenta.
				</p>
			</div>
			{demo && (
				<p className="rounded-lg border bg-secondary p-4 text-sm">
					Las cuentas demo permiten consultar esta página, pero no modificar sus
					datos.
				</p>
			)}
			<Card>
				<CardHeader>
					<CardTitle>Perfil</CardTitle>
					<CardDescription>
						Tu correo verificado:{" "}
						<span className="break-all">{me.user.email}</span>
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ProfileForm key={me.user.id} user={me.user} disabled={demo} />
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Cambiar contraseña</CardTitle>
					<CardDescription>
						Al cambiarla, se cerrarán todas tus sesiones. Volvé a ingresar con
						tu nueva contraseña.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<CredentialsForm deleting={false} disabled={demo} />
				</CardContent>
			</Card>
			<Card className="border-destructive/30">
				<CardHeader>
					<CardTitle>Eliminar cuenta</CardTitle>
					<CardDescription>
						Esta acción es permanente. Se eliminarán tus datos de acceso y
						perfil, y tus vehículos se desvincularán. El historial de servicios
						y sus registros se conservan.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4">
					{me.memberships.length > 0 && (
						<p className="text-sm text-ink-3">
							Antes de eliminar tu cuenta, pedí a un administrador que retire
							tus membresías de los talleres. Si sos el único administrador,
							agregá otro primero.
						</p>
					)}
					<Button
						variant="destructive"
						className="w-fit"
						disabled={demo || me.memberships.length > 0}
						onClick={() => setDeleting(true)}
					>
						Eliminar mi cuenta
					</Button>
				</CardContent>
			</Card>
			<FormDialog
				open={deleting}
				onOpenChange={setDeleting}
				title="¿Eliminar tu cuenta permanentemente?"
				description="Perderás el acceso a tus vehículos. Esta acción no se puede deshacer. Confirmá con tu contraseña actual."
			>
				<CredentialsForm
					deleting
					disabled={false}
					onCancel={() => setDeleting(false)}
				/>
			</FormDialog>
		</main>
	);
}

function ProfileForm({
	user,
	disabled,
}: {
	user: { full_name: string; phone?: string | null };
	disabled: boolean;
}) {
	const update = useUpdateProfile();
	const router = useRouter();
	const form = useForm({
		resolver: zodResolver(profileSchema),
		defaultValues: { full_name: user.full_name, phone: user.phone ?? "" },
	});
	return (
		<Form {...form}>
			<form
				className="grid gap-5"
				noValidate
				onSubmit={form.handleSubmit(async (values) => {
					form.clearErrors("root");
					try {
						await update.mutateAsync({
							...values,
							phone: values.phone || null,
						});
						form.reset(values);
						await router.invalidate();
						toast.success("Perfil actualizado");
					} catch (error) {
						applyFormError(form, error);
					}
				})}
			>
				<fieldset
					disabled={disabled || update.isPending}
					className="grid gap-5"
				>
					<TextField
						name="full_name"
						label="Nombre completo"
						autoComplete="name"
						maxLength={100}
						required
					/>
					<PhoneField name="phone" label="Teléfono" optional />
					<RootError />
					<SubmitButton
						pending={update.isPending}
						disabled={!form.formState.isDirty}
					>
						Guardar cambios
					</SubmitButton>
				</fieldset>
			</form>
		</Form>
	);
}

function CredentialsForm({
	deleting,
	disabled,
	onCancel,
}: {
	deleting: boolean;
	disabled: boolean;
	onCancel?: () => void;
}) {
	const mutation = useAccountCredentials();
	const router = useRouter();
	const schema = credentialSchema.superRefine((values, ctx) => {
		if (deleting) return;
		if ([...values.password].length < 8)
			ctx.addIssue({
				code: "custom",
				path: ["password"],
				message: "Usá al menos 8 caracteres",
			});
		if (values.password !== values.confirmation)
			ctx.addIssue({
				code: "custom",
				path: ["confirmation"],
				message: "Las contraseñas no coinciden",
			});
	});
	const form = useForm({
		resolver: zodResolver(schema),
		defaultValues: { current_password: "", password: "", confirmation: "" },
	});
	return (
		<Form {...form}>
			<form
				className="grid gap-5"
				noValidate
				onSubmit={form.handleSubmit(async (values) => {
					form.clearErrors("root");
					try {
						await mutation.mutateAsync({
							deleting,
							current_password: values.current_password,
							password: values.password,
						});
						toast.success(
							deleting
								? "Tu cuenta fue eliminada"
								: "Contraseña actualizada. Iniciá sesión de nuevo.",
						);
						await router.navigate({
							to: "/login",
							search: { redirect: undefined },
						});
						await router.invalidate();
					} catch (error) {
						applyFormError(form, error);
					}
				})}
			>
				<fieldset
					disabled={disabled || mutation.isPending}
					className="grid gap-5"
				>
					<PasswordField
						name="current_password"
						label="Contraseña actual"
						autoComplete="current-password"
						required
					/>
					{!deleting && (
						<>
							<PasswordField
								name="password"
								label="Nueva contraseña"
								autoComplete="new-password"
								required
							/>
							<PasswordField
								name="confirmation"
								label="Confirmar nueva contraseña"
								autoComplete="new-password"
								required
							/>
						</>
					)}
					<RootError />
					<div className="flex flex-wrap justify-end gap-3">
						{onCancel && (
							<Button type="button" variant="outline" onClick={onCancel}>
								Cancelar
							</Button>
						)}
						<SubmitButton
							pending={mutation.isPending}
							variant={deleting ? "destructive" : "default"}
						>
							{deleting
								? "Eliminar cuenta permanentemente"
								: "Cambiar contraseña"}
						</SubmitButton>
					</div>
				</fieldset>
			</form>
		</Form>
	);
}
