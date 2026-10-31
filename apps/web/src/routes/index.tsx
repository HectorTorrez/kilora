import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/")({ component: Home });

const pillars = [
	{
		title: "Para el taller",
		body: "Orden, cotización y trabajos con piezas y fotos, en menos de cinco minutos.",
	},
	{
		title: "Para el propietario",
		body: "El historial completo del vehículo, aunque cambie de taller.",
	},
	{
		title: "La regla del producto",
		body: "Cada taller ve lo que hizo; de los demás ve qué se cambió y cuándo, sin precios ni autores.",
	},
];

function Home() {
	return (
		<main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-10 px-6 py-20">
			<header className="space-y-3">
				<Badge variant="secondary">En construcción</Badge>
				<h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
					Kilora
				</h1>
				<p className="max-w-2xl text-lg text-muted-foreground">
					El historial digital del vehículo: el taller registra sus servicios y
					el propietario los conserva para siempre.
				</p>
			</header>

			<div className="grid gap-4 sm:grid-cols-3">
				{pillars.map((p) => (
					<Card key={p.title}>
						<CardHeader>
							<CardTitle className="text-base">{p.title}</CardTitle>
							<CardDescription>{p.body}</CardDescription>
						</CardHeader>
						<CardContent />
					</Card>
				))}
			</div>
		</main>
	);
}
