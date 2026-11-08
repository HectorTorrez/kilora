type VehicleStatus = "ok" | "due" | "shop";
const statusCopy: Record<VehicleStatus, string> = {
	ok: "Al día",
	due: "Pendiente",
	shop: "En taller",
};

import { cn } from "@/lib/utils";

const styles: Record<VehicleStatus, string> = {
	ok: "bg-ok-soft text-ok",
	due: "bg-secondary text-ink-2",
	shop: "bg-warn-soft text-warn",
};

const dots: Record<VehicleStatus, string> = {
	ok: "bg-ok",
	due: "bg-ink-3",
	shop: "bg-warn",
};

export function StatusPill({
	status,
	className,
}: {
	status: VehicleStatus;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold whitespace-nowrap",
				styles[status],
				className,
			)}
		>
			<span className={cn("size-1.5 rounded-full", dots[status])} />
			{statusCopy[status]}
		</span>
	);
}
