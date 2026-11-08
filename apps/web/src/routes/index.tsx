import { createFileRoute, Link } from "@tanstack/react-router";
import { Demo } from "@/components/kilora/demo";
import { buttonVariants } from "@/components/ui/button";
import { demoQuery } from "@/lib/demo-accounts";
export const Route = createFileRoute("/")({
	loader: ({ context }) => context.queryClient.ensureQueryData(demoQuery()),
	component: Landing,
});
function Landing() {
	const demo = Route.useLoaderData();
	return (
		<main className="min-h-dvh bg-background">
			<header className="mx-auto flex max-w-6xl items-center justify-between border-b px-6 py-6">
				<span className="font-display text-xl font-bold tracking-[0.2em]">
					KILORA
				</span>
				<Link
					to="/login"
					search={{ redirect: undefined }}
					className={buttonVariants()}
				>
					Ingresar
				</Link>
			</header>
			<section className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:grid-cols-2 md:items-center">
				<div>
					<p className="font-mono text-xs uppercase tracking-widest text-ink-3">
						Historial digital del vehículo
					</p>
					<h1 className="mt-6 font-display text-5xl font-bold tracking-tight md:text-6xl">
						El historial de tu carro no debería quedar{" "}
						<span className="text-seal">en el taller.</span>
					</h1>
					<p className="mt-6 max-w-lg leading-relaxed text-ink-3">
						Kilora guarda cada servicio y kilometraje. Cambiá de taller y el
						historial viaja con el carro.
					</p>
					<Link
						to="/login"
						search={{ redirect: undefined }}
						className={`${buttonVariants()} mt-8`}
					>
						Entrar
					</Link>
					<Link
						to="/registro"
						search={{ redirect: undefined }}
						className={`${buttonVariants({ variant: "outline" })} mt-8 ml-3`}
					>
						Crear cuenta
					</Link>
				</div>
				<div className="rounded-xl border bg-card p-8 shadow-sm">
					<p className="font-mono text-xs uppercase tracking-widest text-ink-3">
						Un historial para siempre
					</p>
					<h2 className="mt-4 font-display text-2xl font-bold">
						Cada servicio cuenta.
					</h2>
					<p className="mt-4 leading-relaxed text-ink-3">
						Registrá el trabajo de tu taller y ayudá a tus clientes a conservar
						la historia de su vehículo.
					</p>
				</div>
			</section>
			<Demo demo={demo} />
		</main>
	);
}
