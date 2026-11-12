export const SITE_URL = (
	import.meta.env.VITE_SITE_URL || "https://kilora.app"
).replace(/\/$/, "");

export const SITE_NAME = "Kilora";

export const SITE_TITLE =
	"Kilora — Historial digital del vehículo para talleres en El Salvador";

export const SITE_DESCRIPTION =
	"El historial de tu carro viaja con vos. Cotizaciones con IA, escaneo de recibos, registro de repuestos y reportes para venta para talleres y propietarios en El Salvador.";

export const OG_IMAGE = `${SITE_URL}/og.png`;

export type Faq = { q: string; a: string };

// Respuestas cortas y autocontenidas: así las citan bien los buscadores y
// los asistentes de IA. Se publican también como FAQPage en JSON-LD.
export const FAQS: Faq[] = [
	{
		q: "¿Qué es Kilora?",
		a: "Kilora es un historial digital del vehículo. El taller registra cada servicio (trabajos, repuestos, kilometraje, fotos y cotización) y el propietario lo consulta desde su teléfono. El historial pertenece al carro, no al taller.",
	},
	{
		q: "¿Qué pasa con mi historial si cambio de taller?",
		a: "Lo conservás. El historial queda ligado al vehículo y al propietario, así que cuando otro taller te atiende, el registro sigue completo y el nuevo servicio se agrega a la misma línea de tiempo.",
	},
	{
		q: "¿Otro taller puede ver lo que cobré o mis notas?",
		a: "No. Un taller vinculado solo ve una vista ciega: qué trabajo se hizo, la fecha y el kilometraje. Nunca ve el taller autor, las marcas de los repuestos, los precios, las fotos ni las notas. Los costos internos y las notas privadas quedan solo en el taller que hizo el servicio. Esa proyección se aplica en el servidor.",
	},
	{
		q: "¿Cuánto tarda registrar una orden de servicio?",
		a: "Menos de 5 minutos. La recepción usa plantillas de trabajos frecuentes y solo pide los datos esenciales: vehículo, kilometraje y trabajos realizados.",
	},
	{
		q: "¿El propietario necesita instalar una app?",
		a: "No. El taller lo invita por correo o con un link y QR que se comparte por WhatsApp. El propietario abre el historial desde el navegador del teléfono.",
	},
	{
		q: "¿Se puede editar o borrar un registro del historial?",
		a: "No se reescribe. El historial es append-only: si hay un error, el taller agrega una corrección fechada y el registro original queda visible. Así el historial es confiable al vender el carro.",
	},
	{
		q: "¿Qué puedo hacer con la IA de Kilora?",
		a: "Podés preparar cotizaciones desde notas, completar un servicio desde la foto de un recibo y obtener explicaciones claras del mantenimiento. El asistente también responde dudas de Kilora y consulta los datos que tu cuenta puede ver. Los borradores se revisan antes de guardar; el asistente no modifica registros.",
	},
	{
		q: "¿Cómo comparto el historial al vender mi carro?",
		a: "Desde tu vehículo, creá un Reporte para venta. Recibís un enlace de solo lectura válido por 30 días con los servicios, talleres y kilometraje, sin montos ni notas. Podés imprimirlo como PDF. Crear un nuevo enlace invalida el anterior; el reporte incluye un resumen con IA.",
	},
	{
		q: "¿Las sugerencias de mantenimiento dependen de la IA?",
		a: "No. Se calculan con intervalos de referencia, el historial disponible y el último kilometraje registrado. La IA ayuda a redactarlas. El taller revisa las sugerencias y decide cuáles recomendar.",
	},
	{
		q: "¿En qué país funciona Kilora?",
		a: "Kilora está pensado para talleres independientes de El Salvador: precios en USD, teléfonos +503 y todo en español.",
	},
];
