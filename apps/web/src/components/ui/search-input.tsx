import { Search } from "lucide-react";
import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SearchInput({
	containerClassName,
	className,
	...props
}: ComponentProps<typeof Input> & { containerClassName?: string }) {
	return (
		<div className={cn("relative", containerClassName)}>
			<Search
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
			/>
			<Input {...props} className={cn("pl-9", className)} />
		</div>
	);
}
