import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	meQuery,
	useCreateWorkshop,
	useForgotPassword,
	useLogin,
	useRegister,
	useResetPassword,
	useVerifyEmail,
} from "@/lib/auth";

const schema = z.object({
	full_name: z.string(),
	email: z.string(),
	password: z.string(),
	name: z.string(),
	nit: z.string(),
	branch_name: z.string(),
});
type Values = z.infer<typeof schema>;
type Mode =
	| "login"
	| "registro"
	| "onboarding"
	| "olvide"
	| "restablecer"
	| "verificar";
const details: Record<Mode, [string, string, string]> = {
	login: [
		"Acceso a Kilora",
		"Ingresá a Kilora",
		"Tu historial y el trabajo de tu taller, en un solo lugar.",
	],
	registro: [
		"Crear cuenta",
		"Empezá con Kilora",
		"Creá tu cuenta para conservar el historial de tus vehículos.",
	],
	onboarding: [
		"Tu espacio de trabajo",
		"Creá tu taller",
		"Agregá los datos de tu taller y su primera sucursal.",
	],
	olvide: [
		"Recuperar acceso",
		"¿Olvidaste tu contraseña?",
		"Te enviaremos un enlace para crear una nueva contraseña.",
	],
	restablecer: [
		"Recuperar acceso",
		"Creá una contraseña nueva",
		"Usá una contraseña de al menos 8 caracteres.",
	],
	verificar: [
		"Tu cuenta",
		"Verificá tu correo",
		"Confirmá tu dirección de correo para completar tu cuenta.",
	],
};
export function AuthPage({
	mode,
	token = "",
	redirectTo,
}: {
	mode: Mode;
	token?: string;
	redirectTo?: string;
}) {
	const navigate = useNavigate();
	const qc = useQueryClient();
	const login = useLogin();
	const register = useRegister();
	const workshop = useCreateWorkshop();
	const forgot = useForgotPassword();
	const reset = useResetPassword();
	const verify = useVerifyEmail();
	const mutation = {
		login,
		registro: register,
		onboarding: workshop,
		olvide: forgot,
		restablecer: reset,
		verificar: verify,
	}[mode];
	const form = useForm<Values>({
		resolver: zodResolver(
			schema.superRefine((v, ctx) => {
				const need = (key: keyof Values, message: string) => {
					if (!v[key].trim())
						ctx.addIssue({ code: "custom", path: [key], message });
				};
				if (mode === "registro") need("full_name", "Ingresá tu nombre");
				if (
					["login", "registro", "olvide"].includes(mode) &&
					!z.email().safeParse(v.email).success
				)
					ctx.addIssue({
						code: "custom",
						path: ["email"],
						message: "Ingresá un correo válido",
					});
				if (mode === "login") need("password", "Ingresá tu contraseña");
				if (["registro", "restablecer"].includes(mode) && v.password.length < 8)
					ctx.addIssue({
						code: "custom",
						path: ["password"],
						message: "Usá al menos 8 caracteres",
					});
				if (mode === "onboarding") {
					need("name", "Ingresá el nombre del taller");
					need("branch_name", "Ingresá el nombre de la sucursal");
				}
			}),
		),
		defaultValues: {
			full_name: "",
			email: "",
			password: "",
			name: "",
			nit: "",
			branch_name: "",
		},
	});
	const submit = form.handleSubmit(async (v) => {
		try {
			if (mode === "login") {
				await login.mutateAsync({ email: v.email, password: v.password });
				const me = await qc.fetchQuery(meQuery());
				const safe =
					redirectTo?.startsWith("/") &&
					!redirectTo.startsWith("//") &&
					!redirectTo.startsWith("/\\")
						? redirectTo
						: undefined;
				await navigate({
					href: safe || (me?.memberships.length ? "/taller" : "/mis-vehiculos"),
				});
			}
			if (mode === "registro") {
				await register.mutateAsync({
					full_name: v.full_name,
					email: v.email,
					password: v.password,
				});
				const me = await qc.fetchQuery(meQuery());
				const safe =
					redirectTo?.startsWith("/") &&
					!redirectTo.startsWith("//") &&
					!redirectTo.startsWith("/\\")
						? redirectTo
						: undefined;
				await navigate({
					href: safe || (me?.memberships.length ? "/taller" : "/mis-vehiculos"),
				});
			}
			if (mode === "onboarding") {
				await workshop.mutateAsync({
					name: v.name,
					branch_name: v.branch_name,
					nit: v.nit.trim() || null,
				});
				await navigate({ to: "/taller" });
			}
			if (mode === "olvide") await forgot.mutateAsync({ email: v.email });
			if (mode === "restablecer")
				await reset.mutateAsync({ token, password: v.password });
			if (mode === "verificar") await verify.mutateAsync({ token });
		} catch {
			/* Error shown below. */
		}
	});
	const field = (
		key: keyof Values,
		label: string,
		type = "text",
		autoComplete?: string,
	) => (
		<div className="space-y-2">
			<Label htmlFor={key}>{label}</Label>
			<Input
				id={key}
				type={type}
				autoComplete={autoComplete}
				aria-invalid={!!form.formState.errors[key]}
				aria-describedby={
					form.formState.errors[key] ? `${key}-error` : undefined
				}
				{...form.register(key)}
			/>
			{form.formState.errors[key] && (
				<p id={`${key}-error`} className="text-sm text-destructive">
					{form.formState.errors[key]?.message}
				</p>
			)}
		</div>
	);
	const done =
		mutation.isSuccess && ["olvide", "restablecer", "verificar"].includes(mode);
	return (
		<main className="grid min-h-dvh lg:grid-cols-2">
			<section className="flex flex-col justify-between bg-foreground p-8 text-background md:p-14">
				<Link
					to="/"
					className="font-display text-xl font-bold tracking-[0.2em]"
				>
					KILORA
				</Link>
				<div className="py-12">
					<p className="mb-4 font-mono text-xs uppercase tracking-widest opacity-60">
						Historial digital del vehículo
					</p>
					<h1 className="max-w-lg font-display text-4xl font-bold tracking-tight md:text-5xl">
						El historial del vehículo, en un solo lugar.
					</h1>
					<p className="mt-6 max-w-md leading-relaxed opacity-70">
						El taller registra. El propietario conserva. Cada servicio queda a
						mano, incluso al cambiar de taller.
					</p>
				</div>
				<p className="text-sm opacity-60">Kilora · El Salvador</p>
			</section>
			<section className="flex items-center justify-center bg-background p-6 py-12">
				<div className="w-full max-w-md">
					<p className="font-mono text-xs uppercase tracking-widest text-ink-3">
						{details[mode][0]}
					</p>
					<h2 className="mt-4 font-display text-3xl font-bold tracking-tight">
						{details[mode][1]}
					</h2>
					<p className="mt-3 text-sm leading-relaxed text-ink-3">
						{details[mode][2]}
					</p>
					{done ? (
						<output className="mt-8 block space-y-4">
							<p>
								{mode === "olvide"
									? "Si el correo está registrado, recibirás un enlace de recuperación."
									: mode === "restablecer"
										? "Tu contraseña fue actualizada. Ingresá de nuevo."
										: "Tu correo fue verificado."}
							</p>
							<Link
								className="text-sm font-semibold text-seal"
								to="/login"
								search={{ redirect: undefined }}
							>
								Ir a iniciar sesión
							</Link>
						</output>
					) : (
						<form onSubmit={submit} className="mt-8 space-y-5" noValidate>
							{mode === "registro" &&
								field("full_name", "Nombre completo", "text", "name")}
							{["login", "registro", "olvide"].includes(mode) &&
								field("email", "Correo electrónico", "email", "email")}
							{["login", "registro", "restablecer"].includes(mode) &&
								field(
									"password",
									"Contraseña",
									"password",
									mode === "login" ? "current-password" : "new-password",
								)}
							{mode === "onboarding" && (
								<>
									{field("name", "Nombre del taller")}
									{field("nit", "NIT (opcional)")}
									{field("branch_name", "Nombre de la sucursal")}
								</>
							)}
							{mode === "login" && (
								<div className="text-right">
									<Link
										to="/olvide"
										className="text-sm font-semibold text-seal"
									>
										¿Olvidaste tu contraseña?
									</Link>
								</div>
							)}
							{["restablecer", "verificar"].includes(mode) && !token && (
								<p role="alert" className="text-sm text-destructive">
									El enlace no contiene un token. Solicitá uno nuevo.
								</p>
							)}
							{mutation.error && (
								<p role="alert" className="text-sm text-destructive">
									{mutation.error.message}
								</p>
							)}
							<Button
								className="w-full"
								type="submit"
								disabled={
									mutation.isPending ||
									(["restablecer", "verificar"].includes(mode) && !token)
								}
							>
								{mutation.isPending
									? "Un momento…"
									: {
											login: "Ingresar",
											registro: "Crear cuenta",
											onboarding: "Crear taller",
											olvide: "Enviar enlace",
											restablecer: "Guardar contraseña",
											verificar: "Verificar correo",
										}[mode]}
							</Button>
						</form>
					)}
					{!done && (
						<p className="mt-7 text-center text-sm text-ink-3">
							{mode === "login" ? (
								<>
									¿No tenés cuenta?{" "}
									<Link
										to="/registro"
										search={{ redirect: redirectTo }}
										className="font-semibold text-seal"
									>
										Registrate
									</Link>
								</>
							) : (
								<>
									¿Ya tenés cuenta?{" "}
									<Link
										to="/login"
										search={{ redirect: redirectTo }}
										className="font-semibold text-seal"
									>
										Ingresá
									</Link>
								</>
							)}
						</p>
					)}
				</div>
			</section>
		</main>
	);
}
