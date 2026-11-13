import { Link } from "@tanstack/react-router";
import {
	ArrowDownRight,
	ArrowRight,
	Check,
	ClipboardList,
	EyeOff,
	FileText,
	History,
	MessageCircle,
	Package,
	Plus,
	QrCode,
	ScanLine,
	ShieldCheck,
	Sparkles,
	Wrench,
	X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FAQS } from "@/lib/site";

const NAV = [
	{ href: "#como-funciona", label: "Cómo funciona" },
	{ href: "#funciones", label: "Qué podés hacer" },
	{ href: "#talleres", label: "Talleres" },
	{ href: "#preguntas", label: "Preguntas" },
];

export function LandingHeader() {
	return (
		<header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
			<div className="frame flex h-14 items-center justify-between gap-6 px-5 md:px-8">
				<a
					href="#inicio"
					className="flex items-center gap-2.5 font-display text-base font-bold tracking-[0.22em]"
					aria-label="Kilora, inicio"
				>
					<Logo />
					KILORA
				</a>
				<nav aria-label="Secciones" className="hidden md:block">
					<ul className="flex items-center gap-7 font-mono text-[11px] uppercase tracking-widest text-ink-3">
						{NAV.map((item) => (
							<li key={item.href}>
								<a
									href={item.href}
									className="transition-colors hover:text-foreground"
								>
									{item.label}
								</a>
							</li>
						))}
					</ul>
				</nav>
				<div className="flex items-center gap-2">
					<Link
						to="/login"
						search={{ redirect: undefined }}
						className={buttonVariants({ variant: "ghost", size: "sm" })}
					>
						Ingresar
					</Link>
					<Link
						to="/registro"
						search={{ redirect: undefined }}
						className={`${buttonVariants({ size: "sm" })} hidden sm:inline-flex`}
					>
						Crear cuenta
					</Link>
				</div>
			</div>
		</header>
	);
}

function Logo() {
	return (
		<svg
			viewBox="0 0 24 24"
			className="size-6 text-seal"
			aria-hidden="true"
			focusable="false"
		>
			<rect
				x="1.5"
				y="1.5"
				width="21"
				height="21"
				rx="3"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
			/>
			<path
				d="M8 6v12M8 12l7-6M10.5 10l5 8"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="square"
			/>
		</svg>
	);
}

export function Hero() {
	return (
		<section
			id="inicio"
			aria-labelledby="hero-title"
			className="relative overflow-hidden border-b"
		>
			<div className="grid-bg pointer-events-none absolute inset-0" />
			<div className="frame relative grid gap-14 px-5 pt-16 pb-20 md:px-8 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-10 lg:pt-24 lg:pb-28">
				<div className="enter">
					<p className="eyebrow">
						<span className="inline-block size-1.5 rounded-full bg-seal" />
						Para tu carro y tu taller · El Salvador
					</p>
					<h1
						id="hero-title"
						className="mt-6 font-display text-[2.6rem] leading-[1.02] font-bold tracking-[-0.03em] text-balance sm:text-6xl lg:text-[4.4rem]"
					>
						Todo lo que le hiciste a tu carro,{" "}
						<span className="text-seal">en un solo lugar.</span>
					</h1>
					<p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-ink-2">
						Kilora reúne el historial de mantenimiento de tu carro: qué se
						reparó, cuándo y cuánto pagaste, aunque cambies de taller. Y si
						tenés un taller, organizás los trabajos y las cotizaciones sin
						perderte entre papeles y mensajes.
					</p>
					<div className="mt-9 flex flex-wrap items-center gap-3">
						<a href="#como-funciona" className={buttonVariants({ size: "lg" })}>
							Ver cómo funciona
							<ArrowDownRight />
						</a>
						<Link
							to="/registro"
							search={{ redirect: undefined }}
							className={buttonVariants({ size: "lg", variant: "outline" })}
						>
							Registrar mi taller
						</Link>
					</div>
					<p className="mt-5 font-mono text-xs text-ink-3">
						Desde tu teléfono · Sin instalar una app
					</p>
				</div>
				<div className="enter [animation-delay:120ms]" data-nosnippet>
					<HistoryCard />
				</div>
			</div>
			<SpecStrip />
		</section>
	);
}

