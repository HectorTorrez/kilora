import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ChevronLeft,
	Image as ImageIcon,
	MessageCircle,
	Share2,
	ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	getHistory,
	type HistoryEntry,
	km,
	money,
	plateFromSlug,
	vehicles,
} from "@/lib/demo";

export const Route = createFileRoute("/h/$placa")({
	component: OwnerHistoryPage,
	head: () => ({ meta: [{ title: "Historial del vehículo · Kilora" }] }),
});

function OwnerHistoryPage() {
	const { placa } = Route.useParams();
	const plate = plateFromSlug(placa);
	const vehicle = vehicles.find((item) => item.plate === plate);
	const [pageUrl, setPageUrl] = useState("");

	useEffect(() => {
		setPageUrl(window.location.href);
	}, []);

	if (!vehicle) {
		return (
			<main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-4 px-8 text-center">
				<p className="font-display text-2xl font-bold">
					Vehículo no encontrado
				</p>
				<p className="text-[13px] text-ink-2">
					No tenemos un historial para la placa <strong>{plate}</strong>. Pedile
					al taller que te comparta el enlace.
				</p>
				<Button asChild variant="outline">
					<Link to="/taller">Volver al taller</Link>
				</Button>
			</main>
		);
	}

	const history = getHistory(vehicle);
	const years = groupByYear(history);

	async function share() {
		const url = pageUrl || window.location.href;

		if (typeof navigator !== "undefined" && navigator.share) {
			try {
				await navigator.share({
					title: `Historial de ${vehicle?.plate}`,
					url,
				});
				return;
			} catch {
				// El usuario canceló el share nativo.
			}
		}

		if (typeof navigator !== "undefined" && navigator.clipboard) {
			await navigator.clipboard.writeText(url);
			toast.success("Enlace copiado");
		}
	}

	return (
		<div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col border-x bg-background">
			<header className="flex min-h-11 items-center justify-between px-4 pt-[env(safe-area-inset-top,0px)]">
				<Link
					to="/taller"
					className="flex items-center gap-0.5 text-[12.5px] text-ink-2 transition-colors hover:text-foreground"
				>
					<ChevronLeft className="size-5" aria-hidden="true" />
					Mi vehículo
				</Link>
				<button
					type="button"
					aria-label="Compartir"
					onClick={share}
					className="pressable p-1 text-ink-2 hover:text-foreground"
				>
					<Share2 className="size-[17px]" aria-hidden="true" />
				</button>
			</header>

			<section className="flex flex-col gap-2.5 px-5 pt-2 pb-4">
				<h1 className="font-mono text-[32px] leading-none font-semibold tracking-[0.03em]">
					{vehicle.plate}
				</h1>
				<div className="flex items-baseline justify-between gap-3">
					<p className="text-[13px] text-ink-2">
						{vehicle.model} {vehicle.year}
					</p>
					<p className="font-mono text-[12px] text-ink-3">
						{km(vehicle.km)} km
					</p>
				</div>
				<span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-seal-soft px-2 py-1 text-[10.5px] font-semibold text-seal">
					<ShieldCheck className="size-3.5" aria-hidden="true" />
					Taller Rivas · verificado
				</span>

				<div className="mt-1 grid grid-cols-3 rounded-lg border bg-card px-3.5 py-2.5">
					<div>
						<p className="font-display text-[17px] font-bold tracking-[-0.02em]">
							{history.length}
						</p>
						<p className="text-[9px] text-ink-3">servicios</p>
					</div>
					<div>
						<p className="font-display text-[17px] font-bold tracking-[-0.02em]">
							{new Set(history.map((entry) => entry.shop)).size}
						</p>
						<p className="text-[9px] text-ink-3">talleres</p>
					</div>
					<div>
						<p className="font-display text-[17px] font-bold tracking-[-0.02em]">
							{2021}
						</p>
						<p className="text-[9px] text-ink-3">desde</p>
					</div>
				</div>
			</section>

			<section className="flex flex-col px-5">
				{years.map(([year, entries]) => (
					<div key={year} className="flex flex-col">
						<div className="flex items-center gap-2.5 py-3">
							<span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-ink-3">
								{year}
							</span>
							<span className="h-px flex-1 bg-line" />
						</div>
						{entries.map((entry) => (
							<div
								key={`${entry.date}-${entry.work}`}
								className="grid grid-cols-[34px_minmax(0,1fr)_50px] gap-3 border-b py-2.5 last:border-b-0"
							>
								<div className="flex flex-col leading-[1.1]">
									<span className="font-mono text-[15px] font-semibold">
										{entry.date.split(" ")[0]}
									</span>
									<span className="font-mono text-[8px] tracking-[0.1em] text-ink-3 uppercase">
										{entry.date.split(" ")[1]}
									</span>
								</div>
								<div className="flex min-w-0 flex-col gap-1">
									<p className="text-[12px] leading-snug font-semibold">
										{entry.work}
									</p>
									<p className="flex items-center gap-1 text-[10px] text-ink-2">
										<ShieldCheck
											className="size-3 text-seal"
											aria-hidden="true"
										/>
										{entry.shop}
									</p>
									<p className="flex items-center gap-1.5 font-mono text-[9px] text-ink-3">
										{km(entry.km)} km
										<span className="size-0.5 rounded-full bg-ink-3" />
										{money.format(entry.price)}
									</p>
								</div>
								<div className="grid size-[50px] place-items-center rounded-md border bg-card text-ink-3">
									<ImageIcon className="size-3.5" aria-hidden="true" />
								</div>
							</div>
						))}
					</div>
				))}
			</section>

			<section className="mx-5 mt-4 flex flex-col gap-2.5 rounded-lg border bg-card px-3.5 py-3">
				<div className="flex items-center justify-between gap-3">
					<p className="text-[11.5px] font-semibold">Ficha del vehículo</p>
					<p className="text-[9px] text-ink-3">Registrada por Taller Rivas</p>
				</div>
				<div className="grid grid-cols-2 gap-2.5">
					<div>
						<p className="text-[8px] font-semibold tracking-[0.1em] text-ink-3">
							AÑO
						</p>
						<p className="font-mono text-[10.5px]">{vehicle.year}</p>
					</div>
					<div>
						<p className="text-[8px] font-semibold tracking-[0.1em] text-ink-3">
							MOTOR
						</p>
						<p className="font-mono text-[10.5px]">1.8L · 4 cil.</p>
					</div>
					<div>
						<p className="text-[8px] font-semibold tracking-[0.1em] text-ink-3">
							COLOR
						</p>
						<p className="font-mono text-[10.5px]">Blanco perla</p>
					</div>
					<div>
						<p className="text-[8px] font-semibold tracking-[0.1em] text-ink-3">
							VIN
						</p>
						<p className="font-mono text-[10.5px]">JT2BB1HE4K0…4471</p>
					</div>
				</div>
			</section>

			<p className="px-5 py-4 text-center text-[9px] text-ink-3">
				Historial inmutable · cada registro queda fechado
			</p>

			<div className="sticky bottom-0 mt-auto flex gap-2 border-t bg-card px-4 pt-2.5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
				<Button onClick={share} className="h-9.5 flex-1 gap-2 text-[12px]">
					<Share2 className="size-4" aria-hidden="true" />
					Compartir historial
				</Button>
				<Button
					asChild
					variant="outline"
					className="h-9.5 w-11 border-input bg-card px-0 text-seal"
				>
					<a
						href={`https://wa.me/?text=${encodeURIComponent(
							`Historial de ${vehicle.plate}: ${pageUrl}`,
						)}`}
						target="_blank"
						rel="noreferrer"
						aria-label="Enviar por WhatsApp"
					>
						<MessageCircle className="size-[18px]" aria-hidden="true" />
					</a>
				</Button>
			</div>
		</div>
	);
}

function groupByYear(history: HistoryEntry[]) {
	const groups = new Map<string, HistoryEntry[]>();

	for (const entry of history) {
		const year = entry.date.split(" ").at(-1) ?? "—";
		const list = groups.get(year) ?? [];
		list.push(entry);
		groups.set(year, list);
	}

	return [...groups.entries()];
}
