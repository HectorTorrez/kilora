import type { components } from "@kilora/contracts";
import {
	BatteryCharging,
	Car,
	CircleDot,
	Cog,
	Disc3,
	Droplet,
	LifeBuoy,
	Move3d,
	RotateCcw,
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
import { bodyTypeLabels } from "@/lib/domain";
import { day, km } from "@/lib/format";
import {
	type Axle,
	type AxleSummary,
	axleLabels,
	axles,
	isAxleZone,
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
	const summary = useMemo(
		() => summarizeZones(records, currentKm),
		[records, currentKm],
	);
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
	const [webgl, setWebgl] = useState<boolean | null>(null);
	const [type, setType] = useState<BodyType | null>(bodyType ?? null);
	const [saving, setSaving] = useState(false);
	const pins = useRef<Partial<Record<PinId, HTMLElement | null>>>({});
	useEffect(() => setWebgl(hasWebGL()), []);
	useEffect(() => setType(bodyType ?? null), [bodyType]);

	const shown = type ?? "sedan";
	const plan = plans[shown];
	const serviced = zones.filter((z) => summary[z].last).length;
	const select = useCallback((zone: Zone, pin?: PinId) => {
		setSelected(zone);
		setAutoRotate(false);
		setFocus((f) => ({ pin: pin ?? (zone as PinId), key: f.key + 1 }));
	}, []);
	const stopRotating = useCallback(() => setAutoRotate(false), []);
	const changeType = async (next: BodyType) => {
		setType(next);
		setFocus((f) => ({ pin: null, key: f.key + 1 }));
		setAutoRotate(true);
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

	return (
		<section
			aria-labelledby="car-map-title"
			className="car-map overflow-hidden rounded-xl text-slate-100"
		>
			<div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
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
					</p>
				</div>
				<label className="grid gap-1 text-xs text-slate-400">
					Tipo de vehículo
					<select
						value={type ?? ""}
						disabled={saving}
						onChange={(e) => changeType(e.target.value as BodyType)}
						className="h-9 cursor-pointer rounded-lg border border-white/15 bg-slate-950/70 px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 disabled:opacity-60"
					>
						{!type && (
							<option value="" disabled>
								Elegí el tipo…
							</option>
						)}
						{bodyTypes.map((b) => (
							<option key={b} value={b}>
								{bodyTypeLabels[b]}
							</option>
						))}
					</select>
				</label>
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
					<div className="relative h-[360px] sm:h-[460px]">
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
									onInteract={stopRotating}
									pins={pins}
								/>
							</Suspense>
						) : (
							<SceneLoading />
						)}
						{webgl && (
							<>
								<div className="pointer-events-none absolute inset-0 overflow-hidden">
									{pinList.map(({ id, zone, axle }) => {
										const s = axle
											? summary[zone].axles?.[axle]
											: summary[zone];
										const count = s?.events.length ?? 0;
										const active = selected === zone || hover === zone;
										const color = statusColor[s?.status ?? "sin-registro"];
										const label = axle
											? `${zoneInfo[zone].label} ${axle === "front" ? "del." : "tras."}`
											: zoneInfo[zone].label;
										return (
											<button
												key={id}
												ref={(el) => {
													pins.current[id] = el;
												}}
												type="button"
												tabIndex={-1}
												onClick={() => select(zone, id)}
												onMouseEnter={() => setHover(zone)}
												onMouseLeave={() => setHover(null)}
												aria-label={`${label}: ${count} servicios`}
												className={cn(
													"pointer-events-auto absolute top-0 left-0 flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-slate-950/80 p-0.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur-sm",
													active && "z-10 pr-2.5",
													!count && !active && "hidden",
												)}
												style={{
													visibility: "hidden",
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
											</button>
										);
									})}
								</div>
								<p className="pointer-events-none absolute bottom-3 left-4 flex items-center gap-1.5 text-xs text-slate-400">
									<Move3d className="size-3.5" />
									Arrastrá para girar · pellizcá para acercar
								</p>
								<button
									type="button"
									onClick={() => {
										setFocus((f) => ({ pin: null, key: f.key + 1 }));
										setAutoRotate(true);
									}}
									className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 backdrop-blur-sm transition-colors hover:bg-white/10"
								>
									<RotateCcw className="size-3.5" />
									Vista general
								</button>
							</>
						)}
					</div>

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
		</section>
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
}: {
	summary: ZoneSummary;
	plan: VehiclePlan;
}) {
	const info = zoneInfo[summary.zone];
	const Icon = zoneIcons[summary.zone];
	const color = statusColor[summary.status];
	return (
		<div
			id="car-map-detail"
			role="tabpanel"
			aria-live="polite"
			className="border-t border-white/10 bg-white/[0.03] p-5 sm:p-6 lg:border-t-0 lg:border-l"
		>
			<div className="flex items-start justify-between gap-3">
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
