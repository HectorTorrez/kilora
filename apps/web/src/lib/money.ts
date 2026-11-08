export function toCents(value: string) {
	if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
	const [whole, fraction = ""] = value.split(".");
	return Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
}

export function lineCents(quantity: string, unitPrice: string) {
	const units = toCents(quantity);
	const price = toCents(unitPrice);
	if (units == null || price == null) return 0;
	return Math.round((units * price) / 100);
}

export function formatCents(cents: number) {
	return (cents / 100).toFixed(2);
}
