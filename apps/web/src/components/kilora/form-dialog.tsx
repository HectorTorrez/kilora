import type { ReactNode } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Modal para formularios cortos. El contenido se monta solo mientras está
 * abierto, así cada apertura arranca con el formulario limpio.
 */
export function FormDialog({
	open,
	onOpenChange,
	title,
	description,
	children,
	className,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	description?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className={cn(
					"max-h-[90dvh] overflow-y-auto overscroll-contain",
					className,
				)}
				onInteractOutside={(event) => {
					// Permite usar popovers (calendario, selects) dentro del modal.
					const target = event.target;
					if (
						target instanceof Element &&
						target.closest("[data-slot=popover-content]")
					)
						event.preventDefault();
				}}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description ? (
						<DialogDescription>{description}</DialogDescription>
					) : null}
				</DialogHeader>
				{open ? children : null}
			</DialogContent>
		</Dialog>
	);
}
