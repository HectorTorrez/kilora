import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Account = {
	role: string;
	label: string;
	email: string;
	password: string;
	description: string;
};
export function Demo({ compact = false }: { compact?: boolean }) {
	const [accounts, setAccounts] = useState<Account[]>([]);
	const [busy, setBusy] = useState("");
	const [error, setError] = useState("");
	useEffect(() => {
		fetch("/api/v1/public/demo")
			.then((r) => r.json())
			.then((data) => {
				if (data.enabled) setAccounts(data.accounts);
			})
			.catch(() => {});
	}, []);
	if (!accounts.length) return null;
	async function enter(role: string) {
		setBusy(role);
		setError("");
		try {
			const response = await fetch("/api/v1/auth/demo", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ role }),
			});
			if (!response.ok) throw new Error();
			window.location.assign(
				role === "propietario" ? "/mis-vehiculos" : "/taller",
			);
		} catch {
			setError("No se pudo iniciar la demo. Intentá de nuevo.");
			setBusy("");
		}
	}
	return (
		<section
			className={
				compact ? "mt-8 border-t pt-6" : "mx-auto max-w-6xl px-6 pb-24"
			}
		>
			<h2 className="font-display text-2xl font-bold">Prueba la demo</h2>
			{!compact && (
				<p className="mt-3 max-w-2xl text-ink-3">
					El propietario ve el historial completo; otros talleres ven trabajos y
					kilometraje sin precios ni notas privadas.
				</p>
			)}
			<div
				className={
					compact ? "mt-4 grid gap-3" : "mt-6 grid gap-4 md:grid-cols-3"
				}
			>
				{accounts.map((a) => (
					<div key={a.role} className="rounded-xl border bg-card p-5">
						<h3 className="font-display font-bold">
							{a.role === "taller"
								? "Entrar como taller"
								: a.role === "propietario"
									? "Entrar como propietario"
									: "Ver como otro taller"}
						</h3>
						<p className="mt-2 text-sm text-ink-3">
							{a.label}: {a.description}
						</p>
						{!compact && (
							<p className="mt-3 break-all font-mono text-xs text-ink-3">
								{a.email} / {a.password}
							</p>
						)}
						<Button
							className="mt-4"
							variant={a.role === "taller_competencia" ? "outline" : "default"}
							disabled={!!busy}
							onClick={() => enter(a.role)}
						>
							{busy === a.role ? "Ingresando…" : "Entrar"}
						</Button>
					</div>
				))}
			</div>
			{error && (
				<p role="alert" className="mt-3 text-sm text-destructive">
					{error}
				</p>
			)}
		</section>
	);
}
export function DemoBanner({ email }: { email: string }) {
	return email.toLowerCase().endsWith("@demo.kilora.app") ? (
		<div className="bg-secondary px-4 py-2 text-center text-xs">
			Estás en la demo · los datos son compartidos con otros visitantes
		</div>
	) : null;
}
