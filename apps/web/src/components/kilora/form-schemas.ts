import { isValidPhoneNumber } from "react-phone-number-input";
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

export const optionalPhone = z
	.string()
	.trim()
	.refine(
		(value) => !value || isValidPhoneNumber(value),
		"Ingresá un teléfono válido para el país elegido",
	);

export const workshopName = requiredText("Ingresá el nombre del taller").max(
	100,
	"Usá como máximo 100 caracteres",
);

export type NitKind = "nit" | "dui";

/** Tipo de documento según la forma del valor (los guiones delatan el formato). */
export function nitKind(value: string): NitKind {
	const dash = value.indexOf("-");
	if (dash !== -1) return dash === 8 ? "dui" : "nit";
	return value.replace(/\D/g, "").length === 9 ? "dui" : "nit";
}

/** "DUI" o "NIT" según lo que se guardó, para mostrarlo con su nombre. */
export function nitLabel(value?: string | null) {
	return value && nitKind(value) === "dui" ? "DUI" : "NIT";
}

/** Guía visual del formato: `_` es un dígito pendiente. */
export const nitMask: Record<NitKind, string> = {
	nit: "____-______-___-_",
	dui: "________-_",
};

/**
 * Da formato a un NIT salvadoreño mientras se escribe: DUI homologado
 * (00000000-0) o NIT de 14 dígitos (0000-000000-000-0). Sin `kind`, lo
 * deduce del largo.
 */
export function formatNit(value: string, kind?: NitKind) {
	const digits = value.replace(/\D/g, "").slice(0, kind === "dui" ? 9 : 14);
	if (kind === "dui" || (!kind && digits.length <= 9))
		return digits.length === 9
			? `${digits.slice(0, 8)}-${digits.slice(8)}`
			: digits;
	return [
		digits.slice(0, 4),
		digits.slice(4, 10),
		digits.slice(10, 13),
		digits.slice(13),
	]
		.filter(Boolean)
		.join("-");
}

export function validDui(digits: string) {
	let sum = 0;
	for (let i = 0; i < 8; i++) sum += Number(digits[i]) * (9 - i);
	return Number(digits[8]) === (10 - (sum % 10)) % 10;
}

// NIT de 14 dígitos o DUI homologado de 9, con o sin guiones.
export const optionalNit = z
	.string()
	.trim()
	.superRefine((value, ctx) => {
		if (!value) return;
		const digits = value.replace(/-/g, "");
		const fail = (message: string) => ctx.addIssue({ code: "custom", message });
		if (!/^\d+$/.test(digits)) return fail("Usá solo números y guiones");
		// Sin guiones y a medias no se sabe el tipo; la descripción del campo
		// ya muestra cuántos dígitos faltan.
		if (!value.includes("-") && ![9, 14].includes(digits.length))
			return fail("Faltan dígitos para completar el documento");
		if (nitKind(value) === "dui") {
			if (digits.length !== 9)
				return fail(`El DUI tiene 9 dígitos (llevás ${digits.length})`);
			if (!validDui(digits))
				return fail("Este DUI no es válido: revisá el último dígito");
			return;
		}
		if (digits.length !== 14)
			fail(`El NIT tiene 14 dígitos (llevás ${digits.length})`);
	});
