import { cn } from "cn";
import type { Label as LabelPrimitive } from "radix-ui";
import { Slot } from "radix-ui";
import * as React from "react";
import {
	Controller,
	type ControllerProps,
	type FieldPath,
	type FieldValues,
	FormProvider,
	useFormContext,
	useFormState,
} from "react-hook-form";

import { Label } from "@/components/ui/label";

const Form = FormProvider;

type FormFieldContextValue<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
	name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>(
	{} as FormFieldContextValue,
);

const FormField = <
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
	...props
}: ControllerProps<TFieldValues, TName>) => {
	return (
		<FormFieldContext.Provider value={{ name: props.name }}>
			<Controller {...props} />
		</FormFieldContext.Provider>
	);
};

const useFormField = () => {
	const fieldContext = React.useContext(FormFieldContext);
	const itemContext = React.useContext(FormItemContext);
	const { getFieldState } = useFormContext();
	const formState = useFormState({ name: fieldContext.name });
	const fieldState = getFieldState(fieldContext.name, formState);

	if (!fieldContext) {
		throw new Error("useFormField should be used within <FormField>");
	}

	const { id, required } = itemContext;

	return {
		id,
		name: fieldContext.name,
		formItemId: `${id}-form-item`,
		formDescriptionId: `${id}-form-item-description`,
		formMessageId: `${id}-form-item-message`,
		...fieldState,
		required,
	};
};

type FormItemContextValue = {
	id: string;
	required?: boolean;
};

const FormItemContext = React.createContext<FormItemContextValue>(
	{} as FormItemContextValue,
);

function RequiredMark() {
	return (
		<span aria-hidden="true" className="ml-0.5 text-destructive">
			*
		</span>
	);
}

function FormItem({
	className,
	required,
	...props
}: React.ComponentProps<"div"> & { required?: boolean }) {
	const id = React.useId();

	return (
		<FormItemContext.Provider value={{ id, required }}>
			<div
				data-slot="form-item"
				className={cn("grid min-w-0 gap-2", className)}
				{...props}
			/>
		</FormItemContext.Provider>
	);
}

function FormLabel({
	className,
	children,
	...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
	const { error, formItemId, required } = useFormField();

	return (
		<Label
			data-slot="form-label"
			data-error={!!error}
			className={cn("gap-0 data-[error=true]:text-destructive", className)}
			htmlFor={formItemId}
			{...props}
		>
			{children}
			{required ? <RequiredMark /> : null}
		</Label>
	);
}

function FormControl({ ...props }: React.ComponentProps<typeof Slot.Root>) {
	const { error, formItemId, formDescriptionId, formMessageId, required } =
		useFormField();

	return (
		<Slot.Root
			data-slot="form-control"
			id={formItemId}
			aria-describedby={
				!error
					? `${formDescriptionId}`
					: `${formDescriptionId} ${formMessageId}`
			}
			aria-invalid={!!error}
			{...props}
			{...(required ? { "aria-required": true } : {})}
		/>
	);
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
	const { formDescriptionId } = useFormField();

	return (
		<p
			data-slot="form-description"
			id={formDescriptionId}
			className={cn("text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
	const { error, formMessageId } = useFormField();
	const body = error ? String(error?.message ?? "") : props.children;

	if (!body) {
		return null;
	}

	return (
		<p
			data-slot="form-message"
			id={formMessageId}
			className={cn("text-sm text-destructive", className)}
			{...props}
		>
			{body}
		</p>
	);
}

export {
	useFormField,
	Form,
	FormItem,
	FormLabel,
	FormControl,
	FormDescription,
	FormMessage,
	FormField,
	RequiredMark,
};
