import { z } from "zod";
import { todayISO } from "@/lib/format";

export function requiredText(message: string) {
	return optionalText.min(1, message);
}

export const optionalText = z
	.string()
	.trim()
	.max(2000, "Usá como máximo 2000 caracteres");

export const personName = z
	.string()
	.trim()
	.min(2, "Ingresá al menos 2 caracteres")
	.max(100, "Usá como máximo 100 caracteres")
	.regex(
		/^[\p{L}\p{M}]+\.?(?:[ ’'-][\p{L}\p{M}]+\.?)*$/u,
		"Usá letras, espacios, apóstrofos o guiones",
	);
export const optionalPersonName = z
	.string()
	.trim()
	.pipe(z.union([z.literal(""), personName]));

export const vehicleText = z
	.string()
	.trim()
	.min(1, "Ingresá la marca o el modelo")
	.max(100, "Usá como máximo 100 caracteres")
	.regex(
		/^[\p{L}\p{M}\d .’'&()+/-]+$/u,
		"Usá letras, números o signos propios de la marca o modelo",
	)
	.regex(/[\p{L}\d]/u, "Ingresá una marca o modelo válido");
export const optionalVehicleText = z
	.string()
	.trim()
	.pipe(z.union([z.literal(""), vehicleText]));

export const plateField = z
	.string()
	.trim()
	.toUpperCase()
	.transform((value) => value.replace(/[\s-]/g, ""))
	.refine(
		(value) => !value || /^[A-Z0-9]{3,12}$/.test(value),
		"Usá entre 3 y 12 letras o números para la placa",
	);

export const quantityField = z
	.string()
	.trim()
	.refine(
		(value) =>
			/^\d+(\.\d{1,2})?$/.test(value) &&
			Number(value) > 0 &&
			Number(value) < 100_000_000,
		"Ingresá una cantidad mayor a 0 y menor a 100,000,000, con hasta 2 decimales",
	);

export function yearBounds() {
	return { min: 1886, max: new Date().getFullYear() + 1 };
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
			if (!/^\d+$/.test(value) || Number(value) > 2_147_483_647)
				ctx.addIssue({
					code: "custom",
					message: "Ingresá un entero entre 0 y 2,147,483,647",
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
			if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) >= 10_000_000_000)
				ctx.addIssue({
					code: "custom",
					message:
						"Ingresá un monto entre 0 y 9,999,999,999.99, con hasta 2 decimales",
				});
		});
}

export const emailField = z
	.string()
	.trim()
	.max(254, "El correo es demasiado largo")
	.refine(
		(value) => z.email().safeParse(value).success,
		"Ingresá un correo válido",
	);

function isPastDate(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return (
		Number.isFinite(date.getTime()) &&
		date.toISOString().slice(0, 10) === value &&
		value <= todayISO()
	);
}

export function optionalDateField() {
	return z
		.string()
		.refine(
			(value) => !value || isPastDate(value),
			"Ingresá una fecha válida que no sea futura",
		);
}

export function pastDateField() {
	return z
		.string()
		.min(1, "Ingresá la fecha")
		.refine(isPastDate, "Ingresá una fecha válida que no sea futura");
}

export function maskSvPhone(value: string) {
	let digits = value.replace(/[\s-]/g, "");
	if (digits.startsWith("+503")) digits = digits.slice(4);
	else if (digits.startsWith("503") && digits.length === 11)
		digits = digits.slice(3);
	return digits;
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
