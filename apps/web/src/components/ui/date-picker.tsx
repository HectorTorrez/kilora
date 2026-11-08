import { cn } from "cn";
import { format, isValid, parse } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

const ISO_DATE = "yyyy-MM-dd";

function parseFormDate(value: string) {
	const date = parse(value, ISO_DATE, new Date());
	return isValid(date) ? date : undefined;
}

type DatePickerProps = Omit<
	ComponentProps<typeof Button>,
	"value" | "onChange" | "type" | "variant"
> & {
	value?: string;
	onChange: (value: string) => void;
	disableFuture?: boolean;
	placeholder?: string;
};

export function DatePicker({
	value = "",
	onChange,
	onBlur,
	disableFuture = false,
	placeholder = "Elegí una fecha",
	className,
	...props
}: DatePickerProps) {
	const [open, setOpen] = useState(false);
	const selected = value ? parseFormDate(value) : undefined;
	const today = new Date();
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					className={cn(
						"h-10 w-full justify-start px-3 text-left font-normal",
						!selected && "text-muted-foreground",
						className,
					)}
					onBlur={onBlur}
					{...props}
				>
					<CalendarIcon />
					{selected
						? format(selected, "d MMM yyyy", { locale: es })
						: placeholder}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="z-[60] w-auto p-0" align="start">
				<Calendar
					mode="single"
					locale={es}
					captionLayout="dropdown"
					defaultMonth={selected ?? today}
					startMonth={new Date(1950, 0)}
					{...(disableFuture
						? {
								endMonth: new Date(today.getFullYear(), today.getMonth()),
								disabled: { after: today },
							}
						: {})}
					selected={selected}
					formatters={{
						formatMonthDropdown: (date) => format(date, "MMM", { locale: es }),
					}}
					onSelect={(date) => {
						onChange(date ? format(date, ISO_DATE) : "");
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
