import { cn } from "cn";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	type FieldPath,
	type FieldValues,
	useFormContext,
} from "react-hook-form";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "./form-schemas";

const groupedInputClass =
	"h-full rounded-none border-0 bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent";

export function InputGroup({
	prefix,
	suffix,
	children,
	className,
}: {
	prefix?: ReactNode;
	suffix?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			data-slot="input-group"
			className={cn(
				"flex h-10 w-full items-stretch overflow-hidden rounded-md border border-input bg-transparent shadow-xs",
				"focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
				"has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-[3px] has-[[aria-invalid=true]]:ring-destructive/20",
				"dark:bg-input/30 dark:has-[[aria-invalid=true]]:ring-destructive/40",
				className,
			)}
		>
			{prefix != null && (
				<span
					aria-hidden
					className="flex items-center border-r border-input bg-muted px-3 font-mono text-sm text-ink-3 select-none"
				>
					{prefix}
				</span>
			)}
			<div className="min-w-0 flex-1">{children}</div>
			{suffix != null && (
				<span
					aria-hidden
					className="flex items-center border-l border-input bg-muted px-3 text-sm text-ink-3 select-none"
				>
					{suffix}
				</span>
			)}
		</div>
	);
}

function FieldLabel({
	label,
	optional,
	required,
	className,
}: {
	label: string;
	optional?: boolean;
	required?: boolean;
	className?: string;
}) {
	return (
		<FormLabel className={className}>
			{label}
			{optional && !required ? (
				<span className="ml-1 font-normal text-muted-foreground">
					(opcional)
				</span>
			) : null}
		</FormLabel>
	);
}

export function RequiredLegend({ className }: { className?: string }) {
	return (
		<p className={cn("text-xs text-muted-foreground", className)}>
			<span className="text-destructive">*</span> Campo obligatorio
		</p>
	);
}

type SharedField = {
	name: string;
	label: string;
	description?: string;
	optional?: boolean;
	required?: boolean;
	className?: string;
	labelClassName?: string;
	autoFocus?: boolean;
	placeholder?: string;
};

type TextFieldProps = SharedField & {
	type?: string;
	autoComplete?: string;
	uppercase?: boolean;
	prefix?: ReactNode;
	suffix?: ReactNode;
	inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
	min?: string | number;
	max?: string | number;
	step?: string | number;
	normalize?: (value: string) => string;
	onValueChange?: (value: string) => void;
};

export function TextField({
	name,
	label,
	description,
	optional,
	required,
	className,
	labelClassName,
	autoFocus,
	placeholder,
	type = "text",
	autoComplete,
	uppercase,
	prefix,
	suffix,
	inputMode,
	min,
	max,
	step,
	normalize,
	onValueChange,
}: TextFieldProps) {
	const form = useFormContext();
	const grouped = prefix != null || suffix != null;
	return (
		<FormField
			control={form.control}
			name={name as FieldPath<FieldValues>}
			render={({ field }) => {
				const input = (
					<Input
						type={type}
						autoComplete={autoComplete}
						autoFocus={autoFocus}
						placeholder={placeholder}
						inputMode={inputMode}
						min={min}
						max={max}
						step={step}
						name={field.name}
						ref={field.ref}
						onBlur={field.onBlur}
						value={field.value ?? ""}
						className={grouped ? groupedInputClass : undefined}
						onChange={(event) => {
							let next = event.target.value;
							if (uppercase) next = next.toUpperCase();
							if (normalize) next = normalize(next);
							field.onChange(next);
							onValueChange?.(next);
						}}
					/>
				);
				return (
					<FormItem className={className} required={required}>
						<FieldLabel
							label={label}
							optional={optional}
							required={required}
							className={labelClassName}
						/>
						{grouped ? (
							<InputGroup prefix={prefix} suffix={suffix}>
								<FormControl>{input}</FormControl>
							</InputGroup>
						) : (
							<FormControl>{input}</FormControl>
						)}
						{description ? (
							<FormDescription>{description}</FormDescription>
						) : null}
						<FormMessage />
					</FormItem>
				);
			}}
		/>
	);
}

export function NumberField(props: Omit<TextFieldProps, "type" | "uppercase">) {
	const step = props.step === undefined ? undefined : Number(props.step);
	return (
		<TextField
			{...props}
			type="number"
			inputMode={step !== undefined && step < 1 ? "decimal" : "numeric"}
		/>
	);
}

