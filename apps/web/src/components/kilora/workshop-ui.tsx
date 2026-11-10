import type { components } from "@kilora/contracts";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy, type LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

type S = components["schemas"];

/** Link de "volver" que va arriba del título de una página de detalle. */
export function BackLink({
	children,
	className,
	...props
}: Omit<React.ComponentProps<typeof Link>, "children"> & {
	children: ReactNode;
}) {
	return (
		<Link
			{...props}
			className={cn(
				"inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-foreground print:hidden",
				className as string,
			)}
		>
			<ArrowLeft className="size-3.5" aria-hidden="true" />
			{children}
		</Link>
	);
}

export function PageHeader({
	back,
	eyebrow,
	title,
	badges,
	description,
	actions,
	className,
}: {
	back?: ReactNode;
	eyebrow?: ReactNode;
	title: ReactNode;
	badges?: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<header className={cn("space-y-3", className)}>
			{back}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div className="min-w-0 flex-1">
					{eyebrow && (
						<p className="mb-1 font-mono text-[11px] tracking-widest text-ink-3 uppercase">
							{eyebrow}
						</p>
					)}
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
						<h1 className="flex min-w-0 flex-wrap items-center gap-3 font-display text-[28px] leading-tight font-bold tracking-[-0.01em] text-balance">
							{title}
						</h1>
						{badges}
					</div>
					{description && (
						<div className="mt-1.5 max-w-2xl text-sm text-pretty text-ink-3">
							{description}
						</div>
					)}
				</div>
				{actions && (
					<div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
				)}
			</div>
		</header>
	);
}

export function PageBody({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<main
			className={cn(
				"mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:py-8",
				className,
			)}
		>
			{children}
		</main>
	);
}

/** Barra de una lista: búsqueda y filtros por columna. */
export function ListToolbar({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-wrap items-center gap-2 border-b px-3 py-3 sm:px-4">
			{children}
		</div>
	);
}

/** Valor vacío uniforme: siempre "—" gris, nunca en monoespaciada. */
export function Missing({ children = "—" }: { children?: ReactNode }) {
	return <span className="font-sans font-normal text-ink-3">{children}</span>;
}

const isBlank = (value: ReactNode) =>
	value === null ||
	value === undefined ||
	value === false ||
	value === "" ||
	value === "—";

export function DetailList({
	items,
	className,
}: {
	items: {
		label: ReactNode;
		value: ReactNode;
		mono?: boolean;
		empty?: ReactNode;
	}[];
	className?: string;
}) {
	return (
		<dl
			className={cn(
				"grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[13px]",
				className,
			)}
		>
			{items.map((item, index) => (
				<Fragment
					// biome-ignore lint/suspicious/noArrayIndexKey: lista estática.
					key={index}
				>
					<dt className="text-ink-3">{item.label}</dt>
					<dd
						className={cn(
							"min-w-0 truncate text-right font-medium",
							item.mono && "font-mono font-normal tabular-nums",
						)}
					>
						{isBlank(item.value) ? <Missing>{item.empty}</Missing> : item.value}
					</dd>
				</Fragment>
			))}
		</dl>
	);
}

/** Enlace para compartir con botón de copiar. */
export function CopyField({ value, label }: { value: string; label: string }) {
	return (
		<div className="flex gap-2">
			<Input
				readOnly
				value={value}
				aria-label={label}
				className="font-mono text-xs"
				onFocus={(event) => event.currentTarget.select()}
			/>
			<Button
				type="button"
				variant="outline"
				onClick={async () => {
					await navigator.clipboard.writeText(value);
					toast.success("Enlace copiado");
				}}
			>
				<Copy className="size-4" />
				Copiar
			</Button>
		</div>
	);
}

const orderTone: Record<S["WorkOrderStatus"], { pill: string; dot: string }> = {
	recibido: { pill: "bg-secondary text-ink-2", dot: "bg-ink-3" },
	diagnostico: { pill: "bg-info-soft text-info", dot: "bg-info" },
	en_reparacion: { pill: "bg-warn-soft text-warn", dot: "bg-warn" },
	listo: { pill: "bg-ok-soft text-ok", dot: "bg-ok" },
	cancelado: {
		pill: "bg-destructive/10 text-destructive",
		dot: "bg-destructive",
	},
};

export const orderDot = (status: S["WorkOrderStatus"]) => orderTone[status].dot;

