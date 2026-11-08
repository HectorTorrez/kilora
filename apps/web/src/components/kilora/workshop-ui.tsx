import type { components } from "@kilora/contracts";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

type S = components["schemas"];

export function PageHeader({
	eyebrow,
	title,
	description,
	actions,
	className,
}: {
	eyebrow?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<header
			className={cn(
				"flex flex-wrap items-end justify-between gap-x-6 gap-y-4",
				className,
			)}
		>
			<div className="min-w-0">
				{eyebrow && (
					<p className="font-mono text-[11px] tracking-widest text-ink-3 uppercase">
						{eyebrow}
					</p>
				)}
				<h1 className="mt-1 font-display text-[28px] leading-tight font-bold tracking-[-0.01em] text-balance">
					{title}
				</h1>
				{description && (
					<p className="mt-1.5 max-w-2xl text-sm text-pretty text-ink-3">
						{description}
					</p>
				)}
			</div>
			{actions && <div className="flex flex-wrap gap-2">{actions}</div>}
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
}: {
	label: string;
	value: ReactNode;
	hint?: ReactNode;
	icon: LucideIcon;
	tone?: "default" | "warn" | "ok" | "seal";
}) {
	return (
		<Card className="gap-0 p-4 shadow-none sm:p-5">
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
	title,
	description,
	actions,
	children,
	className,
	bodyClassName,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
	bodyClassName?: string;
}) {
	return (
		<Card className={cn("gap-0 overflow-hidden py-0 shadow-none", className)}>
			<div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
				<div className="min-w-0">
					<h2 className="text-[14px] font-semibold">{title}</h2>
					{description && (
						<p className="mt-0.5 text-xs text-ink-3">{description}</p>
					)}
				</div>
				{actions && <div className="flex gap-2">{actions}</div>}
			</div>
			<div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
		</Card>
	);
}

export const relative = (value: string) => {
	const diff = Date.now() - new Date(value).getTime();
	const minutes = Math.round(diff / 60000);
	const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
	if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
	const hours = Math.round(minutes / 60);
	if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
	const days = Math.round(hours / 24);
	if (Math.abs(days) < 30) return rtf.format(-days, "day");
	const months = Math.round(days / 30);
	if (Math.abs(months) < 12) return rtf.format(-months, "month");
	return rtf.format(-Math.round(months / 12), "year");
};
