import type { components } from "@kilora/contracts";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function Demo({ demo }: { demo: components["schemas"]["DemoInfo"] }) {
	const [busy, setBusy] = useState("");
	const [error, setError] = useState("");
	const accounts = demo.enabled ? demo.accounts : [];
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
	const meta: Record<string, { title: string; tag: string }> = {
		taller: { title: "Entrar como taller", tag: "Recepción" },
		propietario: {
			title: "Entrar como propietario",
			tag: "Historial completo",
		},
		taller_competencia: { title: "Ver como otro taller", tag: "Vista ciega" },
	};
	return (
		<section
			id="demo"
			aria-labelledby="demo-title"
			className="scroll-mt-14 border-b bg-surface/60"
		>
			<div className="frame px-5 py-20 md:px-8 md:py-28">
				<div className="reveal grid gap-6 lg:grid-cols-[14rem_1fr] lg:gap-10">
					<p className="font-mono text-[11px] uppercase tracking-widest text-ink-3">
						<span className="text-seal">[06]</span> Demo en vivo
					</p>
					<div>
						<h2
							id="demo-title"
							className="max-w-3xl font-display text-3xl leading-[1.08] font-bold tracking-[-0.02em] text-balance md:text-5xl"
						>
							Probá Kilora con datos reales, en un clic.
						</h2>
						<p className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-ink-2">
							Entrá con el mismo vehículo desde tres miradas distintas. El
							propietario ve el historial completo; otro taller ve trabajos y
							kilometraje sin precios ni notas privadas.
						</p>
					</div>
				</div>
				<ul className="mt-14 grid gap-px overflow-hidden rounded-lg border bg-line md:grid-cols-3">
					{accounts.map((a, i) => (
						<li
							key={a.role}
							className="reveal flex flex-col bg-card p-6 md:p-7"
						>
							<div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-ink-3">
								<span>{meta[a.role]?.tag ?? a.role}</span>
								<span>0{i + 1}</span>
							</div>
							<h3 className="mt-6 font-display text-xl font-bold">
								{meta[a.role]?.title ?? a.label}
							</h3>
							<p className="mt-2 flex-1 text-sm leading-relaxed text-ink-2">
								{a.label}: {a.description}
							</p>
							<p className="mt-5 break-all rounded-md border bg-surface px-3 py-2 font-mono text-xs text-ink-3">
								{a.email} / {a.password}
							</p>
							<Button
								className="mt-5 w-full"
								variant={
									a.role === "taller_competencia" ? "outline" : "default"
								}
								disabled={!!busy}
								onClick={() => enter(a.role)}
							>
								{busy === a.role ? "Ingresando…" : "Entrar a la demo"}
							</Button>
						</li>
					))}
				</ul>
				{error && (
					<p role="alert" className="mt-4 text-sm text-destructive">
						{error}
					</p>
				)}
			</div>
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
