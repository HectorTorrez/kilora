export type VehicleStatus = "ok" | "due" | "shop";

export type Vehicle = {
	plate: string;
	model: string;
	year: number;
	owner: string;
	phone: string;
	lastService: string;
	lastDate: string;
	km: number;
	status: VehicleStatus;
};

export type HistoryEntry = {
	date: string;
	work: string;
	shop: string;
	km: number;
	price: number;
};

export type Order = {
	number: string;
	plate: string;
	owner: string;
	service: string;
	date: string;
	total: number;
	status: "registrada" | "borrador" | "cotizacion";
};

export const shop = {
	name: "Taller Rivas",
	branch: "Sucursal Centro · San Salvador",
};

export const currentUser = {
	name: "Marta Rivas",
	role: "Recepción",
	initials: "MR",
};

export const vehicles: Vehicle[] = [
	{
		plate: "P 482 913",
		model: "Toyota Corolla",
		year: 2019,
		owner: "Carlos Menjívar",
		phone: "+503 7712 4408",
		lastService: "Cambio de aceite",
		lastDate: "12 mar 2026",
		km: 142830,
		status: "ok",
	},
	{
		plate: "P 771 KBC",
		model: "Honda CR-V",
		year: 2021,
		owner: "Ana Sofía Rivera",
		phone: "+503 7845 1120",
		lastService: "Frenos delanteros",
		lastDate: "04 mar 2026",
		km: 68210,
		status: "due",
	},
	{
		plate: "P 219 LMD",
		model: "Nissan Frontier",
		year: 2018,
		owner: "José Antonio Peña",
		phone: "+503 7012 8890",
		lastService: "Alineación y balanceo",
		lastDate: "28 feb 2026",
		km: 203410,
		status: "ok",
	},
	{
		plate: "P 884 TRX",
		model: "Hyundai Tucson",
		year: 2022,
		owner: "Gabriela Santos",
		phone: "+503 7550 3311",
		lastService: "Servicio de 30,000 km",
		lastDate: "21 feb 2026",
		km: 31940,
		status: "shop",
	},
	{
		plate: "P 103 QWE",
		model: "Mazda 3",
		year: 2020,
		owner: "Luis Ernesto Cruz",
		phone: "+503 7123 0094",
		lastService: "Batería",
		lastDate: "14 feb 2026",
		km: 88120,
		status: "ok",
	},
	{
		plate: "P 655 MNO",
		model: "Kia Sportage",
		year: 2017,
		owner: "Rosa Elena Vásquez",
		phone: "+503 7688 4471",
		lastService: "Cambio de aceite",
		lastDate: "02 feb 2026",
		km: 176500,
		status: "due",
	},
	{
		plate: "P 340 JKL",
		model: "Mitsubishi L200",
		year: 2019,
		owner: "Óscar Armando Díaz",
		phone: "+503 7290 1137",
		lastService: "Suspensión trasera",
		lastDate: "27 ene 2026",
		km: 121760,
		status: "ok",
	},
	{
		plate: "P 927 HGD",
		model: "Ford Ranger",
		year: 2020,
		owner: "Daniel Alejandro Molina",
		phone: "+503 7745 6620",
		lastService: "Cambio de aceite",
		lastDate: "19 ene 2026",
		km: 97340,
		status: "ok",
	},
];

export const statusCopy: Record<VehicleStatus, string> = {
	ok: "Al día",
	due: "Recordatorio",
	shop: "En taller",
};

const vehicleHistory: Record<string, HistoryEntry[]> = {
	"P 482 913": [
		{
			date: "12 mar 2026",
			work: "Cambio de aceite 10W-30",
			shop: "Taller Rivas",
			km: 142830,
			price: 57,
		},
		{
			date: "04 ene 2026",
			work: "Revisión general de 140,000 km",
			shop: "Taller Rivas",
			km: 138120,
			price: 0,
		},
		{
			date: "08 sep 2025",
			work: "Frenos delanteros y discos",
			shop: "Taller Rivas",
			km: 121300,
			price: 180,
		},
		{
			date: "21 may 2025",
			work: "Alineación y balanceo",
			shop: "Auto Servicio Escalón",
			km: 114800,
			price: 95,
		},
	],
};

export function getHistory(vehicle: Vehicle): HistoryEntry[] {
	const stored = vehicleHistory[vehicle.plate];
	if (stored) return stored;

	return [
		{
			date: vehicle.lastDate,
			work: vehicle.lastService,
			shop: shop.name,
			km: vehicle.km,
			price: 0,
		},
		{
			date: "18 nov 2025",
			work: "Revisión de frenos",
			shop: shop.name,
			km: vehicle.km - 6400,
			price: 45,
		},
		{
			date: "02 jul 2025",
			work: "Cambio de aceite",
			shop: "Auto Servicio Escalón",
			km: vehicle.km - 12100,
			price: 52,
		},
	];
}

export const orders: Order[] = [
	{
		number: "ORD-1042",
		plate: "P 482 913",
		owner: "Carlos Menjívar",
		service: "Cambio de aceite",
		date: "12 mar 2026",
		total: 57,
		status: "registrada",
	},
	{
		number: "ORD-1041",
		plate: "P 884 TRX",
		owner: "Gabriela Santos",
		service: "Servicio de 30,000 km",
		date: "11 mar 2026",
		total: 95,
		status: "cotizacion",
	},
	{
		number: "ORD-1040",
		plate: "P 771 KBC",
		owner: "Ana Sofía Rivera",
		service: "Frenos delanteros",
		date: "04 mar 2026",
		total: 180,
		status: "registrada",
	},
	{
		number: "ORD-1039",
		plate: "P 219 LMD",
		owner: "José Antonio Peña",
		service: "Alineación y balanceo",
		date: "28 feb 2026",
		total: 35,
		status: "registrada",
	},
	{
		number: "ORD-1038",
		plate: "P 103 QWE",
		owner: "Luis Ernesto Cruz",
		service: "Batería",
		date: "14 feb 2026",
		total: 120,
		status: "registrada",
	},
	{
		number: "ORD-1037",
		plate: "P 655 MNO",
		owner: "Rosa Elena Vásquez",
		service: "Cambio de aceite",
		date: "02 feb 2026",
		total: 57,
		status: "borrador",
	},
];

export const serviceTemplates = [
	{
		label: "Cambio de aceite",
		item: "Cambio de aceite 5W-30 sintético",
		price: 45,
	},
	{ label: "Frenos", item: "Frenos delanteros", price: 120 },
	{ label: "Alineación", item: "Alineación y balanceo", price: 35 },
	{ label: "Servicio 30k", item: "Servicio de 30,000 km", price: 95 },
];

export const money = new Intl.NumberFormat("es-SV", {
	style: "currency",
	currency: "USD",
});

export const number = new Intl.NumberFormat("en-US");

export function km(value: number) {
	return number.format(value);
}

export function plateSlug(plate: string) {
	return plate.replace(/\s+/g, "-");
}

export function plateFromSlug(slug: string) {
	return decodeURIComponent(slug).replace(/-/g, " ").toUpperCase();
}
