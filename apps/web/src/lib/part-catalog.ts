import type { components } from "@kilora/contracts";
import type { Shape } from "@/lib/car-anatomy";
import { categoryLabels } from "@/lib/domain";
import type { Zone } from "@/lib/parts-map";
import type { VehiclePlan } from "@/lib/vehicle-plans";

export type PartKey = components["schemas"]["PartKey"];

export type PartInfo = {
	label: string;
	category: Zone;
	/** La pieza en sí: se pinta fuerte. */
	primary: Shape[];
	/** Lo que trabaja con ella: se pinta suave, para dar contexto. */
	secondary?: Shape[];
	where: string | ((plan: VehiclePlan) => string);
	what: string;
	every: string;
	/** Solo existe en ciertos vehículos (p. ej. ballestas o cardán). */
	fits?: (plan: VehiclePlan) => boolean;
};

const rwd = (p: VehiclePlan) => p.drive !== "fwd";
const drum = (p: VehiclePlan) => p.rearBrake === "tambor";

/*
 * Catálogo de piezas que el taller elige. Las claves y su categoría también
 * viven en la API (internal/httpserver/parts.go); aquí van los textos para el
 * propietario y qué se dibuja en el vehículo.
 */
export const partCatalog: Record<PartKey, PartInfo> = {
	aceite_motor: {
		label: "Aceite de motor",
		category: "aceite",
		primary: ["oil_pan", "oil_cap"],
		secondary: ["engine", "dipstick"],
		where:
			"Dentro del motor. Se echa por el tapón de arriba y se junta en el cárter, la bandeja de abajo.",
		what: "Lubrica las piezas que se mueven dentro del motor para que no se desgasten ni se calienten.",
		every: "Cada 5,000 km o 6 meses, lo que pase primero.",
	},
	filtro_aceite: {
		label: "Filtro de aceite",
		category: "aceite",
		primary: ["oil_filter"],
		secondary: ["engine", "oil_pan"],
		where:
			"Pegado al motor, en la parte de abajo. Es un cilindro del tamaño de una lata.",
		what: "Atrapa la suciedad y las limaduras del aceite antes de que vuelva a circular.",
		every: "Con cada cambio de aceite.",
	},
	filtro_aire: {
		label: "Filtro de aire",
		category: "motor",
		primary: ["air_filter"],
		secondary: ["engine"],
		where: "Bajo el capó, en una caja plástica encima o a un lado del motor.",
		what: "Limpia el aire que respira el motor. Sucio, el carro gasta más combustible.",
		every: "Cada 15,000 km; antes si manejás en calles de tierra.",
	},
	bujias: {
		label: "Bujías",
		category: "motor",
		primary: ["spark_plugs"],
		secondary: ["engine"],
		where: "Arriba del motor, una por cada cilindro.",
		what: "Dan la chispa que enciende el combustible. Gastadas, el motor tiembla o cuesta arrancarlo.",
		every: "Cada 30,000 a 100,000 km según el tipo de bujía.",
	},
	correa_distribucion: {
		label: "Correa de distribución",
		category: "motor",
		primary: ["timing_belt"],
		secondary: ["engine"],
		where: "A un costado del motor, tapada por una cubierta plástica.",
		what: "Sincroniza las piezas internas del motor. Si se rompe, el motor puede dañarse seriamente.",
		every: "Cada 60,000 a 100,000 km, según el fabricante.",
	},
	banda_accesorios: {
		label: "Banda de accesorios",
		category: "motor",
		primary: ["accessory_belt"],
		secondary: ["alternator", "ac_compressor", "water_pump"],
		where: "Al frente del motor, a la vista al abrir el capó.",
		what: "Mueve el alternador, el aire acondicionado y la bomba de agua.",
		every:
			"Revisar cada 40,000 km. Si chilla al arrancar, está floja o gastada.",
	},
	inyectores: {
		label: "Inyectores",
		category: "motor",
		primary: ["injectors"],
		secondary: ["engine"],
		where: "Encima del motor, uno por cilindro.",
		what: "Rocían el combustible dentro del motor en la cantidad justa.",
		every: "Limpieza cada 40,000 km o si el motor falla.",
	},
	filtro_combustible: {
		label: "Filtro de combustible",
		category: "motor",
		primary: ["fuel_filter"],
		secondary: ["fuel_tank"],
		where: "Debajo del carro, en la línea que va del tanque al motor.",
		what: "Detiene la suciedad del combustible antes de que llegue a los inyectores.",
		every: "Cada 30,000 a 50,000 km.",
	},
	refrigerante: {
		label: "Refrigerante",
		category: "refrigeracion",
		primary: ["coolant_tank"],
		secondary: ["radiator"],
		where:
			"En un depósito plástico bajo el capó, conectado al radiador del frente.",
		what: "Líquido que enfría el motor. Sin él, el motor se recalienta.",
		every: "Cambio cada 2 años o 40,000 km. Revisar el nivel cada mes.",
	},
	radiador: {
		label: "Radiador",
		category: "refrigeracion",
		primary: ["radiator"],
		secondary: ["coolant_tank"],
		where: "Al frente del carro, detrás de la parrilla.",
		what: "Enfría el líquido que viene del motor con el aire que entra al avanzar.",
		every: "Sin intervalo fijo; revisar fugas en cada servicio.",
	},
	termostato: {
		label: "Termostato",
		category: "refrigeracion",
		primary: ["thermostat"],
		secondary: ["engine", "radiator"],
		where: "Sobre el motor, donde sale la manguera hacia el radiador.",
		what: "Abre y cierra el paso del refrigerante para mantener el motor a la temperatura justa.",
		every: "Se cambia cuando falla o junto con el refrigerante.",
	},
	bomba_agua: {
		label: "Bomba de agua",
		category: "refrigeracion",
		primary: ["water_pump"],
		secondary: ["accessory_belt", "radiator"],
		where: "Al frente del motor, movida por la banda.",
		what: "Hace circular el refrigerante entre el motor y el radiador.",
		every: "Suele cambiarse junto con la correa de distribución.",
	},
	gas_ac: {
		label: "Gas del aire acondicionado",
		category: "aire_acondicionado",
		primary: ["condenser", "ac_compressor"],
		where: "Circula entre el compresor del motor y el condensador del frente.",
		what: "Es lo que enfría el aire de la cabina.",
		every: "Recarga cuando el aire ya no enfría bien.",
	},
	compresor_ac: {
		label: "Compresor del aire",
		category: "aire_acondicionado",
		primary: ["ac_compressor"],
		secondary: ["condenser", "accessory_belt"],
		where: "Pegado al motor, movido por la banda de accesorios.",
		what: "Comprime el gas del aire acondicionado para que pueda enfriar.",
		every: "Sin intervalo fijo.",
	},
	filtro_cabina: {
		label: "Filtro de cabina",
		category: "aire_acondicionado",
		primary: ["cabin_filter"],
		where: "Detrás de la guantera, dentro del carro.",
		what: "Limpia el aire que respirás dentro del carro.",
		every: "Cada 15,000 km o una vez al año.",
	},
	bateria: {
		label: "Batería",
		category: "bateria",
		primary: ["battery"],
		secondary: ["fusebox"],
		where: (p) =>
			p.battery[1] < 0.9 && p.battery[0] < p.engine.x - 1
				? "Bajo la cabina, junto al chasis."
				: "Bajo el capó, a un costado del motor.",
		what: "Da la energía para arrancar y alimenta luces y radio con el motor apagado.",
		every: "Dura de 3 a 4 años.",
	},
	alternador: {
		label: "Alternador",
		category: "electrico",
		primary: ["alternator"],
		secondary: ["accessory_belt", "battery"],
		where: "Al frente del motor, movido por la banda.",
		what: "Carga la batería mientras el motor está encendido.",
		every: "Sin intervalo fijo; si la batería se descarga seguido, revisarlo.",
	},
	motor_arranque: {
		label: "Motor de arranque",
		category: "electrico",
		primary: ["starter"],
		secondary: ["battery", "engine"],
		where: "En la parte baja del motor, junto a la caja.",
		what: "Hace girar el motor al dar la llave para que encienda.",
		every: "Sin intervalo fijo.",
	},
	faros: {
		label: "Faros delanteros",
		category: "electrico",
		primary: ["headlights"],
		where: "Al frente, a los lados de la parrilla.",
		what: "Iluminan el camino y te hacen visible.",
		every: "Cambiar el foco cuando se funde; pulir si están opacos.",
	},
	luces_traseras: {
		label: "Luces traseras",
		category: "electrico",
		primary: ["taillights"],
		where: "Atrás, a cada lado.",
		what: "Avisan a los de atrás cuando frenás, girás o retrocedés.",
		every: "Cambiar el foco cuando se funde.",
	},
	aceite_transmision: {
		label: "Aceite de transmisión",
		category: "transmision",
		primary: ["transmission"],
		secondary: ["engine"],
		where: "Dentro de la caja de cambios, pegada detrás del motor.",
		what: "Lubrica los engranajes de la caja para que los cambios entren suaves.",
		every: "Cada 40,000 a 60,000 km.",
	},
	embrague: {
		label: "Embrague (clutch)",
		category: "transmision",
		primary: ["clutch"],
		secondary: ["transmission", "engine"],
		where: "Entre el motor y la caja de cambios.",
		what: "Conecta y desconecta el motor de las ruedas al cambiar de marcha.",
		every: "Dura de 80,000 a 150,000 km según el manejo.",
	},
	flechas: {
		label: "Flechas / homocinéticas",
		category: "transmision",
		primary: ["cv_axles"],
		secondary: ["transmission"],
		where: (p) =>
			p.drive === "rwd"
				? "En el eje trasero, del diferencial a cada rueda."
				: "Del motor a cada rueda delantera.",
		what: "Llevan la fuerza a las ruedas aunque giren o suban y bajen.",
		every:
			"Revisar los cubrepolvos en cada servicio; si truena al girar, revisar.",
	},
	cardan: {
		label: "Cardán",
		category: "transmision",
		primary: ["driveshaft"],
		secondary: ["transmission", "differential"],
		where: "Debajo del carro, a lo largo, de la caja al eje trasero.",
		what: "Lleva la fuerza del motor a las ruedas de atrás.",
		every: "Engrasar crucetas en cada servicio.",
		fits: rwd,
	},
	diferencial: {
		label: "Diferencial",
		category: "transmision",
		primary: ["differential"],
		secondary: ["driveshaft"],
		where: "En el centro del eje trasero (y del delantero en 4x4).",
		what: "Deja que las ruedas giren a distinta velocidad en las curvas.",
		every: "Cambio de aceite cada 50,000 km.",
		fits: rwd,
	},
	cremallera: {
		label: "Cremallera de dirección",
		category: "direccion",
		primary: ["steering_rack"],
		secondary: ["steering_column", "tie_rods"],
		where: "Debajo del motor, cruzando de rueda a rueda delantera.",
		what: "Convierte el giro del timón en el movimiento de las ruedas.",
		every: "Sin intervalo fijo; revisar si hay juego o fugas.",
	},
	terminales_direccion: {
		label: "Terminales de dirección",
		category: "direccion",
		primary: ["tie_rods"],
		secondary: ["steering_rack", "front_wheel"],
		where: "En las puntas de la cremallera, junto a cada rueda delantera.",
		what: "Unen la dirección con las ruedas. Gastados, el timón queda flojo.",
		every: "Revisar cada 20,000 km o al hacer alineación.",
	},
	liquido_direccion: {
		label: "Líquido de dirección",
		category: "direccion",
		primary: ["power_steering_tank"],
		secondary: ["steering_rack"],
		where: "En un depósito pequeño bajo el capó.",
		what: "Hace que el timón se mueva liviano.",
		every: "Revisar el nivel cada mes; cambio cada 2 años.",
	},
	pastillas_delanteras: {
		label: "Pastillas de freno delanteras",
		category: "frenos",
		primary: ["front_caliper"],
		secondary: ["front_disc", "brake_fluid"],
		where:
			"Dentro de cada rueda delantera, detrás del rin. Son dos placas que aprietan el disco cuando pisás el freno.",
		what: "Frenan el carro. Las delanteras hacen cerca del 70% del trabajo, por eso se gastan antes.",
		every:
			"Revisar cada 20,000 a 30,000 km. Señales: chirrido al frenar o el pedal vibra.",
	},
	pastillas_traseras: {
		label: "Pastillas de freno traseras",
		category: "frenos",
		primary: ["rear_caliper"],
		secondary: ["rear_disc", "brake_fluid"],
		where: "Dentro de cada rueda trasera, detrás del rin.",
		what: "Ayudan a frenar y sostienen el freno de mano.",
		every: "Revisar cada 40,000 km.",
		fits: (p) => !drum(p),
	},
	discos_delanteros: {
		label: "Discos de freno delanteros",
		category: "frenos",
		primary: ["front_disc"],
		secondary: ["front_caliper"],
		where:
			"Detrás del rin de cada rueda delantera; es el plato de metal que gira con la rueda.",
		what: "Las pastillas los aprietan para frenar.",
		every: "Rectificar o cambiar cada 2 cambios de pastillas.",
	},
	discos_traseros: {
		label: "Discos de freno traseros",
		category: "frenos",
		primary: ["rear_disc"],
		secondary: ["rear_caliper"],
		where: "Detrás del rin de cada rueda trasera.",
		what: "Las pastillas traseras los aprietan para frenar.",
		every: "Rectificar o cambiar cada 2 cambios de pastillas.",
		fits: (p) => !drum(p),
	},
	zapatas_traseras: {
		label: "Zapatas / tambores traseros",
		category: "frenos",
		primary: ["rear_disc"],
		where: "Dentro del tambor de cada rueda trasera.",
		what: "Se abren contra el tambor para frenar las ruedas de atrás.",
		every: "Revisar cada 40,000 km.",
		fits: drum,
	},
	liquido_frenos: {
		label: "Líquido de frenos",
		category: "frenos",
		primary: ["brake_fluid"],
		secondary: ["front_caliper", "rear_caliper"],
		where:
			"En un depósito bajo el capó, del lado del conductor, pegado al parabrisas.",
		what: "Lleva la fuerza del pedal hasta cada rueda.",
		every: "Cambio cada 2 años: absorbe humedad y pierde fuerza.",
	},
	amortiguadores_delanteros: {
		label: "Amortiguadores delanteros",
		category: "amortiguadores",
		primary: ["front_shock"],
		secondary: ["front_wheel"],
		where: "Encima de cada rueda delantera, dentro del guardafango.",
		what: "Evitan que el carro rebote y mantienen las llantas pegadas al piso.",
		every:
			"Revisar cada 50,000 km; cambiar si el carro rebota o se va de lado.",
	},
	amortiguadores_traseros: {
		label: "Amortiguadores traseros",
		category: "amortiguadores",
		primary: ["rear_shock"],
		secondary: ["rear_wheel", "rear_leaf"],
		where: "Junto a cada rueda trasera.",
		what: "Controlan el rebote atrás, sobre todo con carga.",
		every: "Revisar cada 50,000 km.",
	},
	ballestas: {
		label: "Ballestas (muelles)",
		category: "amortiguadores",
		primary: ["rear_leaf"],
		secondary: ["rear_shock"],
		where: "Debajo del eje trasero, a lo largo: son hojas de acero apiladas.",
		what: "Cargan el peso de atrás. Vencidas, el carro queda caído.",
		every: "Revisar bujes y hojas cada 40,000 km.",
		fits: (p) => p.rearSpring === "ballesta",
	},
	llantas_delanteras: {
		label: "Llantas delanteras",
		category: "llantas",
		primary: ["front_wheel"],
		where: "Las dos ruedas de adelante.",
		what: "Dan agarre para frenar y girar; adelante se gastan más.",
		every: "Rotar cada 10,000 km; cambiar cuando el dibujo baja de 2 mm.",
	},
	llantas_traseras: {
		label: "Llantas traseras",
		category: "llantas",
		primary: ["rear_wheel"],
		where: (p) =>
			p.wheels.dualRear
				? "Las ruedas de atrás (dobles a cada lado)."
				: "Las dos ruedas de atrás.",
		what: "Dan estabilidad y cargan el peso de atrás.",
		every: "Rotar cada 10,000 km; cambiar cuando el dibujo baja de 2 mm.",
	},
	alineacion_balanceo: {
		label: "Alineación y balanceo",
		category: "llantas",
		primary: ["front_wheel", "rear_wheel"],
		secondary: ["tie_rods", "steering_rack"],
		where: "Se ajusta en las cuatro ruedas y en las puntas de la dirección.",
		what: "Hace que el carro vaya recto y que las llantas se gasten parejo.",
		every: "Cada 10,000 km o al cambiar llantas.",
	},
	catalizador: {
		label: "Catalizador",
		category: "escape",
		primary: ["catalytic"],
		secondary: ["exhaust_pipe"],
		where: "Debajo del carro, en el tubo de escape cerca del motor.",
		what: "Limpia los gases del motor antes de que salgan.",
		every: "Sin intervalo fijo; dura muchos años si el motor está bien.",
	},
	silenciador: {
		label: "Silenciador (mofle)",
		category: "escape",
		primary: ["muffler"],
		secondary: ["exhaust_pipe"],
		where: "Debajo del carro, al final del tubo de escape.",
		what: "Baja el ruido del motor.",
		every: "Cambiar cuando se pica o hace mucho ruido.",
	},
	parabrisas: {
		label: "Parabrisas",
		category: "carroceria",
		primary: ["windshield"],
		secondary: ["wipers"],
		where: "El vidrio de adelante.",
		what: "Te protege del viento y sostiene parte del techo.",
		every: "Cambiar si una grieta cruza tu línea de vista.",
	},
	plumillas: {
		label: "Plumillas",
		category: "carroceria",
		primary: ["wipers"],
		secondary: ["windshield"],
		where: "Sobre el parabrisas.",
		what: "Limpian el agua del vidrio para que veas bien.",
		every: "Cada 6 a 12 meses, o cuando dejan rayas.",
	},
	espejos: {
		label: "Espejos",
		category: "carroceria",
		primary: ["mirrors"],
		where: "A los lados de las puertas delanteras.",
		what: "Te dejan ver lo que viene a los lados y atrás.",
		every: "Cambiar si se quiebran.",
	},
	pintura: {
		label: "Pintura y enderezado",
		category: "carroceria",
		primary: ["body"],
		where: "En la carrocería.",
		what: "Protege la lámina del óxido y mantiene el valor del carro.",
		every: "Encerar cada 3 a 6 meses.",
	},
};

export const partKeys = Object.keys(partCatalog) as PartKey[];

export const isPartKey = (v: unknown): v is PartKey =>
	typeof v === "string" && v in partCatalog;

/** Piezas agrupadas por categoría, en el orden del catálogo, para el selector. */
export const partGroups = (() => {
	const groups = new Map<Zone, PartKey[]>();
	for (const key of partKeys) {
		const c = partCatalog[key].category;
		groups.set(c, [...(groups.get(c) ?? []), key]);
	}
	return [...groups].map(([category, parts]) => ({
		category,
		label: categoryLabels[category],
		parts,
	}));
})();

export const partWhere = (key: PartKey, plan: VehiclePlan) => {
	const w = partCatalog[key].where;
	return typeof w === "function" ? w(plan) : w;
};
