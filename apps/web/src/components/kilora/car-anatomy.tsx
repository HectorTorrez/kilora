import { MapPin } from "lucide-react";
import { type ReactNode, useId, useMemo, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	type AnatomyView,
	anatomyGeometry,
	anatomyViewLabels,
	anatomyViews,
	type Shape,
	viewsShowing,
} from "@/lib/car-anatomy";
import { type PartKey, partCatalog, partWhere } from "@/lib/part-catalog";
import { cn } from "@/lib/utils";
import { type BodyType, plans } from "@/lib/vehicle-plans";

const fallbackBody: BodyType = "sedan";

type Highlight = { primary: Shape[]; secondary?: Shape[] };

/** Silueta del vehículo con las piezas resaltadas. */
export function CarAnatomy({
	bodyType,
	view,
	highlight,
	label,
	halo = false,
	className,
	title,
}: {
	bodyType?: BodyType | null;
	view: AnatomyView;
	highlight: Highlight;
	/** Etiqueta que apunta a la pieza (vista ampliada). */
	label?: string;
	/** Aro alrededor de la pieza para que se note en tamaño pequeño. */
	halo?: boolean;
	className?: string;
	title?: string;
}) {
	const maskId = useId();
	const g = anatomyGeometry(bodyType ?? fallbackBody, view);
	const hot = new Set(highlight.primary);
	const soft = new Set(highlight.secondary ?? []);
	// Un punto por pieza resaltada (la misma pieza puede tener varias capas).
	const targets = [
		...new Map(
			g.layers
				.filter((l) => l.shape && l.anchor && hot.has(l.shape))
				.map((l) => [l.shape, l.anchor as [number, number]]),
		).values(),
	];
	const target = targets[0];
	const spread = targets.length
		? Math.max(...targets.map((t) => t[0])) -
			Math.min(...targets.map((t) => t[0]))
		: 0;
	const fontSize = Math.max(11, g.width * 0.034);
	const labelW = label ? label.length * fontSize * 0.56 + fontSize * 1.4 : 0;
	const labelH = fontSize * 1.7;
	const pad = label ? labelH + 8 : 0;
	// En miniatura, las vistas alargadas se acercan a la pieza (sin perder
	// medio vehículo de contexto) para que el resaltado se note.
	const crop =
		halo && target && g.width > g.height * 1.6 && spread < g.width * 0.3
			? (() => {
					const w = Math.max(g.height * 1.6, g.width * 0.6);
					return {
						x: Math.min(Math.max(target[0] - w / 2, 0), g.width - w),
						w,
					};
				})()
			: { x: 0, w: g.width };
	const labelX = target
		? Math.min(Math.max(target[0] - labelW / 2, 2), g.width - labelW - 2)
		: 0;
	return (
		<svg
			viewBox={`${crop.x} ${-pad} ${crop.w} ${g.height + pad}`}
			className={cn("anatomy block h-auto w-full", className)}
			role="img"
			aria-label={title ?? label ?? "Diagrama del vehículo"}
		>
			{g.arches.length > 0 && (
				<defs>
					<mask id={maskId} maskUnits="userSpaceOnUse">
						<rect
							x={0}
							y={-pad}
							width={g.width}
							height={g.height + pad}
							fill="white"
						/>
						{g.arches.map((a) => (
							<circle
								key={`${a.cx}-${a.cy}`}
								cx={a.cx}
								cy={a.cy}
								r={a.r}
								fill="black"
							/>
						))}
					</mask>
				</defs>
			)}
			{g.layers.map((layer, i) => {
				const hl =
					layer.shape && hot.has(layer.shape)
						? "hot"
						: layer.shape && soft.has(layer.shape)
							? "soft"
							: undefined;
				const mask =
					layer.role === "body" && g.arches.length
						? `url(#${maskId})`
						: undefined;
				const path = (
					<path
						// biome-ignore lint/suspicious/noArrayIndexKey: las capas son fijas por vista.
						key={i}
						d={layer.d}
						data-role={layer.role}
						data-hl={hl}
						mask={mask}
					/>
				);
				if (layer.role !== "body") return path;
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: las capas son fijas por vista.
					<g key={i}>
						<path d={layer.d} data-role="outline" data-hl={hl} mask={mask} />
						{path}
					</g>
				);
			})}
			{halo &&
				targets.map((t) => (
					<circle
						key={`${t[0]}-${t[1]}`}
						className="anatomy-halo"
						cx={t[0]}
						cy={t[1]}
						r={crop.w * 0.09}
					/>
				))}
			{target && label && (
				<g>
					<path
						className="anatomy-callout-line"
						d={`M${target[0]} ${target[1]}L${labelX + labelW / 2} ${-pad + labelH}`}
					/>
					<rect
						className="anatomy-callout-pill"
						x={labelX}
						y={-pad}
						width={labelW}
						height={labelH}
						rx={labelH / 2}
					/>
					<text
						className="anatomy-callout-text"
						x={labelX + labelW / 2}
						y={-pad + labelH / 2}
						fontSize={fontSize}
						textAnchor="middle"
						dominantBaseline="central"
					>
						{label}
					</text>
					<circle
						className="anatomy-callout-dot"
						cx={target[0]}
						cy={target[1]}
						r={4}
					/>
				</g>
			)}
		</svg>
	);
}

/** La vista donde mejor se ve la pieza: la primera que la muestra. */
export function bestView(
	part: PartKey,
	bodyType?: BodyType | null,
): AnatomyView {
	const info = partCatalog[part];
	return viewsShowing(bodyType ?? fallbackBody, info.primary)[0] ?? "lateral";
}

