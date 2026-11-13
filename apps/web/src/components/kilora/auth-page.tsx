import { zodResolver } from "@hookform/resolvers/zod";
import type { components } from "@kilora/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CircleCheck, type LucideIcon, Mail } from "lucide-react";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
	meQuery,
	useCreateWorkshop,
	useForgotPassword,
	useLogin,
	useRegister,
	useResendVerification,
	useResetPassword,
	useVerifyEmail,
} from "@/lib/auth";
import {
	applyFormError,
	NitField,
	PasswordField,
	RequiredLegend,
	RootError,
	SubmitButton,
	TextField,
} from "./form-fields";

import {
	emailField,
	optionalNit,
	personName,
	requiredText,
	workshopName,
} from "./form-schemas";

const schema = z.object({
	full_name: z.string().trim(),
	email: z.string().trim(),
	password: z.string(),
	name: z.string().trim(),
	nit: z.string().trim(),
	branch_name: z.string().trim(),
});
type Values = z.infer<typeof schema>;
type Mode =
	| "login"
	| "registro"
	| "onboarding"
	| "olvide"
	| "restablecer"
	| "verificar"
	| "reenviar";
const details: Record<Mode, [string, string, string]> = {
	reenviar: [
		"Verificación de correo",
		"Solicitá un nuevo enlace",
		"Ingresá tu correo y te enviaremos un enlace para activar tu cuenta.",
	],
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
const pendingLabel: Record<Mode, string> = {
	reenviar: "Enviando…",
	login: "Ingresando…",
	registro: "Creando cuenta…",
	onboarding: "Creando taller…",
	olvide: "Enviando…",
	restablecer: "Guardando…",
	verificar: "Verificando…",
};
const submitLabel: Record<Mode, string> = {
	reenviar: "Reenviar verificación",
	login: "Entrar",
	registro: "Crear cuenta",
	onboarding: "Crear taller",
	olvide: "Enviar enlace",
	restablecer: "Guardar contraseña",
	verificar: "Verificar correo",
};

export function safeRedirect(redirectTo?: string) {
	if (
		redirectTo?.startsWith("/") &&
		!redirectTo.startsWith("//") &&
		!redirectTo.startsWith("/\\")
	)
		return redirectTo;
	return undefined;
}

function successContent(mode: Mode): {
	title: string;
	body: string;
	icon: LucideIcon;
} | null {
	if (mode === "registro")
		return {
			title: "Revisá tu correo",
			body: "Te enviamos un enlace para confirmar tu correo. Vence en 24 horas. Verificá tu dirección antes de iniciar sesión y revisá también la carpeta de spam.",
			icon: Mail,
		};
	if (mode === "reenviar")
		return {
			title: "Revisá tu correo",
			body: "Si la cuenta está pendiente de verificación, recibirás un enlace. Revisá también la carpeta de spam. Si no llega, podés intentarlo de nuevo en 15 minutos.",
			icon: Mail,
		};
	if (mode === "olvide")
		return {
			title: "Revisá tu correo",
			body: "Si el correo está registrado, recibirás un enlace de recuperación.",
			icon: Mail,
		};
	if (mode === "restablecer")
		return {
			title: "Contraseña actualizada",
			body: "Tu contraseña fue actualizada. Ingresá de nuevo.",
			icon: CircleCheck,
		};
	if (mode === "verificar")
		return {
			title: "Correo verificado",
			body: "Tu correo fue verificado. Ya podés iniciar sesión en Kilora.",
			icon: CircleCheck,
		};
	return null;
}

export function AuthPage({
	mode,
	token = "",
	redirectTo,
	demo,
}: {
	mode: Mode;
	token?: string;
	redirectTo?: string;
	demo?: components["schemas"]["DemoInfo"];
}) {
	const accounts = mode === "login" && demo?.enabled ? demo.accounts : [];
	const [demoOpen, setDemoOpen] = useState(false);
	const demoAccountsId = useId();
	const navigate = useNavigate();
	const qc = useQueryClient();
	const login = useLogin();
	const register = useRegister();
	const workshop = useCreateWorkshop();
	const forgot = useForgotPassword();
	const reset = useResetPassword();
	const verify = useVerifyEmail();
	const resend = useResendVerification();
	const mutation = {
		login,
		registro: register,
		onboarding: workshop,
		olvide: forgot,
		restablecer: reset,
		verificar: verify,
		reenviar: resend,
	}[mode];
	const form = useForm<Values>({
		mode: "onChange",
		resolver: zodResolver(
			schema.superRefine((v, ctx) => {
				const need = (key: keyof Values, message: string) => {
					if (!v[key].trim())
						ctx.addIssue({ code: "custom", path: [key], message });
				};
				const check = (key: keyof Values, rule: z.ZodType<string>) => {
					const result = rule.safeParse(v[key]);
					if (!result.success)
						for (const issue of result.error.issues)
							ctx.addIssue({
								code: "custom",
								path: [key],
								message: issue.message,
							});
				};
				if (mode === "registro") check("full_name", personName);
				if (
					["login", "registro", "olvide", "reenviar"].includes(mode) &&
					!emailField.safeParse(v.email).success
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
					check("name", workshopName);
					check("nit", optionalNit);
					check(
						"branch_name",
						requiredText("Ingresá el nombre de la sucursal").max(
							100,
							"Usá como máximo 100 caracteres",
						),
					);
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
	async function enterApp() {
		const me = await qc.fetchQuery(meQuery());
		await navigate({
			href:
				safeRedirect(redirectTo) ||
				(me?.memberships.length ? "/taller" : "/mis-vehiculos"),
		});
	}
	const submit = form.handleSubmit(async (v) => {
		form.clearErrors("root");
		try {
			if (mode === "login") {
				await login.mutateAsync({ email: v.email, password: v.password });
				await enterApp();
			}
			if (mode === "registro") {
				await register.mutateAsync({
					full_name: v.full_name,
					email: v.email,
					password: v.password,
				});
				form.resetField("password");
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
			if (mode === "reenviar") await resend.mutateAsync({ email: v.email });
		} catch (error) {
			applyFormError(form, error);
		}
	});
	const done =
		mutation.isSuccess &&
		["registro", "olvide", "restablecer", "verificar", "reenviar"].includes(
			mode,
		);
	const success = successContent(mode);
	const SuccessIcon = success?.icon;
	return (
		<main className="grid min-h-dvh lg:grid-cols-2">
			<section className="hidden flex-col justify-between bg-foreground p-8 text-background lg:flex lg:p-14">
				<Link
					to="/"
					className="font-display text-xl font-bold tracking-[0.2em]"
				>
					KILORA
				</Link>
				<div>
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
			<section className="flex flex-col bg-background px-6 py-8 lg:justify-center lg:px-8 lg:py-12">
				<header className="mb-8 lg:hidden">
					<Link
						to="/"
						className="font-display text-xl font-bold tracking-[0.2em]"
					>
						KILORA
					</Link>
				</header>
				<div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
					<p className="font-mono text-xs uppercase tracking-widest text-ink-3">
						{details[mode][0]}
					</p>
					<h2 className="mt-4 font-display text-3xl font-bold tracking-tight">
						{details[mode][1]}
					</h2>
					<p className="mt-3 text-sm leading-relaxed text-ink-3">
						{details[mode][2]}
					</p>
					{done && success && SuccessIcon ? (
						<output className="mt-8 block rounded-lg border bg-card px-6 py-8 text-center">
							<div className="mx-auto flex size-12 items-center justify-center rounded-full bg-ok-soft text-ok">
								<SuccessIcon className="size-6" />
							</div>
							<p className="mt-4 font-display text-xl font-bold">
								{success.title}
							</p>
							<p className="mt-2 text-sm leading-relaxed text-ink-3">
								{success.body}
							</p>
							<Button asChild className="mt-6 w-full">
								<Link to="/login" search={{ redirect: redirectTo }}>
									Ir a iniciar sesión
								</Link>
							</Button>
							{mode === "registro" && (
								<p className="mt-4 text-sm">
									<Link
										to="/verificar"
										search={{ token: "" }}
										className="font-semibold text-seal"
									>
										¿No recibiste el correo? Reenviar enlace
									</Link>
								</p>
							)}
						</output>
					) : (
						<Form {...form}>
							<form onSubmit={submit} className="mt-8 grid gap-5" noValidate>
								{(mode === "registro" || mode === "onboarding") && (
									<RequiredLegend />
								)}
								{mode === "registro" && (
									<TextField
										name="full_name"
										maxLength={100}
										inputPattern={/^[\p{L}\p{M} ’'.-]*$/u}
										label="Nombre completo"
										autoComplete="name"
										autoFocus
										required
									/>
								)}
								{["login", "registro", "olvide", "reenviar"].includes(mode) && (
									<TextField
										name="email"
										label="Correo electrónico"
										type="email"
										autoComplete="email"
										autoFocus={mode !== "registro"}
										required
									/>
								)}
								{["login", "registro", "restablecer"].includes(mode) && (
									<PasswordField
										name="password"
										label="Contraseña"
										autoComplete={
											mode === "login" ? "current-password" : "new-password"
										}
										autoFocus={mode === "restablecer"}
										required
									/>
								)}
								{mode === "onboarding" && (
									<>
										<TextField
											name="name"
											label="Nombre del taller"
											autoFocus
											required
										/>
										<NitField optional />
										<TextField
											name="branch_name"
											label="Nombre de la sucursal"
											required
										/>
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
									<Alert
										variant="destructive"
										className="text-sm text-destructive"
									>
										<AlertDescription>
											El enlace no contiene un token. Solicitá uno nuevo.
										</AlertDescription>
									</Alert>
								)}
								<RootError />
								<SubmitButton
									pending={mutation.isPending}
									pendingLabel={pendingLabel[mode]}
									className="w-full"
									autoFocus={mode === "verificar"}
									disabled={
										["restablecer", "verificar"].includes(mode) && !token
									}
								>
									{submitLabel[mode]}
								</SubmitButton>
							</form>
							{accounts.length > 0 && (
								<div className="mt-5">
									<Button
										type="button"
										variant="ghost"
										className="w-full"
										aria-expanded={demoOpen}
										aria-controls={demoAccountsId}
										onClick={() => setDemoOpen(!demoOpen)}
									>
										{demoOpen ? "Ocultar cuentas demo" : "Ver cuentas demo"}
									</Button>
									<div id={demoAccountsId} hidden={!demoOpen}>
										<p className="mt-3 text-sm text-ink-3">
											Elegí una cuenta para probar Kilora. Sus credenciales se
											completarán al pulsar “Usar esta cuenta”.
										</p>
										<ul className="mt-3 grid gap-3">
											{accounts.map((account) => (
												<li
													key={account.role}
													className="rounded-lg border p-4"
												>
													<p className="text-sm font-semibold">
														{account.role === "taller"
															? "Taller"
															: account.role === "propietario"
																? "Propietario"
																: "Otro taller"}
													</p>
													<dl className="mt-3 space-y-2 text-sm">
														<div>
															<dt className="text-ink-3">Correo electrónico</dt>
															<dd className="break-all font-mono">
																{account.email}
															</dd>
														</div>
														<div>
															<dt className="text-ink-3">Contraseña</dt>
															<dd className="break-all font-mono">
																{account.password}
															</dd>
														</div>
													</dl>
													<Button
														type="button"
														variant="outline"
														className="mt-4 w-full"
														onClick={() => {
															form.clearErrors("root");
															form.setValue("email", account.email, {
																shouldValidate: true,
															});
															form.setValue("password", account.password, {
																shouldValidate: true,
															});
															setDemoOpen(false);
															form.setFocus("email");
														}}
													>
														Usar esta cuenta
													</Button>
												</li>
											))}
										</ul>
									</div>
								</div>
							)}
						</Form>
					)}
					{!done && ["login", "registro", "verificar"].includes(mode) && (
						<p className="mt-5 text-center text-sm">
							<Link
								to="/verificar"
								search={{ token: "" }}
								className="font-semibold text-seal"
							>
								Solicitar un nuevo correo de verificación
							</Link>
						</p>
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
