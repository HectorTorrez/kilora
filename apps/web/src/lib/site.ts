export const SITE_URL = (
	import.meta.env.VITE_SITE_URL || "https://kilora.dev"
).replace(/\/$/, "");

export const SITE_NAME = "Kilora";

export const SITE_TITLE =
	"Kilora | Historial del carro y gestión de talleres en El Salvador";

export const SITE_DESCRIPTION =
	"Guardá el historial de mantenimiento de tu carro, consultá reparaciones y gastos. Organizá clientes y cotizaciones de tu taller en El Salvador con Kilora.";

export const OG_IMAGE = `${SITE_URL}/og.png`;

export type Faq = { q: string; a: string };

// Las preguntas visibles y sus datos estructurados comparten la misma fuente.
export const FAQS: Faq[] = [
	{
		q: "¿Para qué me sirve Kilora?",
		a: "Kilora es una herramienta para llevar el historial de mantenimiento de tu carro y organizar tu taller en El Salvador. Reúne qué le hicieron al vehículo, cuándo y cuánto pagaste. Los talleres también pueden organizar sus trabajos, clientes y cotizaciones.",
	},
	{
		q: "¿Qué pasa con mi historial si cambio de taller?",
		a: "Lo conservás en tu cuenta. Podés consultar tus servicios anteriores y, al vincular tu carro a otro taller que use Kilora, sumar los nuevos al mismo historial.",
	},
	{
		q: "¿Puedo agregar servicios de antes de usar Kilora?",
		a: "Sí. Podés anotarlos vos o tomar una foto de un recibo para completar los datos. Revisá la fecha, el kilometraje, los trabajos y el total antes de guardarlos.",
	},
	{
		q: "¿Necesito instalar una app?",
		a: "No. Kilora se abre desde el navegador de tu teléfono o computadora. Si tu taller te envía una invitación por correo o WhatsApp, aceptala para conectar tu carro a tu cuenta y consultar su historial.",
	},
	{
		q: "¿Qué puede ver otro taller sobre mi carro?",
		a: "Un taller vinculado a tu carro puede consultar los trabajos, las piezas, las fechas y el kilometraje. No ve lo que pagaste, las marcas de los repuestos, las fotos, las notas ni qué otro taller hizo el servicio. Los costos internos y las notas privadas quedan solo en el taller que realizó el trabajo.",
	},
	{
		q: "¿Qué pasa si hay un error en un servicio registrado?",
		a: "El taller puede agregar una corrección con su fecha. El registro original se conserva para que podás saber qué cambió y mantener clara la historia de tu carro.",
	},
	{
		q: "¿Cómo me ayuda a organizar mi taller?",
		a: "Podés llevar tus clientes, vehículos, trabajos y cotizaciones en un solo lugar. Tu equipo consulta lo que necesita en cada sucursal y vos podés compartir cotizaciones con tus clientes por WhatsApp.",
	},
	{
		q: "¿Puedo compartir el historial al vender mi carro?",
		a: "Sí. Desde tu vehículo, creá un Reporte para venta y compartí el enlace con el comprador. Puede ver los servicios, los talleres y el kilometraje durante 30 días, sin ver montos ni notas. También podés imprimirlo o guardarlo como PDF. Si creás otro enlace, el anterior deja de funcionar.",
	},
	{
		q: "¿Kilora me dice qué mantenimiento necesita mi carro?",
		a: "El taller puede consultar sugerencias basadas en los servicios registrados y el último kilometraje. Su equipo las revisa y decide qué recomendar según las necesidades de tu carro.",
	},
	{
		q: "¿Está pensado para El Salvador?",
		a: "Sí. Kilora está pensado para talleres independientes y propietarios de vehículos en El Salvador, con precios en dólares y todo en español.",
	},
];
