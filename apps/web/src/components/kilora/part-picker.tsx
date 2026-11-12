import { CheckIcon, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { FormControl, FormField } from "@/components/ui/form";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	isPartKey,
	type PartKey,
	partCatalog,
	partGroups,
} from "@/lib/part-catalog";
import { cn } from "@/lib/utils";
import { PartThumb } from "./car-anatomy";
import { FieldShell, type SharedField } from "./form-fields";

/**
 * Selector de pieza con búsqueda. El valor es la clave del catálogo o "" si
 * no aplica; con la pieza, el propietario ve dónde está en su vehículo.
 */
export function PartField({
	name,
	label = "Pieza",
	description,
	optional = true,
	className,
	onPick,
}: Partial<
	Pick<SharedField, "label" | "description" | "optional" | "className">
> & {
	name: string;
	/** Se llama al elegir una pieza (p. ej. para completar la descripción). */
	onPick?: (part: PartKey) => void;
}) {
	const form = useFormContext();
	const [open, setOpen] = useState(false);
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => {
				const value = isPartKey(field.value) ? field.value : null;
				const pick = (next: PartKey | null) => {
					field.onChange(next ?? "");
					if (next) onPick?.(next);
					setOpen(false);
				};
				return (
					<FieldShell {...{ className, label, optional, description }}>
						<Popover open={open} onOpenChange={setOpen}>
							<PopoverTrigger asChild>
								<FormControl>
									<Button
										type="button"
										variant="outline"
										role="combobox"
										aria-expanded={open}
										ref={field.ref}
										onBlur={field.onBlur}
										className={cn(
											"h-10 w-full justify-between px-3 font-normal",
											!value && "text-muted-foreground",
										)}
									>
										<span className="truncate">
											{value ? partCatalog[value].label : "Elegí la pieza"}
										</span>
										<ChevronsUpDown className="size-4 opacity-50" />
									</Button>
								</FormControl>
							</PopoverTrigger>
							<PopoverContent
								className="w-(--radix-popover-trigger-width) min-w-64 p-0"
								align="start"
							>
								<Command>
									<CommandInput placeholder="Buscar pieza…" />
									<CommandList className="max-h-72">
										<CommandEmpty>No hay piezas con ese nombre.</CommandEmpty>
										<CommandGroup>
											<CommandItem
												value="ninguna otra"
												onSelect={() => pick(null)}
											>
												<span className="text-muted-foreground">
													Ninguna / otra pieza
												</span>
												{!value && <CheckIcon className="ml-auto size-4" />}
											</CommandItem>
										</CommandGroup>
										{partGroups.map((group) => (
											<CommandGroup key={group.category} heading={group.label}>
												{group.parts.map((key) => (
													<CommandItem
														key={key}
														value={`${partCatalog[key].label} ${group.label}`}
														onSelect={() => pick(key)}
													>
														{partCatalog[key].label}
														{value === key && (
															<CheckIcon className="ml-auto size-4" />
														)}
													</CommandItem>
												))}
											</CommandGroup>
										))}
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>
					</FieldShell>
				);
			}}
		/>
	);
}

/** Muestra cómo verá el cliente la pieza elegida en su vehículo. */
export function PartPreview({
	name,
	className,
}: {
	name: string;
	className?: string;
}) {
	const value = useWatch({ name });
	if (!isPartKey(value)) return null;
	return (
		<div
			className={cn(
				"flex items-center gap-3 rounded-lg border border-dashed p-2",
				className,
			)}
		>
			<PartThumb part={value} className="w-24 shrink-0" />
			<p className="text-xs leading-snug text-ink-3">
				<b className="text-foreground">{partCatalog[value].label}</b>: el
				cliente verá esta pieza resaltada en el dibujo de su vehículo, con una
				explicación de dónde está y para qué sirve.
			</p>
		</div>
	);
}