export function DateField({
	name,
	label,
	description,
	optional,
	required,
	className,
	labelClassName,
	autoFocus,
	placeholder = "Elegí una fecha",
	disableFuture = true,
}: SharedField & { disableFuture?: boolean }) {
	const form = useFormContext();
	return (
		<FormField
			control={form.control}
			name={name as FieldPath<FieldValues>}
			render={({ field }) => (
				<FormItem className={className} required={required}>
					<FieldLabel
						label={label}
						optional={optional}
						required={required}
						className={labelClassName}
					/>
					<FormControl>
						<DatePicker
							name={field.name}
							ref={field.ref}
							autoFocus={autoFocus}
							placeholder={placeholder}
							disableFuture={disableFuture}
							value={field.value ?? ""}
							onBlur={field.onBlur}
							onChange={field.onChange}
						/>
					</FormControl>
					{description ? (
						<FormDescription>{description}</FormDescription>
					) : null}
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}

export function TextareaField({
	name,
	label,
	description,
	optional,
	required,
	className,
	labelClassName,
	autoFocus,
	placeholder,
	rows = 3,
}: SharedField & { rows?: number }) {
	const form = useFormContext();
	return (
		<FormField
			control={form.control}
			name={name as FieldPath<FieldValues>}
			render={({ field }) => (
				<FormItem className={className} required={required}>
					<FieldLabel
						label={label}
						optional={optional}
						required={required}
						className={labelClassName}
					/>
					<FormControl>
						<Textarea
							rows={rows}
							autoFocus={autoFocus}
							placeholder={placeholder}
							name={field.name}
							ref={field.ref}
							onBlur={field.onBlur}
							value={field.value ?? ""}
							onChange={field.onChange}
						/>
					</FormControl>
					{description ? (
						<FormDescription>{description}</FormDescription>
					) : null}
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}

export function PasswordField({
	name,
	label,
	description,
	optional,
	required,
	className,
	autoFocus,
	autoComplete,
	placeholder,
	onValueChange,
}: SharedField & {
	autoComplete?: string;
	onValueChange?: (value: string) => void;
}) {
	const form = useFormContext();
	const [visible, setVisible] = useState(false);
	return (
		<FormField
			control={form.control}
			name={name as FieldPath<FieldValues>}
			render={({ field }) => (
				<FormItem className={className} required={required}>
					<FieldLabel label={label} optional={optional} required={required} />
					<div className="relative">
						<FormControl>
							<Input
								type={visible ? "text" : "password"}
								autoComplete={autoComplete}
								autoFocus={autoFocus}
								placeholder={placeholder}
								className="pr-11"
								name={field.name}
								ref={field.ref}
								onBlur={field.onBlur}
								value={field.value ?? ""}
								onChange={(event) => {
									field.onChange(event.target.value);
									onValueChange?.(event.target.value);
								}}
							/>
						</FormControl>
						<button
							type="button"
							className="absolute top-0 right-0 flex h-10 w-10 items-center justify-center rounded-r-md text-ink-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
							onClick={() => setVisible((current) => !current)}
							aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
							aria-pressed={visible}
						>
							{visible ? (
								<EyeOff className="size-4" />
							) : (
								<Eye className="size-4" />
							)}
						</button>
					</div>
					{description ? (
						<FormDescription>{description}</FormDescription>
					) : null}
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}

export function SelectField({
	name,
	label,
	options,
	placeholder = "Elegí una opción",
	description,
	optional,
	required,
	className,
	labelClassName,
}: SharedField & {
	options: { value: string; label: string }[];
	placeholder?: string;
}) {
	const form = useFormContext();
	return (
		<FormField
			control={form.control}
			name={name as FieldPath<FieldValues>}
			render={({ field }) => (
				<FormItem className={className} required={required}>
					<FieldLabel
						label={label}
						optional={optional}
						required={required}
						className={labelClassName}
					/>
					<Select
						value={field.value ? String(field.value) : undefined}
						onValueChange={field.onChange}
					>
						<FormControl>
							<SelectTrigger
								className="w-full"
								onBlur={field.onBlur}
								ref={field.ref}
							>
								<SelectValue placeholder={placeholder} />
							</SelectTrigger>
						</FormControl>
						<SelectContent position="popper">
							{options.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{description ? (
						<FormDescription>{description}</FormDescription>
					) : null}
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}

export function SubmitButton({
	pending = false,
	pendingLabel = "Guardando…",
	children,
	className,
	disabled,
	...props
}: React.ComponentProps<typeof Button> & {
	pending?: boolean;
	pendingLabel?: string;
}) {
	return (
		<Button
			{...props}
			type="submit"
			className={cn("w-full sm:w-auto", className)}
			disabled={disabled || pending}
		>
			{pending ? (
				<>
					<Loader2 className="animate-spin" />
					{pendingLabel}
				</>
			) : (
				children
			)}
		</Button>
	);
}

export function FormActions({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"col-span-full flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function FormError({
	error,
	className,
}: {
	error?: unknown;
	className?: string;
}) {
	const message =
		typeof error === "string" ? error : error ? errorMessage(error) : "";
	if (!message) return null;
	return (
		<Alert
			variant="destructive"
			className={cn("col-span-full text-sm text-destructive", className)}
		>
			<AlertDescription>{message}</AlertDescription>
		</Alert>
	);
}

export function RootError({ className }: { className?: string }) {
	const { formState } = useFormContext();
	return (
		<FormError error={formState.errors.root?.message} className={className} />
	);
}

export function applyFormError(
	form: { setError: (name: "root", error: { message: string }) => void },
	error: unknown,
	options?: { toast?: boolean },
) {
	const message = errorMessage(error);
	form.setError("root", { message });
	if (options?.toast) toast.error(message);
}
