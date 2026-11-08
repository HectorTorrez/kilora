export function toCents(value: string) {
	if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
	const [whole, fraction = ""] = value.split(".");
	return Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
}

type Amount = string | number | null | undefined;

export function amountCents(value: Amount) {
	return toCents(String(value ?? 0)) ?? 0;
}

export function lineCents(quantity: Amount, unitPrice: Amount) {
	return Math.round((amountCents(quantity) * amountCents(unitPrice)) / 100);
}

export function formatCents(cents: number) {
	return (cents / 100).toFixed(2);
}
