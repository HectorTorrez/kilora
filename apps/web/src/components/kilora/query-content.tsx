import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export function QueryContent({
	pending,
	error,
	empty,
	emptyState,
	loading,
	errorClassName,
	children,
}: {
	pending: boolean;
	error?: Error | null;
	empty: boolean;
	emptyState: ReactNode;
	loading?: ReactNode;
	errorClassName?: string;
	children: ReactNode;
}) {
	if (pending)
		return (
			loading ?? (
				<div className="space-y-2 p-4">
					<Skeleton className="h-10" />
					<Skeleton className="h-10" />
					<Skeleton className="h-10" />
				</div>
			)
		);
	if (error)
		return (
			<Alert variant="destructive" className={errorClassName}>
				<AlertDescription>{error.message}</AlertDescription>
			</Alert>
		);
	return empty ? emptyState : children;
}
