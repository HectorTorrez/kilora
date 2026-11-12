import type { components } from "@kilora/contracts";
import {
	BatteryCharging,
	Boxes,
	Car,
	CircleDot,
	Cog,
	Disc3,
	Droplet,
	HeartPulse,
	LifeBuoy,
	Move3d,
	Pause,
	Play,
	RotateCcw,
	ScanLine,
	Snowflake,
	Thermometer,
	Waves,
	Wind,
	Wrench,
	Zap,
} from "lucide-react";
import {
	type KeyboardEvent,
	lazy,
	type ReactNode,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { bodyTypeLabels } from "@/lib/domain";
import { day, km } from "@/lib/format";
import {
	type Axle,
	type AxleSummary,
	axleLabels,
	axles,
	type Health,
	healthColor,
	healthOf,
	isAxleZone,
	recordZones,
	statusColor,
	statusLabels,
	summarizeZones,
	type Zone,
	type ZoneSummary,
	zoneInfo,
	zones,
} from "@/lib/parts-map";
import { cn } from "@/lib/utils";
import {
	type BodyType,
	type PinId,
	plans,
	type VehiclePlan,
	zoneArea,
} from "@/lib/vehicle-plans";
import type { SceneMode } from "./car-3d-scene";

// three.js pesa: se carga aparte y solo en el navegador.
const CarScene = lazy(() => import("./car-3d-scene"));

type HistoryRecord = components["schemas"]["HistoryRecord"];

const zoneIcons: Record<Zone, typeof Droplet> = {
	aceite: Droplet,
	motor: Wrench,
	refrigeracion: Thermometer,
	aire_acondicionado: Snowflake,
	bateria: BatteryCharging,
	electrico: Zap,
	transmision: Cog,
	direccion: LifeBuoy,
	frenos: Disc3,
	amortiguadores: Waves,
	llantas: CircleDot,
	escape: Wind,
	carroceria: Car,
};

const bodyTypes = Object.keys(bodyTypeLabels) as BodyType[];

/** Un pin por zona; las zonas de eje llevan uno por eje. */
type Pin = { id: PinId; zone: Zone; axle?: Axle };
const pinList: Pin[] = zones.flatMap((zone): Pin[] =>
	isAxleZone(zone)
		? axles.map((axle) => ({ id: `${zone}:${axle}` as PinId, zone, axle }))
		: [{ id: zone as PinId, zone }],
);

/** Clases de los controles oscuros sobre el canvas. */
const glassButton =
	"border border-white/10 bg-slate-950/60 text-slate-200 backdrop-blur-sm hover:bg-white/10 hover:text-white";

function ago(months: number) {
	if (months <= 0) return "este mes";
	if (months < 24) return `hace ${months} ${months === 1 ? "mes" : "meses"}`;
	return `hace ${Math.floor(months / 12)} años`;
}

function hasWebGL() {
	try {
		const canvas = document.createElement("canvas");
		return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
	} catch {
		return false;
	}
}

function useIsDesktop() {
	const [desktop, setDesktop] = useState(true);
	useEffect(() => {
		const media = window.matchMedia("(min-width: 1024px)");
		const update = () => setDesktop(media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);
	return desktop;
}

const STEP_MS = 1100;

export function CarPartsMap({
	records,
	currentKm,
	bodyType,
	onBodyTypeChange,
}: {
	records: HistoryRecord[];
	currentKm: number | null | undefined;
	/** null: el vehículo aún no tiene tipo; se muestra un sedán y se pide elegir. */
	bodyType: BodyType | null | undefined;
	onBodyTypeChange?: (bodyType: BodyType) => Promise<unknown>;
}) {
	// Línea de tiempo: null = hoy (todo el historial); un índice = hasta ese servicio.
	const chrono = useMemo(
		() =>
			[...records].sort((a, b) => a.performed_on.localeCompare(b.performed_on)),
		[records],
	);
	const [step, setStep] = useState<number | null>(null);
	const [playing, setPlaying] = useState(false);
	const view = useMemo(() => {
		if (step === null) return { records, km: currentKm, today: new Date() };
		const upTo = chrono.slice(0, step + 1);
		const kms = upTo
			.map((r) => r.odometer_km)
			.filter((k): k is number => k != null);
		return {
			records: upTo,
			km: kms.length ? Math.max(...kms) : null,
			today: new Date(`${chrono[step].performed_on.slice(0, 10)}T12:00:00Z`),
		};
	}, [step, chrono, records, currentKm]);
	const summary = useMemo(
		() => summarizeZones(view.records, view.km, view.today),
		[view],
	);
	const health = useMemo(() => healthOf(summary), [summary]);

	const mostRecent = useMemo(
		() =>
			zones
				.filter((z) => summary[z].last)
				.sort((a, b) =>
					(summary[b].last?.record.performed_on ?? "").localeCompare(
						summary[a].last?.record.performed_on ?? "",
					),
				)[0],
		[summary],
	);
	const [selected, setSelected] = useState<Zone>(mostRecent ?? "aceite");
	const [hover, setHover] = useState<Zone | null>(null);
	const [focus, setFocus] = useState<{ pin: PinId | null; key: number }>({
		pin: null,
		key: 0,
	});
	const [autoRotate, setAutoRotate] = useState(true);
	const [isolate, setIsolate] = useState(false);
	const [exploded, setExploded] = useState(false);
	const [mode, setMode] = useState<SceneMode>("zonas");
	const [sheetOpen, setSheetOpen] = useState(false);
	const [webgl, setWebgl] = useState<boolean | null>(null);
	const [type, setType] = useState<BodyType | null>(bodyType ?? null);
	const [saving, setSaving] = useState(false);
	const pins = useRef<Partial<Record<PinId, HTMLElement | null>>>({});
	const stage = useRef<HTMLDivElement>(null);
	const desktop = useIsDesktop();
	useEffect(() => setWebgl(hasWebGL()), []);
	useEffect(() => setType(bodyType ?? null), [bodyType]);

	const shown = type ?? "sedan";
	const plan = plans[shown];
	const serviced = zones.filter((z) => summary[z].last).length;

	const select = useCallback(
		(zone: Zone, pin?: PinId) => {
			setSelected(zone);
			setAutoRotate(false);
			setIsolate(true);
			setFocus((f) => ({ pin: pin ?? (zone as PinId), key: f.key + 1 }));
			if (!desktop) {
				// Deja el modelo arriba y la hoja abajo: se ve la pieza y su detalle.
				stage.current?.scrollIntoView({ behavior: "smooth", block: "start" });
				setSheetOpen(true);
			}
		},
		[desktop],
	);
	const stopRotating = useCallback(() => setAutoRotate(false), []);
	const overview = () => {
		setIsolate(false);
		setFocus((f) => ({ pin: null, key: f.key + 1 }));
		setAutoRotate(true);
	};
	const changeType = async (next: BodyType) => {
		setType(next);
		overview();
		if (!onBodyTypeChange) return;
		setSaving(true);
		try {
			await onBodyTypeChange(next);
		} catch {
			setType(bodyType ?? null);
		} finally {
			setSaving(false);
		}
	};

	// Reproducción: avanza servicio por servicio y resalta la zona que tocó.
	useEffect(() => {
		if (!playing) return;
		const id = window.setInterval(() => {
			setStep((s) => {
				const next = s === null ? 0 : s + 1;
				if (next >= chrono.length) {
					setPlaying(false);
					return null;
				}
				const [zone] = recordZones(chrono[next]);
				if (zone) setSelected(zone);
				return next;
			});
		}, STEP_MS);
		return () => window.clearInterval(id);
	}, [playing, chrono]);
	const play = () => {
		if (playing) return setPlaying(false);
		setIsolate(false);
		setMode("zonas");
		setStep(0);
		const [zone] = chrono[0] ? recordZones(chrono[0]) : [];
		if (zone) setSelected(zone);
		setPlaying(true);
	};
	const stepRecord = step === null ? null : chrono[step];

	return (
		<section
			aria-labelledby="car-map-title"
			className="car-map overflow-hidden rounded-xl text-slate-100"
		>
			<div className="flex flex-wrap items-end justify-between gap-4 px-5 pt-5 pb-4 sm:px-6">
				<div className="flex items-center gap-4">
					<HealthGauge health={health} />
					<div>
						<p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sky-300/70">
							Mapa 3D del vehículo
						</p>
						<h2
							id="car-map-title"
							className="mt-1 font-display text-xl font-bold sm:text-2xl"
						>
							¿Dónde se le ha trabajado?
						</h2>
						<p className="mt-1 text-sm text-slate-400">
							{serviced} de {zones.length} zonas con servicios
							{health.revisar > 0 && (
								<span style={{ color: statusColor.revisar }}>
									{" "}
									· {health.revisar} por revisar
								</span>
							)}
							{health.pronto > 0 && (
								<span style={{ color: statusColor.pronto }}>
									{" "}
									· {health.pronto} pronto
								</span>
							)}
						</p>
					</div>
				</div>
				<div className="grid gap-1">
					<Label
						htmlFor="car-map-body-type"
						className="text-xs font-normal text-slate-400"
					>
						Tipo de vehículo
					</Label>
					<Select
						value={type ?? undefined}
						disabled={saving}
						onValueChange={(value) => changeType(value as BodyType)}
					>
						<SelectTrigger
							id="car-map-body-type"
							size="sm"
							className="min-w-44 border-white/15 bg-slate-950/70 text-white hover:bg-slate-900 data-[placeholder]:text-slate-400 [&_svg:not([class*='text-'])]:text-slate-300"
						>
							<SelectValue placeholder="Elegí el tipo…" />
						</SelectTrigger>
						{/* El panel es oscuro en ambos temas: el menú también. */}
						<SelectContent position="popper" align="end" className="dark">
							{bodyTypes.map((b) => (
								<SelectItem key={b} value={b}>
									{bodyTypeLabels[b]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			{!type && (
				<p className="mx-5 mb-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-100 sm:mx-6">
					Mostramos un sedán de ejemplo. Elegí el tipo de tu vehículo para ver
					sus piezas reales (por ejemplo, una pickup tiene palangana, cardán y
					ballestas).
				</p>
			)}

			<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px]">
				<div className="min-w-0">
					<div
						ref={stage}
						className="relative h-[380px] scroll-mt-16 sm:h-[460px]"
					>
						{webgl === false ? (
							<p className="grid h-full place-items-center px-8 text-center text-sm text-slate-400">
								Tu navegador no puede mostrar el modelo 3D. Elegí una zona abajo
								para ver sus servicios.
							</p>
						) : webgl ? (
							<Suspense fallback={<SceneLoading />}>
								<CarScene
									bodyType={shown}
									summary={summary}
									selected={selected}
									hover={hover}
									onHover={setHover}
									onSelect={select}
									focus={focus}
									autoRotate={autoRotate}
									exploded={exploded}
									onInteract={stopRotating}
									isolate={isolate}
									mode={mode}
									healthTint={healthColor(health.score)}
									pins={pins}
								/>
							</Suspense>
						) : (
							<SceneLoading />
						)}
						{webgl && (
							<>
								<div className="pointer-events-none absolute inset-0 overflow-hidden">
									{pinList.map(({ id, zone, axle }) => (
										<PinMarker
											key={id}
											ref={(el) => {
												pins.current[id] = el;
											}}
											zone={zone}
											axle={axle}
											summary={summary[zone]}
											active={selected === zone || hover === zone}
											// Aislando una zona, solo quedan sus pines.
											hidden={isolate && mode === "zonas" && selected !== zone}
											onSelect={() => select(zone, id)}
											onHover={setHover}
										/>
									))}
								</div>
								<div className="absolute top-3 left-3 flex flex-wrap gap-2">
									<ToggleGroup
										type="single"
										size="sm"
										value={mode}
										onValueChange={(value) => {
											if (!value) return;
											setMode(value as SceneMode);
											if (value === "salud") setIsolate(false);
										}}
										aria-label="Modo de vista"
										className={cn("rounded-full p-0.5", glassButton)}
									>
										<ToggleGroupItem
											value="zonas"
											className="rounded-full px-3 text-xs data-[state=on]:bg-white/15 data-[state=on]:text-white"
										>
											<ScanLine className="size-3.5" />
											Zonas
										</ToggleGroupItem>
										<ToggleGroupItem
											value="salud"
											className="rounded-full px-3 text-xs data-[state=on]:bg-white/15 data-[state=on]:text-white"
										>
											<HeartPulse className="size-3.5" />
											Salud
										</ToggleGroupItem>
									</ToggleGroup>
									<Toggle
										size="sm"
										pressed={exploded}
										onPressedChange={(on) => {
											setExploded(on);
											overview();
										}}
										aria-label="Vista explotada"
										className={cn(
											"rounded-full px-3 text-xs data-[state=on]:bg-sky-300/20 data-[state=on]:text-white",
											glassButton,
										)}
									>
										<Boxes className="size-3.5" />
										Explotar
									</Toggle>
								</div>
								<button
									type="button"
									onClick={overview}
									aria-label="Vista general"
									className={cn(
										"absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors",
										glassButton,
									)}
								>
									<RotateCcw className="size-3.5" />
									<span className="hidden sm:inline">Vista general</span>
								</button>
								<p className="pointer-events-none absolute bottom-3 left-4 hidden items-center gap-1.5 text-xs text-slate-400 sm:flex">
									<Move3d className="size-3.5" />
									Arrastrá para girar · pellizcá para acercar
								</p>
							</>
						)}
					</div>

					{chrono.length > 0 && (
						<div className="flex items-center gap-3 border-y border-white/5 bg-slate-950/40 px-4 py-3 sm:px-5">
							<button
								type="button"
								onClick={play}
								aria-label={
									playing ? "Pausar historial" : "Reproducir historial"
								}
								className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-sky-300/15 text-sky-100 transition-colors hover:bg-sky-300/25"
							>
								{playing ? (
									<Pause className="size-4" />
								) : (
									<Play className="size-4" />
								)}
							</button>
							<div className="min-w-0 flex-1">
								<div className="flex items-baseline justify-between gap-3 text-xs">
									<span className="truncate text-slate-300">
										{stepRecord
											? `${day(stepRecord.performed_on)} · ${stepRecord.summary}`
											: "Hoy · todo el historial"}
									</span>
									<span className="shrink-0 font-mono text-slate-500">
										{km(stepRecord ? stepRecord.odometer_km : currentKm)}
									</span>
								</div>
								<Slider
									className="mt-2 [&_[data-slot=slider-range]]:bg-sky-300 [&_[data-slot=slider-track]]:bg-white/10 [&_[data-slot=slider-thumb]]:border-sky-300"
									min={0}
									max={chrono.length}
									step={1}
									value={[step === null ? chrono.length : step]}
									onValueChange={([v]) => {
										setPlaying(false);
										setStep(v >= chrono.length ? null : v);
									}}
									aria-label="Línea de tiempo del historial"
								/>
							</div>
						</div>
					)}

					<div
						className="flex gap-2 overflow-x-auto px-4 pt-3 pb-5 [scrollbar-width:none] sm:px-5 lg:flex-wrap"
						role="tablist"
						aria-label="Zonas del vehículo"
					>
						{zones.map((zone) => {
							const Icon = zoneIcons[zone];
							const s = summary[zone];
							return (
								<button
									key={zone}
									type="button"
									role="tab"
									aria-selected={selected === zone}
									aria-controls="car-map-detail"
									onClick={() => select(zone)}
									onMouseEnter={() => setHover(zone)}
									onMouseLeave={() => setHover(null)}
									onKeyDown={(e) => moveTab(e, zone, select)}
									tabIndex={selected === zone ? 0 : -1}
									className={cn(
										"flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
										selected === zone
											? "border-sky-300/60 bg-sky-300/15 text-white"
											: s.last
												? "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10"
												: "border-white/5 text-slate-500 hover:bg-white/5",
									)}
								>
									<Icon
										className="size-4"
										style={{ color: statusColor[s.status] }}
									/>
									{zoneInfo[zone].label}
									{s.events.length > 0 && (
										<span className="font-mono text-xs text-slate-400">
											{s.events.length}
										</span>
									)}
								</button>
							);
						})}
					</div>
				</div>

				<ZoneDetail summary={summary[selected]} plan={plan} />
			</div>

			{/* En celular el detalle sube como hoja al tocar una zona. */}
			{/* Sin fondo oscuro y a media altura: el modelo sigue visible arriba. */}
			<Sheet
				open={sheetOpen && !desktop}
				onOpenChange={setSheetOpen}
				modal={false}
			>
				<SheetContent
					side="bottom"
					onInteractOutside={(e) => e.preventDefault()}
					className="dark max-h-[52dvh] overflow-y-auto rounded-t-2xl border-white/10 bg-[#07101f]/95 p-0 text-slate-100 shadow-[0_-12px_40px_rgb(0_0_0/0.5)] backdrop-blur"
				>
					<SheetTitle className="sr-only">
						{zoneInfo[selected].label}
					</SheetTitle>
					<SheetDescription className="sr-only">
						Servicios y estado de esta zona del vehículo.
					</SheetDescription>
					<ZoneDetail summary={summary[selected]} plan={plan} inSheet />
				</SheetContent>
			</Sheet>
		</section>
	);
}

/** Medidor circular de salud general (0–100). */
function HealthGauge({ health }: { health: Health }) {
	const color = healthColor(health.score);
	const r = 27;
	const c = 2 * Math.PI * r;
	const pct = (health.score ?? 0) / 100;
	return (
		<div
			className="relative grid size-16 shrink-0 place-items-center"
			role="img"
			aria-label={
				health.score === null
					? "Salud del vehículo: sin datos suficientes"
					: `Salud del vehículo: ${health.score} de 100`
			}
		>
			<svg
				viewBox="0 0 64 64"
				className="absolute inset-0 -rotate-90"
				aria-hidden="true"
			>
				<circle
					cx="32"
					cy="32"
					r={r}
					fill="none"
					stroke="rgb(255 255 255 / 0.1)"
					strokeWidth="4"
				/>
				<circle
					cx="32"
					cy="32"
					r={r}
					fill="none"
					stroke={color}
					strokeWidth="4"
					strokeLinecap="round"
					strokeDasharray={`${c * pct} ${c}`}
					style={{
						filter: `drop-shadow(0 0 6px ${color})`,
						transition: "stroke-dasharray 600ms var(--ease-out)",
					}}
				/>
			</svg>
			<div className="text-center leading-none">
				<p className="font-display text-base font-bold">
					{health.score ?? "—"}
				</p>
				<p className="mt-0.5 text-[8px] uppercase tracking-wider text-slate-400">
					Salud
				</p>
			</div>
		</div>
	);
}

/**
 * Pin de una zona. La escena lo mueve a su posición cada cuadro y lo agrupa
 * con los vecinos encimados ("+N"). El activo se eleva con una línea guía.
 */
function PinMarker({
	ref,
	zone,
	axle,
	summary,
	active,
	hidden,
	onSelect,
	onHover,
}: {
	ref: (el: HTMLDivElement | null) => void;
	hidden: boolean;
	zone: Zone;
	axle?: Axle;
	summary: ZoneSummary;
	active: boolean;
	onSelect: () => void;
	onHover: (zone: Zone | null) => void;
}) {
	const s = axle ? summary.axles?.[axle] : summary;
	const count = s?.events.length ?? 0;
	const color = statusColor[s?.status ?? "sin-registro"];
	const label = axle
		? `${zoneInfo[zone].label} ${axle === "front" ? "del." : "tras."}`
		: zoneInfo[zone].label;
	return (
		<div
			ref={ref}
			data-enabled={!hidden && (count || active) ? "1" : "0"}
			data-active={active ? "1" : "0"}
			data-count={count}
			className="absolute top-0 left-0"
			style={{ visibility: "hidden" }}
		>
			<span
				className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
				style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
			/>
			{active && (
				<span
					className="absolute -top-9 left-0 h-9 w-px -translate-x-1/2"
					style={{
						background: `linear-gradient(to top, ${color}, transparent)`,
					}}
				/>
			)}
			<button
				type="button"
				tabIndex={-1}
				onClick={onSelect}
				onMouseEnter={() => onHover(zone)}
				onMouseLeave={() => onHover(null)}
				aria-label={`${label}: ${count} servicios`}
				className={cn(
					"pointer-events-auto absolute left-0 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-slate-950/85 p-0.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur-sm transition-[top] duration-200",
					active ? "-top-[3.7rem] z-10 pr-2.5" : "-top-3",
				)}
				style={{
					boxShadow: active
						? `0 0 0 1.5px ${color}, 0 0 18px ${color}`
						: undefined,
				}}
			>
				<span
					className="grid size-5 place-items-center rounded-full font-mono text-[11px] text-slate-950"
					style={{ backgroundColor: color }}
				>
					{count || "–"}
				</span>
				{active && label}
				<span
					data-extra
					hidden
					className="rounded-full bg-white/15 px-1.5 font-mono text-[10px] text-slate-200"
				/>
			</button>
		</div>
	);
}

function SceneLoading() {
	return (
		<div className="grid h-full place-items-center">
			<div className="flex flex-col items-center gap-3 text-sm text-slate-400">
				<span className="size-10 animate-spin rounded-full border-2 border-sky-300/20 border-t-sky-300" />
				Cargando modelo 3D…
			</div>
		</div>
	);
}

function moveTab(
	event: KeyboardEvent<HTMLButtonElement>,
	zone: Zone,
	select: (zone: Zone) => void,
) {
	const delta =
		event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
	if (!delta) return;
	event.preventDefault();
	const next =
		zones[(zones.indexOf(zone) + delta + zones.length) % zones.length];
	select(next);
	const tabs = event.currentTarget.parentElement?.querySelectorAll("button");
	tabs?.[zones.indexOf(next)]?.focus();
}

function ZoneDetail({
	summary,
	plan,
	inSheet,
}: {
	summary: ZoneSummary;
	plan: VehiclePlan;
	/** Dentro de la hoja de celular: sin id/rol (los tiene el panel principal). */
	inSheet?: boolean;
}) {
	const info = zoneInfo[summary.zone];
	const Icon = zoneIcons[summary.zone];
	const color = statusColor[summary.status];
	return (
		<div
			id={inSheet ? undefined : "car-map-detail"}
			role={inSheet ? undefined : "tabpanel"}
			aria-live={inSheet ? undefined : "polite"}
			className={cn(
				"p-5 sm:p-6",
				!inSheet &&
					"border-t border-white/10 bg-white/[0.03] lg:border-t-0 lg:border-l",
			)}
		>
			<div
				className={cn(
					"flex items-start justify-between gap-3",
					inSheet && "pr-10",
				)}
			>
				<div>
					<p className="text-xs uppercase tracking-wider text-slate-400">
						{zoneArea(summary.zone, plan, info.area)}
					</p>
					<h3 className="mt-1 flex items-center gap-2 font-display text-lg font-bold">
						<Icon className="size-5" style={{ color }} />
						{info.label}
					</h3>
				</div>
				<StatusPill status={summary.status} />
			</div>

			{summary.axles ? (
				<div className="mt-5 grid gap-3">
					{axles.map((axle) => (
						<AxleCard
							key={axle}
							axle={axle}
							summary={summary.axles?.[axle] as AxleSummary}
						/>
					))}
				</div>
			) : summary.last ? (
				<Freshness summary={summary} />
			) : null}

			{summary.events.length > 0 ? (
				<div className="mt-5">
					<p className="text-xs uppercase tracking-wider text-slate-400">
						{summary.events.length === 1
							? "Servicio"
							: `${summary.events.length} servicios`}
					</p>
					<ol className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
						{summary.events.map(({ record, items, axles: on }) => (
							<li
								key={record.id}
								className="rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2"
							>
								<p className="flex items-center justify-between gap-2 font-mono text-[11px] text-slate-400">
									<span>
										{day(record.performed_on)} · {km(record.odometer_km)}
									</span>
									{on.length === 1 && (
										<span className="rounded bg-white/10 px-1.5 py-px font-sans text-[10px] text-slate-200">
											{axleLabels[on[0]]}
										</span>
									)}
								</p>
								<p className="mt-0.5 text-sm font-medium">
									{items.length
										? [
												...new Set(items.map((i) => i.description || i.name)),
											].join(", ")
										: record.summary}
								</p>
								<p className="text-xs text-sky-300/80">
									{record.workshop_name ||
										(record.source === "propietario"
											? "Registro personal"
											: "Taller")}
								</p>
							</li>
						))}
					</ol>
				</div>
			) : (
				<p className="mt-5 text-sm leading-relaxed text-slate-400">
					Todavía no hay servicios de {info.label.toLowerCase()} en el
					historial. Cuando un taller o vos registren uno, esta zona se va a
					iluminar en el modelo.
				</p>
			)}
			{(info.km || info.months) && summary.events.length > 0 && (
				<p className="mt-4 text-[11px] leading-relaxed text-slate-500">
					Intervalo de referencia:{" "}
					{[info.km && km(info.km), info.months && `${info.months} meses`]
						.filter(Boolean)
						.join(" o ")}
					. Tu taller puede recomendar otro según tu vehículo.
				</p>
			)}
		</div>
	);
}

function StatusPill({ status }: { status: ZoneSummary["status"] }) {
	const color = statusColor[status];
	return (
		<span
			className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
			style={{ color, backgroundColor: `${color}1f` }}
		>
			{statusLabels[status]}
		</span>
	);
}

function AxleCard({ axle, summary }: { axle: Axle; summary: AxleSummary }) {
	return (
		<div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm font-semibold">{axleLabels[axle]}</p>
				<StatusPill status={summary.status} />
			</div>
			{summary.last ? (
				<Freshness summary={summary} compact />
			) : (
				<p className="mt-1 text-xs text-slate-400">Sin cambios registrados.</p>
			)}
		</div>
	);
}

function Freshness({
	summary,
	compact,
}: {
	summary: AxleSummary | ZoneSummary;
	compact?: boolean;
}) {
	const last = summary.last;
	if (!last) return null;
	const color = statusColor[summary.status];
	return (
		<>
			<dl className={cn("grid grid-cols-2 gap-4", compact ? "mt-2" : "mt-5")}>
				<Stat
					label="Último cambio"
					value={day(last.record.performed_on)}
					compact={compact}
				>
					{summary.monthsSince != null && ago(summary.monthsSince)}
				</Stat>
				<Stat
					label="Desde entonces"
					value={summary.kmSince != null ? km(summary.kmSince) : "—"}
					compact={compact}
				>
					{last.record.odometer_km != null &&
						`a los ${km(last.record.odometer_km)}`}
				</Stat>
			</dl>
			{summary.wear != null && (
				<div className={compact ? "mt-2" : "mt-5"}>
					{!compact && (
						<div className="flex justify-between text-xs text-slate-400">
							<span>Uso del intervalo de referencia</span>
							<span className="font-mono">
								{Math.round(Math.min(summary.wear, 1) * 100)}%
							</span>
						</div>
					)}
					<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
						<div
							className="h-full rounded-full transition-[width] duration-500"
							style={{
								width: `${Math.max(4, Math.min(summary.wear, 1) * 100)}%`,
								backgroundColor: color,
								boxShadow: `0 0 12px ${color}`,
							}}
						/>
					</div>
				</div>
			)}
		</>
	);
}

function Stat({
	label,
	value,
	compact,
	children,
}: {
	label: string;
	value: string;
	compact?: boolean;
	children?: ReactNode;
}) {
	return (
		<div>
			<dt className="text-xs text-slate-400">{label}</dt>
			<dd
				className={cn(
					"mt-0.5 font-display font-bold leading-tight",
					compact ? "text-base" : "text-lg",
				)}
			>
				{value}
			</dd>
			{children && <dd className="text-xs text-slate-400">{children}</dd>}
		</div>
	);
}
