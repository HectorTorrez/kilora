export const SITE_URL = (
	import.meta.env.VITE_SITE_URL || "https://kilora.dev"
).replace(/\/$/, "");

export const SITE_NAME = "Kilora";

export const OG_IMAGE = `${SITE_URL}/og.png`;

export type Faq = { q: string; a: string };

// Las preguntas visibles y sus datos estructurados comparten la misma fuente.
export const OWNER_FAQS: Faq[] = [
	{
		q: "¿Para qué me sirve Kilora?",
		a: "Kilora reúne qué le hicieron a tu carro, cuándo y cuánto pagaste. Podés guardar servicios de cualquier taller, tomar una foto o subir una imagen o PDF del comprobante y conservarlo junto al servicio, aunque tu taller no use Kilora.",
	},
	{
		q: "¿Mi taller necesita usar Kilora?",
		a: "No. Podés crear tu cuenta, registrar tu carro y agregar servicios de cualquier taller. No necesitás una invitación. Si tu taller también usa Kilora, puede invitarte para conectar los servicios que registró.",
	},
	{
		q: "¿Qué pasa con mi historial si cambio de taller?",
		a: "Lo conservás en tu cuenta y podés seguir agregando servicios, aunque el nuevo taller no use Kilora. Si lo usa, puede invitarte para conectar sus registros a tu cuenta.",
	},
	{
		q: "¿Puedo agregar servicios de antes de usar Kilora?",
		a: "Sí. Podés anotarlos vos, tomar una foto o subir un comprobante JPG, PNG, WebP o PDF de hasta 4 MB. Revisá los datos antes de guardar. El archivo queda adjunto al servicio y solo vos podés descargarlo.",
	},
	{
		q: "¿Necesito instalar una app?",
		a: "No. Kilora se abre desde el navegador de tu teléfono o computadora. Creá tu cuenta y registrá tu carro para empezar. También podés aceptar una invitación si tu taller ya registró servicios en Kilora.",
	},
	{
		q: "¿Qué puede ver otro taller sobre mi carro?",
		a: "Un taller vinculado a tu carro puede consultar los trabajos, las piezas, las fechas y el kilometraje. No ve lo que pagaste, las marcas de los repuestos, las fotos, las notas ni qué otro taller hizo el servicio. Los costos internos y las notas privadas quedan solo en el taller que realizó el trabajo.",
	},
	{
		q: "¿Qué pasa si hay un error en un servicio registrado?",
		a: "Podés corregir los servicios que agregaste vos. Si lo registró el taller, pedile que lo corrija. Las correcciones quedan fechadas y el registro original se conserva para saber qué cambió.",
	},

	{
		q: "¿Puedo compartir el historial al vender mi carro?",
		a: "Sí. Desde tu vehículo, creá un Reporte para venta y compartí el enlace con el comprador. Puede ver los servicios, los talleres y el kilometraje durante 30 días, sin ver montos ni notas. También podés imprimirlo o guardarlo como PDF. Si creás otro enlace, el anterior deja de funcionar.",
	},

	{
		q: "¿Está pensado para El Salvador?",
		a: "Sí. Kilora está pensado para talleres independientes y propietarios de vehículos en El Salvador, con precios en dólares y todo en español.",
	},
];

export const WORKSHOP_FAQS: Faq[] = [
	{
		q: "¿Qué es Kilora para talleres?",
		a: "Es un software web para talleres automotrices independientes en El Salvador. Permite organizar clientes, vehículos, órdenes de trabajo y cotizaciones por sucursal, y compartir el historial de los servicios terminados con sus propietarios.",
	},
	{
		q: "¿Puedo trabajar antes de que mi cliente cree su cuenta?",
		a: "Sí. Registrá al cliente y su vehículo, prepará la cotización y abrí la orden. Después podés invitar al propietario por un enlace compartible por correo o WhatsApp para que consulte su historial.",
	},
	{
		q: "¿Cómo comparto una cotización con mi cliente?",
		a: "Prepará la cotización con trabajos, repuestos y precios, y compartí su enlace por WhatsApp. El cliente puede verla sin crear una cuenta. Tu equipo registra el resultado del presupuesto en Kilora.",
	},
	{
		q: "¿Otro taller puede ver mis precios o notas privadas?",
		a: "No. Otro taller vinculado al vehículo solo ve el contexto de mantenimiento: trabajos, piezas, fechas y kilometraje. No ve tus precios, costos, notas, marcas de repuestos ni el nombre de tu taller. Los costos internos y las notas del mecánico tampoco se comparten con el propietario.",
	},
	{
		q: "¿Puedo organizar varias sucursales y miembros del equipo?",
		a: "Sí. Kilora permite gestionar sucursales y asignar miembros con roles de administración, recepción o mecánico. El acceso depende de su rol y de las sucursales asignadas.",
	},
	{
		q: "¿Kilora reemplaza mi sistema de facturación o inventario?",
		a: "Kilora se enfoca en órdenes, cotizaciones e historial del vehículo. Actualmente no incluye facturación fiscal, inventario, contabilidad ni sincronización con otros sistemas.",
	},
	{
		q: "¿Necesito instalar un programa?",
		a: "No. Abrís Kilora en el navegador de tu computadora o teléfono. Está en español y los montos se registran en dólares estadounidenses, para talleres de El Salvador.",
	},
];

export type LandingAudience = "owner" | "workshop";

export const LANDING_PAGES = {
	owner: {
		path: "/",
		title: "Kilora | Historial de mantenimiento de tu carro en El Salvador",
		description:
			"Guardá servicios, repuestos, gastos y comprobantes de tu carro. Escaneá una foto o PDF y conservá tu historial, aunque tu taller no use Kilora. El Salvador.",
		audience: "Propietarios de vehículos en El Salvador",
		category: "LifestyleApplication",
		topic: "Historial de mantenimiento del carro",
		features: [
			"Historial de servicios de cualquier taller",
			"Comprobantes privados en imagen o PDF",
			"Servicios, repuestos, fechas, kilometraje y gastos",
			"Explicaciones de los servicios en palabras claras",
			"Reporte para venta sin montos ni notas",
		],
		faqs: OWNER_FAQS,
	},
	workshop: {
		path: "/talleres",
		title: "Kilora | Software para talleres automotrices en El Salvador",
		description:
			"Organizá clientes, vehículos, órdenes y cotizaciones por sucursal. Compartí presupuestos por WhatsApp y el historial con tus clientes. Kilora para talleres.",
		audience: "Talleres automotrices independientes en El Salvador",
		category: "BusinessApplication",
		topic: "Gestión de talleres automotrices",
		features: [
			"Clientes y vehículos por taller",
			"Órdenes desde recepción hasta entrega",
			"Cotizaciones compartibles por WhatsApp",
			"Roles y permisos por sucursal",
			"Historial compartido con el propietario",
			"Costos internos y notas privadas",
		],
		faqs: WORKSHOP_FAQS,
	},
} as const;