/** Miniatura de una pieza para tarjetas e ítems. */
export function PartThumb({
	part,
	bodyType,
	className,
}: {
	part: PartKey;
	bodyType?: BodyType | null;
	className?: string;
}) {
	const info = partCatalog[part];
	return (
		<div className={cn("rounded-md bg-secondary/60 p-1", className)}>
			<CarAnatomy
				bodyType={bodyType}
				view={bestView(part, bodyType)}
				highlight={info}
				halo
				title={`Ubicación: ${info.label}`}
			/>
		</div>
	);
}

/** Botón con miniatura + nombre que abre la ficha de la pieza. */
export function PartButton({
	part,
	bodyType,
	onOpen,
	className,
}: {
	part: PartKey;
	bodyType?: BodyType | null;
	onOpen: (part: PartKey) => void;
	className?: string;
}) {
	const info = partCatalog[part];
	const where = partWhere(part, plans[bodyType ?? fallbackBody]);
	return (
		<button
			type="button"
			onClick={() => onOpen(part)}
			className={cn(
				"group flex w-full cursor-pointer items-center gap-3 rounded-lg border bg-card p-2 text-left transition-colors hover:border-[#f59e7a] hover:bg-secondary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
				className,
			)}
		>
			<PartThumb part={part} bodyType={bodyType} className="w-32 shrink-0" />
			<span className="min-w-0">
				<span className="block text-sm leading-tight font-semibold">
					{info.label}
				</span>
				<span className="mt-1 flex items-start gap-1 text-xs leading-snug text-[#c2410c] dark:text-[#ffb08f]">
					<MapPin className="mt-px size-3 shrink-0" aria-hidden="true" />
					<span className="line-clamp-2">{where}</span>
				</span>
			</span>
		</button>
	);
}

/** Ficha ampliada: dónde está, para qué sirve y cada cuánto se cambia. */
export function PartDialog({
	part,
	bodyType,
	onOpenChange,
	subtitle,
	children,
}: {
	part: PartKey | null;
	bodyType?: BodyType | null;
	onOpenChange: (open: boolean) => void;
	subtitle?: ReactNode;
	/** Datos propios del vehículo (cuándo se cambió, etc.). */
	children?: ReactNode;
}) {
	return (
		<Dialog open={part !== null} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
				{part && (
					<PartDetail part={part} bodyType={bodyType} subtitle={subtitle}>
						{children}
					</PartDetail>
				)}
			</DialogContent>
		</Dialog>
	);
}

function PartDetail({
	part,
	bodyType,
	subtitle,
	children,
}: {
	part: PartKey;
	bodyType?: BodyType | null;
	subtitle?: ReactNode;
	children?: ReactNode;
}) {
	const info = partCatalog[part];
	const body = bodyType ?? fallbackBody;
	const showing = useMemo(() => viewsShowing(body, info.primary), [body, info]);
	const [view, setView] = useState<AnatomyView>(showing[0] ?? "lateral");
	const visible = showing.includes(view);
	const fits = info.fits ? info.fits(plans[body]) : true;
	return (
		<>
			<DialogHeader className="pr-8">
				<DialogTitle className="font-display text-xl">{info.label}</DialogTitle>
				<DialogDescription>
					{subtitle ?? "Dónde está en tu vehículo"}
				</DialogDescription>
			</DialogHeader>
			<figure className="rounded-lg border bg-secondary/40 p-3">
				<CarAnatomy
					bodyType={body}
					view={view}
					highlight={info}
					label={visible ? info.label : undefined}
				/>
				<figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
					<span className="flex items-center gap-1.5">
						<span className="size-2.5 rounded-sm bg-[#f05a28]" />
						La pieza
					</span>
					{info.secondary?.length ? (
						<span className="flex items-center gap-1.5">
							<span className="size-2.5 rounded-sm border border-[#f59e7a] bg-[#fdd8c6]" />
							Trabaja junto a ella
						</span>
					) : null}
				</figcaption>
			</figure>
			<ToggleGroup
				type="single"
				variant="outline"
				value={view}
				onValueChange={(v) => v && setView(v as AnatomyView)}
				className="w-full"
				aria-label="Vista del vehículo"
			>
				{anatomyViews.map((v) => (
					<ToggleGroupItem key={v} value={v} className="flex-1 text-xs">
						{anatomyViewLabels[v]}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			{!visible && (
				<p className="-mt-2 text-xs text-ink-3">
					{showing.length
						? `Desde esta vista no se ve. Probá con "${anatomyViewLabels[showing[0]]}".`
						: "Esta pieza no aparece en el dibujo de este tipo de vehículo."}
				</p>
			)}
			{!fits && (
				<p className="rounded-md bg-secondary p-2 text-xs text-ink-2">
					Este tipo de vehículo normalmente no lleva esta pieza; si tu carro es
					de otro tipo, cambialo en el mapa de piezas.
				</p>
			)}
			<dl className="grid gap-3 text-sm">
				<Section title="Dónde está">{partWhere(part, plans[body])}</Section>
				<Section title="Para qué sirve">{info.what}</Section>
				<Section title="Cada cuánto">{info.every}</Section>
			</dl>
			{children}
		</>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="rounded-lg border p-3">
			<dt className="mb-1 text-[11px] font-bold tracking-wider text-seal uppercase">
				{title}
			</dt>
			<dd className="leading-relaxed text-ink-2">{children}</dd>
		</div>
	);
}
