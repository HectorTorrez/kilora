import { z } from "zod";
import { todayISO } from "@/lib/format";

export function requiredText(message: string) {
	return z.string().trim().min(1, message);
}

export const optionalText = z.string().trim();

export function yearBounds() {
	return { min: 1950, max: new Date().getFullYear() + 1 };
}

export function optionalYearField() {
	const { min, max } = yearBounds();
	const message = `Ingresá un año entre ${min} y ${max}`;
	return z
		.string()
		.trim()
		.superRefine((value, ctx) => {
			if (!value) return;
			if (!/^\d{4}$/.test(value)) {
				ctx.addIssue({ code: "custom", message });
				return;
			}
			const year = Number(value);
			if (year < min || year > max) ctx.addIssue({ code: "custom", message });
		});
}

export function kmField(required = false) {
	return z
		.string()
		.trim()
		.superRefine((value, ctx) => {
			if (!value) {
				if (required)
					ctx.addIssue({ code: "custom", message: "Ingresá el kilometraje" });
				return;
			}
			if (!/^\d+$/.test(value))
				ctx.addIssue({
					code: "custom",
					message: "Ingresá un número entero igual o mayor a 0",
				});
		});
}

export function moneyField(required = false) {
	return z
		.string()
		.trim()
		.superRefine((value, ctx) => {
			if (!value) {
				if (required)
					ctx.addIssue({ code: "custom", message: "Ingresá un monto" });
				return;
			}
			if (!/^\d+(\.\d{1,2})?$/.test(value))
				ctx.addIssue({ code: "custom", message: "Ingresá un monto válido" });
		});
}

export const emailField = z
	.string()
	.trim()
	.refine(
		(value) => z.email().safeParse(value).success,
		"Ingresá un correo válido",
	);

export function optionalDateField() {
	return z.string().superRefine((value, ctx) => {
		if (!value) return;
		if (value > new Date().toLocaleDateString("en-CA"))
			ctx.addIssue({
				code: "custom",
				message: "La fecha no puede ser futura",
			});
	});
}

export function pastDateField() {
	return z
		.string()
		.min(1, "Ingresá la fecha")
		.refine((value) => value <= todayISO(), "La fecha no puede ser futura");
}

export function maskSvPhone(value: string) {
	let digits = value.replace(/\D/g, "");
	if (digits.startsWith("503") && digits.length > 8) digits = digits.slice(3);
	return digits.slice(0, 8);
}

export const optionalPhone = z
	.string()
	.trim()
	.superRefine((value, ctx) => {
		if (!value) return;
		if (!/^\d{8}$/.test(maskSvPhone(value)))
			ctx.addIssue({
				code: "custom",
				message: "Ingresá un teléfono de 8 dígitos",
			});
	});

export function toSvPhone(value: string) {
	const digits = maskSvPhone(value);
	return digits ? `+503${digits}` : null;
}