type Viewer = "propietario" | "taller";

const RECORDS = [
	{
		date: "14 oct 2026",
		km: "84 210",
		job: "Cambio de aceite y filtro",
		parts: "Aceite 5W-30 · Filtro de aceite",
		brand: "Toyota",
		shop: "Taller Mecánico Ruiz",
		cost: "$48.00",
		note: "Revisar balatas en el próximo servicio",
	},
	{
		date: "02 jun 2026",
		km: "79 040",
		job: "Pastillas de freno delanteras",
		parts: "Juego de pastillas cerámicas",
		brand: "Brembo",
		shop: "AutoServicio La Cima",
		cost: "$65.00",
		note: "Discos dentro de tolerancia",
	},
	{
		date: "18 ene 2026",
		km: "72 655",
		job: "Alineación y balanceo",
		parts: "4 llantas",
		brand: null,
		shop: "Taller Mecánico Ruiz",
		cost: "$30.00",
		note: "Llanta trasera izq. con desgaste irregular",
	},
];

function HistoryCard() {
	const [viewer, setViewer] = useState<Viewer>("propietario");
	const blind = viewer === "taller";
	return (
		<figure className="relative">
			<Corners />
			<div className="relative rounded-lg border bg-card shadow-[0_1px_0_rgba(17,24,39,0.04),0_24px_48px_-24px_rgba(17,24,39,0.18)]">
				<div className="flex items-center justify-between gap-4 border-b px-5 py-4">
					<div>
						<p className="font-mono text-[11px] uppercase tracking-widest text-ink-3">
							Vehículo
						</p>
						<p className="mt-1 font-display font-bold">
							Toyota Corolla 2016{" "}
							<span className="ml-1 rounded border px-1.5 py-0.5 font-mono text-xs font-medium whitespace-nowrap text-ink-2">
								P 512 834
							</span>
						</p>
					</div>
					<div className="text-right">
						<p className="font-mono text-[11px] uppercase tracking-widest text-ink-3">
							Kilometraje
						</p>
						<p className="mt-1 font-mono text-lg font-semibold whitespace-nowrap tabular-nums">
							84 210<span className="ml-1 text-xs text-ink-3">km</span>
						</p>
					</div>
				</div>

				<fieldset className="border-b px-5 py-3">
					<legend className="sr-only">Ver el historial como</legend>
					<div className="flex items-center gap-3">
						<span className="font-mono text-[11px] uppercase tracking-widest text-ink-3">
							Ver como
						</span>
						<ToggleGroup
							type="single"
							value={viewer}
							onValueChange={(value) => {
								if (value === "propietario" || value === "taller")
									setViewer(value);
							}}
							spacing={1}
							className="rounded-md border bg-surface p-0.5"
						>
							{(
								[
									["propietario", "Propietario"],
									["taller", "Otro taller"],
								] as const
							).map(([value, label]) => (
								<ToggleGroupItem
									key={value}
									value={value}
									className="h-auto min-w-0 rounded px-3 py-1 text-xs font-medium text-ink-3 hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
								>
									{label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>
				</fieldset>

				<ol className="relative px-5 py-2" aria-live="polite">
					{RECORDS.map((r, i) => (
						<li
							key={r.date}
							className="relative grid grid-cols-[auto_1fr] gap-x-4 py-3.5"
						>
							<div className="relative flex flex-col items-center">
								<span
									className={`mt-1.5 size-2.5 rounded-full border-2 ${i === 0 ? "border-seal bg-seal" : "border-ink-3 bg-card"}`}
								/>
								{i < RECORDS.length - 1 && (
									<span className="mt-1 w-px flex-1 bg-line" />
								)}
							</div>
							<div className="min-w-0">
								<div className="flex flex-wrap items-baseline justify-between gap-x-3">
									<p className="font-medium">{r.job}</p>
									<p className="font-mono text-xs text-ink-3 tabular-nums">
										{r.date} · {r.km} km
									</p>
								</div>
								<dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
									<dt className="text-ink-3">Taller</dt>
									<dd>
										<Field hidden={blind}>
											<span className="inline-flex items-center gap-1">
												{r.shop}
												<ShieldCheck
													className="size-3.5 text-seal"
													aria-label="Taller verificado"
												/>
											</span>
										</Field>
									</dd>
									<dt className="text-ink-3">Repuestos</dt>
									<dd>{r.parts}</dd>
									{r.brand && (
										<>
											<dt className="text-ink-3">Marca</dt>
											<dd>
												<Field hidden={blind}>{r.brand}</Field>
											</dd>
										</>
									)}
									<dt className="text-ink-3">Costo</dt>
									<dd className="font-mono tabular-nums">
										<Field hidden={blind}>{r.cost}</Field>
									</dd>
									<dt className="text-ink-3">Nota</dt>
									<dd className="truncate">
										<Field hidden={blind}>{r.note}</Field>
									</dd>
								</dl>
							</div>
						</li>
					))}
				</ol>
			</div>
			<figcaption className="mt-4 flex items-start gap-2 font-mono text-xs leading-relaxed text-ink-3">
				<EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
				{blind
					? "Otro taller ve qué se hizo, cuándo y con qué kilometraje. Nada más."
					: "Consultá qué le hicieron a tu carro, dónde y cuánto pagaste."}
			</figcaption>
		</figure>
	);
}

function Field({ hidden, children }: { hidden: boolean; children: ReactNode }) {
	if (!hidden) return <span className="fade-in">{children}</span>;
	return (
		<span className="inline-flex items-center gap-1.5 text-ink-3">
			<span
				aria-hidden="true"
				className="redacted inline-block h-2.5 w-20 rounded-sm"
			/>
			<span className="sr-only">Oculto para otros talleres</span>
		</span>
	);
}

function Corners() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute -inset-3 hidden sm:block"
		>
			<span className="absolute top-0 left-0 size-3 border-t border-l border-ink-3/60" />
			<span className="absolute top-0 right-0 size-3 border-t border-r border-ink-3/60" />
			<span className="absolute bottom-0 left-0 size-3 border-b border-l border-ink-3/60" />
			<span className="absolute right-0 bottom-0 size-3 border-r border-b border-ink-3/60" />
		</div>
	);
}

const SPECS = [
	{ value: "Todo junto", label: "servicios, repuestos y gastos" },
	{ value: "Siempre con vos", label: "aunque cambies de taller" },
	{ value: "Sin instalar", label: "abrilo desde tu teléfono" },
	{ value: "Listo para vender", label: "compartí el cuidado de tu carro" },
];

function SpecStrip() {
	return (
		<div className="relative border-t bg-background/60">
			<dl className="frame grid grid-cols-2 md:grid-cols-4">
				{SPECS.map((s, i) => (
					<div
						key={s.label}
						className={`px-5 py-6 md:px-8 ${i % 2 === 1 ? "border-l" : ""} ${i > 1 ? "border-t md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""}`}
					>
						<dt className="sr-only">{s.label}</dt>
						<dd>
							<span className="block font-display text-2xl font-bold tracking-tight tabular-nums md:text-3xl">
								{s.value}
							</span>
							<span className="mt-1 block font-mono text-[11px] uppercase tracking-widest text-ink-3">
								{s.label}
							</span>
						</dd>
					</div>
				))}
			</dl>
		</div>
	);
}

function SectionHead({
	index,
	label,
	id,
	title,
	children,
	invert,
}: {
	index: string;
	label: string;
	id: string;
	title: ReactNode;
	children?: ReactNode;
	invert?: boolean;
}) {
	return (
		<div className="reveal grid gap-6 lg:grid-cols-[14rem_1fr] lg:gap-10">
			<p
				className={`font-mono text-[11px] uppercase tracking-widest ${invert ? "text-background/60" : "text-ink-3"}`}
			>
				<span className={invert ? "text-background" : "text-seal"}>
					[{index}]
				</span>{" "}
				{label}
			</p>
			<div>
				<h2
					id={id}
					className="max-w-3xl font-display text-3xl leading-[1.08] font-bold tracking-[-0.02em] text-balance md:text-5xl"
				>
					{title}
				</h2>
				{children && (
					<p
						className={`mt-5 max-w-2xl text-lg leading-relaxed text-pretty ${invert ? "text-background/70" : "text-ink-2"}`}
					>
						{children}
					</p>
				)}
			</div>
		</div>
	);
}

export function Problem() {
	const items = [
		{
			k: "Recibos perdidos",
			t: "El recibo quedó en la guantera y el detalle del trabajo, entre mensajes de WhatsApp.",
		},
		{
			k: "Memoria",
			t: "¿Cuándo cambiaste los frenos? ¿Qué aceite le pusieron? No tendrías que depender de tu memoria.",
		},
		{
			k: "Venta",
			t: "Cuidaste tu carro, pero al venderlo te cuesta mostrar los servicios que le hiciste.",
		},
	];
	return (
		<section aria-labelledby="problema-title" className="border-b">
			<div className="frame px-5 py-20 md:px-8 md:py-28">
				<SectionHead
					index="01"
					label="El problema"
					id="problema-title"
					title="Cuando cambiás de taller, el historial se queda atrás."
				>
					Entre recibos, mensajes y lo que recordás, es difícil saber todo lo
					que se le ha hecho a tu carro. Kilora reúne esos servicios para que
					los tengás a mano cuando los necesités.
				</SectionHead>
				<ul className="mt-14 grid border-t md:grid-cols-3 lg:ml-[15rem]">
					{items.map((it, i) => (
						<li
							key={it.k}
							className={`reveal border-b py-6 md:border-b-0 md:py-8 ${i > 0 ? "md:border-l md:pl-6" : ""} ${i < 2 ? "md:pr-6" : ""}`}
						>
							<p className="font-mono text-[11px] uppercase tracking-widest text-ink-3">
								<X
									className="mr-1.5 inline size-3 -translate-y-px text-destructive"
									aria-hidden="true"
								/>
								{it.k}
							</p>
							<p className="mt-3 leading-relaxed">{it.t}</p>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}

export function HowItWorks() {
	const steps = [
		{
			icon: ClipboardList,
			title: "Tu taller registra el servicio",
			body: "El taller anota el motivo de la visita, el kilometraje y el trabajo a realizar. Así queda claro qué necesita tu carro.",
			meta: "El trabajo, en orden",
		},
		{
			icon: QrCode,
			title: "Conectás tu carro a tu cuenta",
			body: "Recibís una invitación del taller por correo o WhatsApp. La aceptás y consultás los servicios de tu carro desde tu teléfono.",
			meta: "Sin instalar una app",
		},
		{
			icon: History,
			title: "Guardás cada mantenimiento",
			body: "Cuando el taller termina el trabajo, el servicio queda en tu historial. Podés agregar recibos anteriores y conservarlo aunque cambies de taller.",
			meta: "A mano cuando lo necesités",
		},
	];
	return (
		<section
			id="como-funciona"
			aria-labelledby="como-title"
			className="scroll-mt-14 border-b"
		>
			<div className="frame px-5 py-20 md:px-8 md:py-28">
				<SectionHead
					index="02"
					label="Cómo funciona"
					id="como-title"
					title="Del taller a tu teléfono, en tres pasos."
				/>
				<ol className="mt-14 grid gap-px overflow-hidden rounded-lg border bg-line md:grid-cols-3">
					{steps.map((s, i) => (
						<li
							key={s.title}
							className="reveal flex flex-col bg-card p-6 md:p-8"
						>
							<div className="flex items-center justify-between">
								<span className="flex size-10 items-center justify-center rounded-md border bg-seal-soft text-seal">
									<s.icon className="size-5" aria-hidden="true" />
								</span>
								<span className="font-mono text-xs text-ink-3">
									0{i + 1} / 03
								</span>
							</div>
							<h3 className="mt-8 font-display text-xl font-bold">{s.title}</h3>
							<p className="mt-3 flex-1 leading-relaxed text-ink-2">{s.body}</p>
							<p className="mt-8 border-t pt-4 font-mono text-[11px] uppercase tracking-widest text-ink-3">
								{s.meta}
							</p>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}

const LAYERS: { field: string; owner: boolean; shop: boolean }[] = [
	{ field: "Trabajo o pieza", owner: true, shop: true },
	{ field: "Marca del repuesto", owner: true, shop: false },
	{ field: "Fecha del servicio", owner: true, shop: true },
	{ field: "Kilometraje", owner: true, shop: true },
	{ field: "Taller que lo hizo", owner: true, shop: false },
	{ field: "Costo y cotización", owner: true, shop: false },
	{ field: "Fotos", owner: true, shop: false },
	{ field: "Notas del servicio", owner: true, shop: false },
	{ field: "Costos internos y notas privadas", owner: false, shop: false },
];

export function TwoLayers() {
	return (
		<section
			id="dos-capas"
			aria-labelledby="capas-title"
			className="dark-band scroll-mt-14 border-b bg-foreground text-background"
		>
			<div className="frame px-5 py-20 md:px-8 md:py-28">
				<SectionHead
					index="03"
					label="Tu información, cuidada"
					id="capas-title"
					title="Compartí el mantenimiento con tranquilidad."
					invert
				>
					Como propietario, podés consultar tus servicios y lo que pagaste. Si
					vinculás tu carro a otro taller, ese taller podrá conocer los trabajos
					anteriores sin ver tus pagos ni las notas. Si tenés un taller, tus
					costos internos y anotaciones privadas quedan solo para tu equipo.
				</SectionHead>
				<div className="reveal mt-14 overflow-x-auto lg:ml-[15rem]">
					<table className="w-full border-collapse text-left">
						<caption className="sr-only">
							Qué ve cada persona en un registro del historial
						</caption>
						<thead>
							<tr className="border-b border-background/15 font-mono text-[11px] uppercase tracking-widest text-background/60">
								<th scope="col" className="py-4 pr-4 font-normal">
									Dato del registro
								</th>
								<th
									scope="col"
									className="w-24 px-2 py-4 font-normal sm:w-36 sm:px-4"
								>
									Propietario
								</th>
								<th
									scope="col"
									className="w-24 px-2 py-4 font-normal sm:w-36 sm:px-4"
								>
									Otro taller
								</th>
							</tr>
						</thead>
						<tbody>
							{LAYERS.map((row) => (
								<tr key={row.field} className="border-b border-background/10">
									<th scope="row" className="py-4 pr-4 font-medium">
										{row.field}
									</th>
									<td className="px-2 py-4 sm:px-4">
										<Mark on={row.owner} />
									</td>
									<td className="px-2 py-4 sm:px-4">
										<Mark on={row.shop} />
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</section>
	);
}

function Mark({ on }: { on: boolean }) {
	return on ? (
		<span className="inline-flex items-center gap-2 font-mono text-xs text-[#9cc3f0]">
			<Check className="size-4" aria-hidden="true" />
			<span className="max-sm:sr-only">Visible</span>
		</span>
	) : (
		<span className="inline-flex items-center gap-2 font-mono text-xs text-background/45">
			<EyeOff className="size-4" aria-hidden="true" />
			<span className="max-sm:sr-only">Oculto</span>
		</span>
	);
}

const FEATURES = [
	{
		icon: ClipboardList,
		label: "Para talleres",
		title: "Cotizá sin empezar de cero",
		body: "Describí el trabajo con tus palabras y recibí una cotización para revisar. Ajustá los repuestos y precios antes de compartirla con tu cliente.",
	},
	{
		icon: ScanLine,
		label: "Para propietarios",
		title: "Tus recibos también cuentan",
		body: "¿Tenés servicios guardados en papel? Tomá una foto del recibo, revisá los datos y agregalos al historial de tu carro.",
	},
	{
		icon: MessageCircle,
		label: "Para ambos",
		title: "El mantenimiento, en palabras claras",
		body: "Entendé para qué sirvió cada reparación y qué te están cotizando. El taller puede preparar una explicación y compartirla por WhatsApp.",
	},
	{
		icon: Wrench,
		label: "Para talleres",
		title: "Orientá mejor a tu cliente",
		body: "Consultá los servicios anteriores y el kilometraje para revisar qué mantenimiento podría necesitar el carro. Vos decidís qué recomendar.",
	},
	{
		icon: FileText,
		label: "Para propietarios",
		title: "Un historial listo para la venta",
		body: "Mostrale a un posible comprador cómo cuidaste tu carro. Compartí sus servicios y kilometraje con un enlace que dura 30 días, sin mostrar lo que pagaste ni tus notas.",
	},
	{
		icon: Package,
		label: "Para ambos",
		title: "Sabé qué repuestos lleva tu carro",
		body: "Consultá qué piezas se cambiaron y de qué marca eran. Tené ese detalle a mano para tu próxima visita al taller.",
	},
];

export function Features() {
	return (
		<section
			id="funciones"
			aria-labelledby="funciones-title"
			className="scroll-mt-14 border-b bg-surface"
		>
			<div className="frame px-5 py-20 md:px-8 md:py-28">
				<SectionHead
					index="04"
					label="Más que un registro"
					id="funciones-title"
					title="Menos trabajo para registrar. Más claridad para decidir."
				>
					Encontrá lo que necesitás para cuidar tu carro o atender mejor a tus
					clientes, desde la primera cotización hasta el próximo servicio.
				</SectionHead>
				<ul className="mt-14 grid gap-px overflow-hidden rounded-lg border bg-line md:grid-cols-2 lg:grid-cols-3">
					{FEATURES.map((feature) => (
						<li key={feature.title} className="reveal bg-card p-6 md:p-8">
							<div className="flex items-center justify-between gap-4">
								<feature.icon
									className="size-5 shrink-0 text-seal"
									aria-hidden="true"
								/>
								<p className="font-mono text-[11px] uppercase tracking-widest text-ink-3">
									{feature.label}
								</p>
							</div>
							<h3 className="mt-6 font-display text-xl font-bold">
								{feature.title}
							</h3>
							<p className="mt-3 leading-relaxed text-ink-2">{feature.body}</p>
						</li>
					))}
				</ul>
				<div className="mt-6 flex flex-col gap-4 rounded-lg border bg-seal-soft p-6 sm:flex-row sm:items-start md:p-8">
					<Sparkles className="size-5 shrink-0 text-seal" aria-hidden="true" />
					<div>
						<h3 className="font-display text-xl font-bold">
							¿Cuánto gasté? ¿Qué le hicieron a mi carro?
						</h3>
						<p className="mt-2 max-w-3xl leading-relaxed text-ink-2">
							Preguntale al asistente y encontrá respuestas sobre tus servicios,
							vehículos y cotizaciones sin buscar uno por uno. También te ayuda
							cuando tenés dudas sobre cómo usar Kilora.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}

export function Audiences() {
	const groups = [
		{
			id: "talleres",
			label: "Para talleres",
			title: "Tu taller en orden. Tus clientes, informados.",
			points: [
				"Encontrá los trabajos y los clientes de cada sucursal",
				"Prepará cotizaciones y compartilas por WhatsApp",
				"Guardá los costos y las notas privadas de tu equipo",
				"Consultá los repuestos usados y el mantenimiento anterior",
				"Elegí a qué sucursales puede acceder cada persona del equipo",
			],
			cta: { to: "/registro" as const, text: "Registrar mi taller" },
		},
		{
			id: "propietarios",
			label: "Para propietarios",
			title: "Todo el mantenimiento de tu carro, en tu teléfono.",
			points: [
				"Recordá cuándo se hizo cada servicio y qué repuestos usaron",
				"Lo conservás aunque cambies de taller",
				"Recuperá servicios anteriores con una foto del recibo",
				"Entendé las reparaciones con explicaciones claras",
				"Mostrá cómo cuidaste tu carro cuando lo pongás en venta",
			],
			cta: { to: "/login" as const, text: "Ver mis vehículos" },
		},
	];
	return (
		<section aria-label="Beneficios" className="border-b">
			<div className="frame grid md:grid-cols-2">
				{groups.map((g, i) => (
					<article
						key={g.id}
						id={g.id}
						aria-labelledby={`${g.id}-title`}
						className={`reveal scroll-mt-14 px-5 py-20 md:px-8 md:py-24 ${i === 1 ? "border-t md:border-t-0 md:border-l" : ""}`}
					>
						<p className="font-mono text-[11px] uppercase tracking-widest text-ink-3">
							<span className="text-seal">[0{i + 5}]</span> {g.label}
						</p>
						<h2
							id={`${g.id}-title`}
							className="mt-6 max-w-md font-display text-3xl leading-[1.1] font-bold tracking-[-0.02em] text-balance md:text-4xl"
						>
							{g.title}
						</h2>
						<ul className="mt-8 border-t">
							{g.points.map((p) => (
								<li
									key={p}
									className="flex items-start gap-3 border-b py-3.5 leading-relaxed"
								>
									<Plus
										className="mt-1 size-3.5 shrink-0 text-seal"
										aria-hidden="true"
									/>
									{p}
								</li>
							))}
						</ul>
						<Link
							to={g.cta.to}
							search={{ redirect: undefined }}
							className="group mt-8 inline-flex items-center gap-2 font-medium text-seal"
						>
							{g.cta.text}
							<ArrowRight
								className="size-4 transition-transform group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</Link>
					</article>
				))}
			</div>
		</section>
	);
}

export function FaqSection() {
	return (
		<section
			id="preguntas"
			aria-labelledby="faq-title"
			className="scroll-mt-14 border-b"
		>
			<div className="frame px-5 py-20 md:px-8 md:py-28">
				<SectionHead
					index="07"
					label="Preguntas frecuentes"
					id="faq-title"
					title="Lo que preguntan talleres y propietarios."
				/>
				<div className="mt-14 border-t lg:ml-[15rem]">
					{FAQS.map((f) => (
						<details key={f.q} className="faq group border-b">
							<summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-display text-lg font-semibold [&::-webkit-details-marker]:hidden">
								<h3>{f.q}</h3>
								<Plus
									className="size-4 shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-45"
									aria-hidden="true"
								/>
							</summary>
							<p className="max-w-2xl pb-6 leading-relaxed text-ink-2">{f.a}</p>
						</details>
					))}
				</div>
			</div>
		</section>
	);
}

export function FinalCta() {
	return (
		<section
			aria-labelledby="cta-title"
			className="relative overflow-hidden border-b"
		>
			<div className="grid-bg pointer-events-none absolute inset-0" />
			<div className="frame relative px-5 py-24 text-center md:px-8 md:py-32">
				<p className="eyebrow justify-center">Empezá hoy</p>
				<h2
					id="cta-title"
					className="mx-auto mt-6 max-w-3xl font-display text-4xl leading-[1.05] font-bold tracking-[-0.03em] text-balance md:text-6xl"
				>
					Cuidás tu carro.{" "}
					<span className="text-seal">Conservá su historia.</span>
				</h2>
				<div className="mt-10 flex flex-wrap justify-center gap-3">
					<Link
						to="/registro"
						search={{ redirect: undefined }}
						className={buttonVariants({ size: "lg" })}
					>
						Crear cuenta
						<ArrowRight />
					</Link>
				</div>
			</div>
		</section>
	);
}

export function LandingFooter() {
	return (
		<footer>
			<div className="frame flex flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-8">
				<div className="flex items-center gap-2.5 font-display text-sm font-bold tracking-[0.22em]">
					<Logo />
					KILORA
				</div>
				<p className="font-mono text-xs text-ink-3">
					El cuidado de tu carro, a mano · Hecho en El Salvador ·{" "}
					{new Date().getFullYear()}
				</p>
				<nav aria-label="Pie de página">
					<ul className="flex gap-5 text-sm text-ink-3">
						<li>
							<Link
								to="/login"
								search={{ redirect: undefined }}
								className="hover:text-foreground"
							>
								Ingresar
							</Link>
						</li>
						<li>
							<Link
								to="/registro"
								search={{ redirect: undefined }}
								className="hover:text-foreground"
							>
								Crear cuenta
							</Link>
						</li>
						<li>
							<a href="#preguntas" className="hover:text-foreground">
								Preguntas
							</a>
						</li>
					</ul>
				</nav>
			</div>
		</footer>
	);
}