export function OrderStatusBadge({
	status,
	className,
}: {
	status: S["WorkOrderStatus"];
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap",
				orderTone[status].pill,
				className,
			)}
		>
			<span className={cn("size-1.5 rounded-full", orderTone[status].dot)} />
			{statusLabel(status)}
		</span>
	);
}

const vehicleCopy: Record<S["VehicleStatus"], string> = {
	provisional: "Provisional",
	vinculado: "Vinculado",
	archivado: "Archivado",
};

export function VehicleStatusBadge({ status }: { status: S["VehicleStatus"] }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap",
				status === "vinculado"
					? "bg-seal-soft text-seal"
					: status === "provisional"
						? "bg-secondary text-ink-2"
						: "bg-secondary text-ink-3",
			)}
		>
			{vehicleCopy[status]}
		</span>
	);
}

export function Plate({
	value,
	className,
}: {
	value: string | null | undefined;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded border border-foreground/15 bg-card px-1.5 py-0.5 font-mono text-[12.5px] font-semibold tracking-wider whitespace-nowrap",
				!value && "border-dashed font-normal text-ink-3",
				className,
			)}
		>
			{value || "SIN PLACA"}
		</span>
	);
}

export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
}: {
	icon: LucideIcon;
	title: string;
	description?: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center px-6 py-14 text-center">
			<div className="grid size-11 place-items-center rounded-full bg-secondary text-ink-3">
				<Icon className="size-5" aria-hidden="true" />
			</div>
			<p className="mt-4 font-semibold">{title}</p>
			{description && (
				<p className="mt-1 max-w-sm text-sm text-pretty text-ink-3">
					{description}
				</p>
			)}
			{action && <div className="mt-5">{action}</div>}
		</div>
	);
}

export function StatCard({
	label,
	value,
	hint,
	icon: Icon,
	tone = "default",
	interactive = false,
}: {
	label: string;
	value: ReactNode;
	hint?: ReactNode;
	icon: LucideIcon;
	tone?: "default" | "warn" | "ok" | "seal";
	/** Si va envuelta en un link: muestra el hover. */
	interactive?: boolean;
}) {
	return (
		<Card
			className={cn(
				"h-full gap-0 p-4 shadow-none sm:p-5",
				interactive &&
					"transition-colors group-hover:border-seal/40 group-hover:bg-seal-soft/30 group-focus-visible:ring-2 group-focus-visible:ring-ring",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<p className="text-[12.5px] font-medium text-ink-3">{label}</p>
				<span
					className={cn(
						"grid size-7 place-items-center rounded-md",
						tone === "warn" && "bg-warn-soft text-warn",
						tone === "ok" && "bg-ok-soft text-ok",
						tone === "seal" && "bg-seal-soft text-seal",
						tone === "default" && "bg-secondary text-ink-2",
					)}
				>
					<Icon className="size-3.5" aria-hidden="true" />
				</span>
			</div>
			<p className="mt-3 font-display text-3xl font-bold tabular-nums">
				{value}
			</p>
			{hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
		</Card>
	);
}

export function SectionCard({
	id,
	title,
	description,
	actions,
	children,
	className,
	bodyClassName,
}: {
	id?: string;
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
	bodyClassName?: string;
}) {
	return (
		<Card
			id={id}
			className={cn("gap-0 overflow-hidden py-0 shadow-none", className)}
		>
			<div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
				<div className="min-w-0 flex-1">
					<h2 className="text-[14px] font-semibold">{title}</h2>
					{description && (
						<p className="mt-0.5 text-xs text-pretty text-ink-3">
							{description}
						</p>
					)}
				</div>
				{actions && <div className="flex shrink-0 gap-2">{actions}</div>}
			</div>
			<div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
		</Card>
	);
}

/** Título de sección numerada para formularios largos (Nueva orden, Nueva cotización). */
export function StepTitle({
	n,
	done = false,
	children,
}: {
	n: number;
	done?: boolean;
	children: ReactNode;
}) {
	return (
		<span className="flex items-center gap-2">
			<span
				className={cn(
					"grid size-5 place-items-center rounded-full font-mono text-[11px] font-semibold",
					done ? "bg-seal text-white" : "bg-secondary text-ink-2",
				)}
			>
				{done ? <Check className="size-3" /> : n}
			</span>
			{children}
		</span>
	);
}
