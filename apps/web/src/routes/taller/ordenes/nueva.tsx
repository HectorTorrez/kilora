import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	Check,
	ChevronRight,
	Eye,
	EyeOff,
	Image as ImageIcon,
	Lock,
	Plus,
	Save,
	Timer,
	Upload,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getHistory, km, money, serviceTemplates, vehicles } from "@/lib/demo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/taller/ordenes/nueva")({
	component: NewOrderPage,
	head: () => ({ meta: [{ title: "Registrar orden · Kilora" }] }),
});

type LineItem = {
	id: number;
	label: string;
	price: number;
};

const vehicle = vehicles[0];

const initialItems: LineItem[] = [
	{ id: 1, label: "Cambio de aceite 5W-30 sintético", price: 45 },
	{ id: 2, label: "Filtro de aceite", price: 12 },
	{ id: 3, label: "Revisión de frenos", price: 0 },
];

function NewOrderPage() {
	const navigate = useNavigate();
	const [items, setItems] = useState<LineItem[]>(initialItems);
	const [nextId, setNextId] = useState(4);
	const [notifyOwner, setNotifyOwner] = useState(true);

	const total = useMemo(
		() => items.reduce((sum, item) => sum + item.price, 0),
		[items],
	);
	const history = getHistory(vehicle);

	function addTemplate(item: string, price: number) {
		setItems((current) => [...current, { id: nextId, label: item, price }]);
		setNextId((id) => id + 1);
		toast.success(`${item} agregado`);
	}

	function removeItem(id: number) {
		setItems((current) => current.filter((item) => item.id !== id));
	}

	function submit() {
		toast.success("Orden registrada · el propietario recibe el enlace");
		navigate({ to: "/taller" });
	}

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
			className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-5 py-6 lg:px-8 lg:py-7"
		>
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<nav
						aria-label="Ruta"
						className="flex items-center gap-1.5 text-[10.5px] text-ink-3"
					>
						<Link
							to="/taller"
							className="transition-colors hover:text-foreground"
						>
							Vehículos
						</Link>
						<ChevronRight className="size-3" aria-hidden="true" />
						<span>{vehicle.plate}</span>
						<ChevronRight className="size-3" aria-hidden="true" />
						<span className="font-medium text-ink-2">Nueva orden</span>
					</nav>
					<h1 className="mt-1.5 font-display text-[29px] leading-none font-bold tracking-[-0.025em]">
						Registrar orden
					</h1>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1.5 font-mono text-[10.5px] text-ink-2">
						<Timer className="size-3 text-ink-3" aria-hidden="true" />3 min
					</span>
					<Button
						type="button"
						variant="outline"
						className="h-9 gap-2 bg-card px-3.5 text-[13px]"
						onClick={() => toast("Borrador guardado")}
					>
						<Save className="size-[15px]" aria-hidden="true" />
						Guardar borrador
					</Button>
					<Button type="submit" className="h-9 gap-2 px-3.5 text-[13px]">
						<Check className="size-[15px]" aria-hidden="true" />
						Registrar orden
					</Button>
				</div>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_352px]">
				<div className="flex min-w-0 flex-col gap-3">
					<div className="flex items-center gap-4 rounded-lg border bg-card px-4.5 py-3.5">
						<div className="min-w-0 flex-1">
							<p className="font-mono text-[19px] font-semibold tracking-[0.02em]">
								{vehicle.plate}
							</p>
							<p className="mt-0.5 text-[11px] text-ink-2">
								{vehicle.model} {vehicle.year} · {vehicle.owner}
							</p>
						</div>
						<span className="hidden items-center gap-1.5 text-[10px] text-ink-3 sm:flex">
							<Timer className="size-3" aria-hidden="true" />
							{history.length} registros · último {km(vehicle.km)} km
						</span>
						<Link
							to="/taller"
							className="text-[11.5px] font-semibold text-seal hover:underline hover:underline-offset-4"
						>
							Cambiar
						</Link>
					</div>

					<div className="flex flex-col gap-3 rounded-lg border bg-card p-4.5">
						<div className="flex items-center justify-between gap-4">
							<p className="text-[13px] font-semibold">Trabajo realizado</p>
							<p className="text-[10px] text-ink-3">
								Se guarda en el historial del vehículo
							</p>
						</div>

						<div className="flex flex-wrap items-center gap-1.5">
							<span className="mr-1 text-[10px] text-ink-3">Plantillas</span>
							{serviceTemplates.map((template) => (
								<button
									key={template.label}
									type="button"
									onClick={() => addTemplate(template.item, template.price)}
									className="pressable rounded-full border bg-paper px-2.5 py-1 text-[10.5px] text-ink-2 hover:border-seal hover:bg-seal-soft hover:text-seal"
								>
									{template.label}
								</button>
							))}
						</div>

						<div>
							{items.map((item) => (
								<div
									key={item.id}
									className="grid grid-cols-[minmax(0,1fr)_2rem_4rem_1.25rem] items-center gap-2.5 border-b py-2.5 text-[12px] last:border-b-0"
								>
									<span className="truncate">{item.label}</span>
									<span className="text-center font-mono text-[10.5px] text-ink-3">
										1
									</span>
									<span className="text-right font-mono text-[11px] tabular-nums">
										{money.format(item.price)}
									</span>
									<button
										type="button"
										onClick={() => removeItem(item.id)}
										aria-label={`Quitar ${item.label}`}
										className="pressable grid place-items-center text-line hover:text-destructive"
									>
										<X className="size-3.5" aria-hidden="true" />
									</button>
								</div>
							))}
							{items.length === 0 ? (
								<p className="py-6 text-center text-[12px] text-ink-3">
									Agregá un trabajo desde una plantilla o escribilo abajo.
								</p>
							) : null}
						</div>

						<button
							type="button"
							onClick={() => toast("Elegí una plantilla o escribí el trabajo")}
							className="pressable flex w-fit items-center gap-1.5 text-[11.5px] font-semibold text-seal"
						>
							<Plus className="size-3.5" aria-hidden="true" />
							Agregar trabajo
						</button>
					</div>

					<div className="grid gap-3.5 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<label
								htmlFor="km"
								className="text-[9.5px] font-semibold tracking-[0.1em] text-ink-3"
							>
								KILOMETRAJE
							</label>
							<Input
								id="km"
								defaultValue={`${km(vehicle.km)} km`}
								inputMode="numeric"
								enterKeyHint="next"
								className="h-9.5 bg-card text-[16px] sm:text-[12px]"
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<label
								htmlFor="fecha"
								className="text-[9.5px] font-semibold tracking-[0.1em] text-ink-3"
							>
								FECHA DEL SERVICIO
							</label>
							<Input
								id="fecha"
								defaultValue="30 oct 2026"
								className="h-9.5 bg-card text-[16px] sm:text-[12px]"
							/>
						</div>
					</div>

					<div className="flex flex-col gap-3 rounded-lg border bg-card p-4.5">
						<div className="flex items-center justify-between gap-4">
							<p className="text-[13px] font-semibold">
								Fotos y notas internas
							</p>
							<p className="text-[10px] text-ink-3">
								Solo visible para tu taller
							</p>
						</div>

						<div className="flex flex-wrap gap-2">
							{["Factura", "Aceite"].map((label) => (
								<div
									key={label}
									className="grid h-[60px] w-[78px] place-items-center rounded-md border bg-paper text-[8.5px] text-ink-3"
								>
									<div className="flex flex-col items-center gap-1">
										<ImageIcon className="size-3.5" aria-hidden="true" />
										{label}
									</div>
								</div>
							))}
							<button
								type="button"
								onClick={() => toast("La carga de fotos llega con el API")}
								className="pressable flex h-[60px] min-w-[180px] flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed bg-paper text-[10.5px] text-ink-3 hover:border-seal hover:bg-seal-soft hover:text-seal"
							>
								<Upload className="size-3.5" aria-hidden="true" />
								Arrastra fotos · sin EXIF
							</button>
						</div>

						<label htmlFor="notas" className="sr-only">
							Notas internas
						</label>
						<Textarea
							id="notas"
							rows={2}
							placeholder="Ej. cliente pidió revisar la fuga de aceite antes del próximo viaje…"
							className="min-h-[52px] resize-none bg-paper text-[16px] sm:text-[11.5px]"
						/>
					</div>

					<div className="flex flex-col gap-2.5 rounded-lg border bg-card p-4.5">
						<div className="flex items-center justify-between gap-4">
							<p className="text-[13px] font-semibold">Historial reciente</p>
							<p className="text-[10px] text-ink-3">
								{history.length} registros · este taller y otros
							</p>
						</div>
						<div className="flex flex-col gap-1.5">
							{history.slice(0, 3).map((entry) => (
								<div
									key={`${entry.date}-${entry.work}`}
									className="grid grid-cols-[82px_minmax(0,1fr)_76px_auto] items-center gap-2.5 text-[11px]"
								>
									<span className="font-mono text-[9.5px] text-ink-3">
										{entry.date}
									</span>
									<span className="truncate">{entry.work}</span>
									<span className="text-right font-mono text-[9.5px] text-ink-3">
										{km(entry.km)} km
									</span>
									<span className="rounded border px-1.5 py-0.5 text-[9px] text-ink-3">
										{entry.shop === "Taller Rivas"
											? "Este taller"
											: "Otro taller"}
									</span>
								</div>
							))}
						</div>
					</div>
				</div>

				<div className="sticky top-6 flex flex-col gap-2.5">
					<div className="flex flex-col gap-2.5 rounded-lg border bg-card p-4.5">
						<p className="text-[12.5px] font-semibold">Resumen</p>
						<div className="flex justify-between text-[11.5px] text-ink-2">
							<span>Mano de obra</span>
							<span className="font-mono text-[11px]">{money.format(0)}</span>
						</div>
						<div className="flex justify-between text-[11.5px] text-ink-2">
							<span>Repuestos</span>
							<span className="font-mono text-[11px]">
								{money.format(total)}
							</span>
						</div>
						<div className="flex justify-between text-[11.5px] text-ink-2">
							<span>Descuento</span>
							<span className="font-mono text-[11px]">— {money.format(0)}</span>
						</div>
						<div className="h-px bg-border" />
						<div className="flex items-end justify-between">
							<span className="text-[11.5px] font-semibold">Total</span>
							<span className="font-display text-[25px] leading-none font-bold tracking-[-0.02em] tabular-nums">
								{money.format(total)}
							</span>
						</div>
					</div>

					<div className="flex flex-col gap-3 rounded-lg border bg-card p-4.5">
						<p className="text-[9.5px] font-semibold tracking-[0.12em] text-ink-3">
							VISIBILIDAD
						</p>
						<div className="flex items-start gap-2.5">
							<Eye
								className="mt-0.5 size-3.5 shrink-0 text-ink-2"
								aria-hidden="true"
							/>
							<div>
								<p className="text-[11.5px] font-semibold">Propietario</p>
								<p className="text-[10px] text-ink-3">
									Ve costo, fotos y detalle
								</p>
							</div>
						</div>
						<div className="flex items-start gap-2.5">
							<EyeOff
								className="mt-0.5 size-3.5 shrink-0 text-ink-2"
								aria-hidden="true"
							/>
							<div>
								<p className="text-[11.5px] font-semibold">Otros talleres</p>
								<p className="text-[10px] text-ink-3">
									Vista ciega: fecha y kilometraje
								</p>
							</div>
						</div>
						<div className="h-px bg-border" />
						<div className="flex items-center justify-between gap-3">
							<div>
								<p className="text-[11.5px] font-semibold">
									Avisar por WhatsApp
								</p>
								<p className="text-[10px] text-ink-3">
									Se envía el enlace del historial
								</p>
							</div>
							<button
								type="button"
								role="switch"
								aria-checked={notifyOwner}
								aria-label="Avisar por WhatsApp"
								onClick={() => setNotifyOwner((value) => !value)}
								className={cn(
									"pressable relative flex h-5 w-[34px] shrink-0 items-center rounded-full p-0.5",
									notifyOwner ? "bg-seal" : "bg-input",
								)}
							>
								<span
									className={cn(
										"size-4 rounded-full bg-white transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
										notifyOwner ? "translate-x-3.5" : "translate-x-0",
									)}
								/>
							</button>
						</div>
					</div>

					<Button type="submit" className="h-9 w-full gap-2 text-[12px]">
						<Check className="size-4" aria-hidden="true" />
						Registrar orden · {money.format(total)}
					</Button>
					<Button
						type="button"
						variant="outline"
						className="h-9 w-full text-[11.5px]"
						onClick={() => toast("Borrador guardado")}
					>
						Guardar borrador
					</Button>
					<p className="flex gap-1.5 px-0.5 text-[9.5px] leading-relaxed text-ink-3">
						<Lock className="mt-px size-3 shrink-0" aria-hidden="true" />
						Los registros no se editan. Cualquier corrección se agrega como
						registro nuevo y fechado.
					</p>
				</div>
			</div>
		</form>
	);
}
