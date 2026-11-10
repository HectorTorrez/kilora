import { ChevronDown, Eye, EyeOff, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useFormContext } from "react-hook-form";
import PhoneInput, {
	type Country,
	getCountryCallingCode,
} from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import es from "react-phone-number-input/locale/es";
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
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

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

function FieldShell({
	label,
	optional,
	required,
	className,
	description,
	children,
}: Pick<
	SharedField,
	"label" | "optional" | "required" | "className" | "description"
> & { children: ReactNode }) {
	return (
		<FormItem className={className} required={required}>
			<FormLabel>
				{label}
				{optional && !required ? (
					<span className="ml-1 font-normal text-muted-foreground">
						(opcional)
					</span>
				) : null}
			</FormLabel>
			{children}
			{description ? <FormDescription>{description}</FormDescription> : null}
			<FormMessage />
		</FormItem>
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
	label: ReactNode;
	description?: ReactNode;
	optional?: boolean;
	required?: boolean;
	className?: string;
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
	maxLength?: number;
	inputPattern?: RegExp;
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
	maxLength = 2000,
	inputPattern,
	normalize,
	onValueChange,
}: TextFieldProps) {
	const form = useFormContext();
	const grouped = prefix != null || suffix != null;
	return (
		<FormField
			control={form.control}
			name={name}
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
						maxLength={maxLength}
						name={field.name}
						ref={field.ref}
						onBlur={field.onBlur}
						value={field.value ?? ""}
						className={grouped ? groupedInputClass : undefined}
						onChange={(event) => {
							let next = event.target.value;
							if (uppercase) next = next.toUpperCase();
							if (normalize) next = normalize(next);
							if (inputPattern && !inputPattern.test(next)) return;
							field.onChange(next);
							onValueChange?.(next);
						}}
					/>
				);
				return (
					<FieldShell
						{...{ className, required, label, optional, description }}
					>
						{grouped ? (
							<InputGroup prefix={prefix} suffix={suffix}>
								<FormControl>{input}</FormControl>
							</InputGroup>
						) : (
							<FormControl>{input}</FormControl>
						)}
					</FieldShell>
				);
			}}
		/>
	);
}

export function NumberField(props: Omit<TextFieldProps, "type" | "uppercase">) {
	const decimal = props.step !== undefined && Number(props.step) < 1;
	return (
		<TextField
			{...props}
			type="text"
			inputMode={decimal ? "decimal" : "numeric"}
			inputPattern={decimal ? /^\d*(?:[.,]\d{0,2})?$/ : /^\d*$/}
			normalize={(value) => value.replace(",", ".")}
		/>
	);
}

const phoneCountryOrder: ("|" | "..." | Country)[] = [
	"SV",
	"GT",
	"HN",
	"NI",
	"CR",
	"PA",
	"MX",
	"US",
	"|",
	"...",
];

function PhoneCountrySelect({
	value,
	onChange,
	options,
	disabled,
	readOnly,
	...props
}: {
	value?: Country;
	onChange: (country?: Country) => void;
	options: { value?: Country; label: string; divider?: boolean }[];
	disabled?: boolean;
	readOnly?: boolean;
} & Omit<React.ComponentProps<"select">, "value" | "onChange">) {
	const Flag = value ? flags[value] : undefined;
	return (
		<div className="relative flex shrink-0 items-center gap-1.5 border-r border-input bg-muted px-3 text-sm text-ink-3 focus-within:text-foreground">
			{Flag ? (
				<span className="flex h-3.5 w-5 overflow-hidden rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.1)] [&_svg]:size-full">
					<Flag title={value ? (es[value] ?? value) : ""} />
				</span>
			) : null}
			<span className="font-mono">
				{value ? `+${getCountryCallingCode(value)}` : "+"}
			</span>
			<ChevronDown aria-hidden className="size-3.5" />
			<select
				{...props}
				className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
				value={value ?? ""}
				disabled={disabled || readOnly}
				onChange={(event) =>
					onChange((event.target.value || undefined) as Country | undefined)
				}
			>
				{options.map((option) =>
					option.divider ? (
						<option key="divider" disabled>
							──────────
						</option>
					) : (
						<option key={option.value ?? "ZZ"} value={option.value ?? ""}>
							{option.label}
							{option.value ? ` (+${getCountryCallingCode(option.value)})` : ""}
						</option>
					),
				)}
			</select>
		</div>
	);
}

export function PhoneField({
	name,
	label,
	description,
	optional,
	required,
	className,
	autoFocus,
	placeholder,
}: SharedField) {
	const form = useFormContext();
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FieldShell {...{ className, required, label, optional, description }}>
					<FormControl>
						<PhoneInput
							defaultCountry="SV"
							labels={es}
							addInternationalOption={false}
							countryOptionsOrder={phoneCountryOrder}
							countrySelectComponent={PhoneCountrySelect}
							inputComponent={Input}
							className={cn(
								"flex h-10 w-full items-stretch overflow-hidden rounded-md border border-input bg-transparent shadow-xs",
								"focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
								"has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-[3px] has-[[aria-invalid=true]]:ring-destructive/20",
								"dark:bg-input/30 dark:has-[[aria-invalid=true]]:ring-destructive/40",
								"[&_input]:h-full [&_input]:flex-1 [&_input]:rounded-none [&_input]:border-0 [&_input]:bg-transparent [&_input]:font-mono [&_input]:shadow-none [&_input]:focus-visible:ring-0 dark:[&_input]:bg-transparent",
							)}
							autoComplete="tel"
							autoFocus={autoFocus}
							placeholder={placeholder}
							name={field.name}
							ref={field.ref}
							onBlur={field.onBlur}
							value={field.value || undefined}
							onChange={(value) => field.onChange(value ?? "")}
						/>
					</FormControl>
				</FieldShell>
			)}
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
	autoFocus,
	placeholder = "Elegí una fecha",
	disableFuture = true,
}: SharedField & { disableFuture?: boolean }) {
	const form = useFormContext();
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FieldShell {...{ className, required, label, optional, description }}>
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
				</FieldShell>
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
	autoFocus,
	placeholder,
	rows = 3,
}: SharedField & { rows?: number }) {
	const form = useFormContext();
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FieldShell {...{ className, required, label, optional, description }}>
					<FormControl>
						<Textarea
							rows={rows}
							maxLength={2000}
							autoFocus={autoFocus}
							placeholder={placeholder}
							name={field.name}
							ref={field.ref}
							onBlur={field.onBlur}
							value={field.value ?? ""}
							onChange={field.onChange}
						/>
					</FormControl>
				</FieldShell>
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
			name={name}
			render={({ field }) => (
				<FieldShell {...{ className, required, label, optional, description }}>
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
				</FieldShell>
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
}: SharedField & {
	options: { value: string; label: string }[];
	placeholder?: string;
}) {
	const form = useFormContext();
	return (
		<FormField
			control={form.control}
			name={name}
			render={({ field }) => (
				<FieldShell {...{ className, required, label, optional, description }}>
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
				</FieldShell>
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
