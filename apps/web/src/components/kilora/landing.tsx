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
	ScanLine,
	ShieldCheck,
	Sparkles,
	Wrench,
	X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LANDING_PAGES, type LandingAudience } from "@/lib/site";

type AudienceProps = { audience?: LandingAudience };

const NAV = [
	{ href: "#como-funciona", label: "Cómo funciona" },
	{ href: "#funciones", label: "Qué podés hacer" },
	{ href: "#preguntas", label: "Preguntas" },
];

export function LandingHeader({ audience = "owner" }: AudienceProps) {
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
				<nav aria-label="Secciones" className="hidden lg:block">
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
						search={{
							redirect: audience === "workshop" ? "/onboarding" : undefined,
						}}
						className={buttonVariants({ variant: "ghost", size: "sm" })}
					>
						Ingresar
					</Link>
					<Link
						to="/registro"
						search={{
							redirect: audience === "workshop" ? "/onboarding" : undefined,
						}}
						className={`${buttonVariants({ size: "sm" })} hidden sm:inline-flex`}
					>
						Crear cuenta
					</Link>
				</div>
			</div>
			<div className="border-t">
				<nav
					aria-label="Elegir experiencia"
					className="frame flex gap-1 px-5 py-2 md:px-8"
				>
					<Link
						to="/"
						aria-current={audience === "owner" ? "page" : undefined}
						className={`rounded-md px-3 py-1.5 text-sm font-medium ${audience === "owner" ? "bg-seal-soft text-seal" : "text-ink-3 hover:text-foreground"}`}
					>
						Para propietarios
					</Link>
					<Link
						to="/talleres"
						aria-current={audience === "workshop" ? "page" : undefined}
						className={`rounded-md px-3 py-1.5 text-sm font-medium ${audience === "workshop" ? "bg-seal-soft text-seal" : "text-ink-3 hover:text-foreground"}`}
					>
						Para talleres
					</Link>
				</nav>
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

export function Hero({ audience = "owner" }: AudienceProps) {
	const workshop = audience === "workshop";
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
						{workshop
							? "Software para talleres · El Salvador"
							: "El historial de tu carro · El Salvador"}
					</p>
					<h1
						id="hero-title"
						className="mt-6 font-display text-[2.6rem] leading-[1.02] font-bold tracking-[-0.03em] text-balance sm:text-6xl lg:text-[4.4rem]"
					>
						{workshop
							? "Tu taller en orden."
							: "Todo lo que le hicieron a tu carro,"}{" "}
						<span className="text-seal">
							{workshop ? "Tus clientes, informados." : "en un solo lugar."}
						</span>
					</h1>
					<p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-ink-2">
						{workshop
							? "Organizá clientes, vehículos, órdenes de trabajo y cotizaciones por sucursal. Compartí presupuestos por WhatsApp y entregá a cada cliente un historial claro de lo que le hicieron a su carro."
							: "Guardá qué le hicieron a tu carro, cuándo y cuánto pagaste. Tomá una foto o subí una imagen o PDF del comprobante, aunque tu taller no use Kilora."}
					</p>
					<div className="mt-9 flex flex-wrap items-center gap-3">
						<Link
							to="/registro"
							search={{ redirect: workshop ? "/onboarding" : undefined }}
							className={buttonVariants({ size: "lg" })}
						>
							{workshop
								? "Organizar mi taller"
								: "Guardar el historial de mi carro"}
							<ArrowRight />
						</Link>
						<a
							href="#como-funciona"
							className={buttonVariants({ size: "lg", variant: "outline" })}
						>
							Ver cómo funciona
							<ArrowDownRight />
						</a>
					</div>
					<p className="mt-5 font-mono text-xs text-ink-3">
						{workshop
							? "Para talleres independientes · Sin instalar un programa"
							: "Desde tu teléfono · Sin instalar una app"}
					</p>
				</div>
				<div className="enter [animation-delay:120ms]" data-nosnippet>
					{workshop ? <WorkshopOrderPreview /> : <HistoryCard />}
				</div>
			</div>
			<SpecStrip audience={audience} />
		</section>
	);
}

function WorkshopOrderPreview() {
	return (
		<figure
			className="rounded-lg border bg-card shadow-xl"
			aria-label="Ejemplo de una orden de trabajo"
		>
			<div className="flex items-center justify-between gap-4 border-b p-5">
				<div>
					<p className="font-mono text-[11px] uppercase tracking-widest text-ink-3">
						Orden de trabajo · Ejemplo
					</p>
					<h2 className="mt-2 font-display text-xl font-bold">
						Toyota Corolla
					</h2>
				</div>
				<span className="rounded-full bg-seal-soft px-3 py-1 text-xs font-medium text-seal">
					En reparación
				</span>
			</div>
			<div className="space-y-6 p-5">
				<ol
					className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"
					aria-label="Estados de la orden"
				>
					{["Recibido", "Diagnóstico", "En reparación", "Listo"].map(
						(status) => (
							<li
								key={status}
								className={`rounded-md border px-2 py-3 text-center ${status === "En reparación" ? "border-seal bg-seal-soft font-medium text-seal" : "text-ink-3"}`}
							>
								{status}
							</li>
						),
					)}
				</ol>
				<div>
					<p className="text-xs text-ink-3">Motivo de la visita</p>
					<p className="mt-1 font-medium">
						Servicio de aceite y revisión de frenos
					</p>
				</div>
				<ul className="divide-y rounded-md border px-4">
					{[
						"Cambio de aceite y filtro",
						"Revisión de pastillas delanteras",
						"Registro de repuestos y kilometraje",
					].map((job) => (
						<li key={job} className="flex items-start gap-3 py-4 text-sm">
							<Check className="size-4 shrink-0 text-seal" aria-hidden />
							{job}
						</li>
					))}
				</ul>
				<div className="rounded-md bg-muted p-4">
					<p className="text-sm font-medium">
						Costos internos y notas del equipo
					</p>
					<p className="mt-1 text-sm text-ink-3">
						Privados para tu taller. El propietario recibe el detalle público
						del servicio.
					</p>
				</div>
			</div>
			<figcaption className="border-t px-5 py-4 text-xs text-ink-3">
				Al marcar la orden como lista, el servicio se publica en el historial
				del vehículo.
			</figcaption>
		</figure>
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

function SpecStrip({ audience = "owner" }: AudienceProps) {
	const specs =
		audience === "workshop"
			? [
					{ value: "Órdenes", label: "de recepción a entrega" },
					{ value: "Cotizaciones", label: "compartibles por WhatsApp" },
					{ value: "Tu equipo", label: "acceso por rol y sucursal" },
					{ value: "Privacidad", label: "costos y notas para tu taller" },
				]
			: SPECS;
	return (
		<div className="relative border-t bg-background/60">
			<dl className="frame grid grid-cols-2 md:grid-cols-4">
				{specs.map((s, i) => (
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

export function Problem({ audience = "owner" }: AudienceProps) {
	const workshop = audience === "workshop";
	const items = workshop
		? [
				{
					k: "Trabajo disperso",
					t: "Los datos del cliente están en una libreta y el detalle de la reparación, en otra conversación.",
				},
				{
					k: "Presupuestos sin contexto",
					t: "Cuesta encontrar qué se cotizó, qué aceptó el cliente y cuánto se cobró al final.",
				},
				{
					k: "Entregas sin historial",
					t: "El servicio termina, pero recuperar los trabajos y repuestos para la próxima visita lleva tiempo.",
				},
			]
		: [
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
					title={
						workshop
							? "Cada orden debería tener su información a mano."
							: "Cuando cambiás de taller, el historial se queda atrás."
					}
				>
					{workshop
						? "Reuní clientes, vehículos, trabajos y cotizaciones para que recepción y tu equipo consulten el mismo registro, con los permisos que les corresponden."
						: "Entre recibos, mensajes y lo que recordás, es difícil saber todo lo que se le ha hecho a tu carro. Kilora reúne esos servicios para que los tengás a mano cuando los necesités."}
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

export function HowItWorks({ audience = "owner" }: AudienceProps) {
	const workshop = audience === "workshop";
	const steps = workshop
		? [
				{
					icon: ClipboardList,
					title: "Recibí al cliente y su vehículo",
					body: "Registrá el motivo de la visita y el kilometraje. Podés empezar aunque el propietario todavía no tenga cuenta.",
					meta: "Una ficha para cada visita",
				},
				{
					icon: MessageCircle,
					title: "Cotizá y organizá el trabajo",
					body: "Prepará el presupuesto, compartí su enlace por WhatsApp y registrá trabajos y repuestos mientras avanza la orden.",
					meta: "De diagnóstico a reparación",
				},
				{
					icon: History,
					title: "Entregá con un historial claro",
					body: "Marcá la orden como lista e invitá al propietario a consultar su historial. Tus costos internos y notas privadas quedan en el taller.",
					meta: "El servicio queda registrado",
				},
			]
		: [
				{
					icon: Plus,
					title: "Registrá tu carro",
					body: "Creá tu cuenta y agregá la marca y el modelo de tu carro. Podés empezar por tu cuenta, sin una invitación del taller.",
					meta: "Desde tu teléfono",
				},
				{
					icon: ScanLine,
					title: "Agregá lo que le hicieron",
					body: "Tomá una foto o subí una imagen o PDF del comprobante. Revisá los datos y guardá el servicio con su archivo. También podés ingresarlo sin recibo.",
					meta: "De cualquier taller",
				},
				{
					icon: History,
					title: "Consultá y compartí tu historial",
					body: "Encontrá fechas, kilometraje, repuestos y gastos. Conservá los servicios aunque cambies de taller y compartí un reporte cuando vendás el carro.",
					meta: "Siempre con vos",
				},
			];
	return (
		<section
			id="como-funciona"
			aria-labelledby="como-title"
			className="scroll-mt-28 border-b"
		>
			<div className="frame px-5 py-20 md:px-8 md:py-28">
				<SectionHead
					index="02"
					label="Cómo funciona"
					id="como-title"
					title={
						workshop
							? "De la recepción al historial, en tres pasos."
							: "El historial de tu carro empieza con vos."
					}
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
	{ field: "Comprobantes del propietario", owner: true, shop: false },
	{ field: "Notas del servicio", owner: true, shop: false },
	{ field: "Costos internos y notas privadas", owner: false, shop: false },
];

export function TwoLayers({ audience = "owner" }: AudienceProps) {
	return (
		<section
			id="dos-capas"
			aria-labelledby="capas-title"
			className="dark-band scroll-mt-28 border-b bg-foreground text-background"
		>
			<div className="frame px-5 py-20 md:px-8 md:py-28">
				<SectionHead
					index="03"
					label="Tu información, cuidada"
					id="capas-title"
					title="Compartí el mantenimiento con tranquilidad."
					invert
				>
					{audience === "workshop"
						? "Compartí con el propietario los trabajos realizados y lo cobrado. Tus costos internos y notas del mecánico quedan privados. Otro taller vinculado solo recibe el contexto de mantenimiento, sin tus precios ni la identidad de tu taller."
						: "Consultá tus servicios y lo que pagaste. Otro taller vinculado puede conocer los trabajos anteriores sin ver tus pagos ni notas. Los comprobantes que agregás vos son privados y no se incluyen en el reporte para venta."}
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

const OWNER_FEATURES = [
	{
		icon: History,
		label: "Tu historial",
		title: "Servicios de cualquier taller",
		body: "Guardá lo que le hicieron a tu carro con fechas, kilometraje, trabajos y repuestos. Conservá el registro aunque cambies de mecánico.",
	},
	{
		icon: ScanLine,
		label: "Comprobantes",
		title: "Una foto o un PDF para empezar",
		body: "Tomá una foto o subí un comprobante JPG, PNG, WebP o PDF de hasta 4 MB. Revisá los datos extraídos antes de guardar el servicio.",
	},
	{
		icon: ShieldCheck,
		label: "Documentos privados",
		title: "El comprobante queda con el servicio",
		body: "Conservá el archivo original y descargalo cuando lo necesités. Solo vos podés acceder; no se comparte con talleres ni en el reporte para venta.",
	},
	{
		icon: MessageCircle,
		label: "Explicaciones",
		title: "Entendé qué le hicieron",
		body: "Consultá una explicación en palabras claras de los trabajos registrados. La IA usa los datos de tu servicio; no hace un diagnóstico del vehículo.",
	},
	{
		icon: Package,
		label: "Repuestos y gastos",
		title: "Encontrá el detalle de cada visita",
		body: "Revisá qué piezas usaron, sus marcas y cuánto pagaste cuando esos datos estén registrados. Tené ese contexto a mano antes del próximo servicio.",
	},
	{
		icon: FileText,
		label: "Al vender tu carro",
		title: "Compartí cómo lo cuidaste",
		body: "Creá un reporte con servicios, talleres y kilometraje. Su enlace dura 30 días y no muestra montos, notas ni tus comprobantes privados.",
	},
];

const WORKSHOP_FEATURES = [
	{
		icon: ClipboardList,
		label: "Cotizaciones",
		title: "Cotizá sin empezar de cero",
		body: "Describí el trabajo y revisá el borrador con IA. Ajustá los repuestos y precios, compartí la cotización por WhatsApp y registrá el resultado.",
	},
	{
		icon: Wrench,
		label: "Órdenes de trabajo",
		title: "Seguí cada reparación",
		body: "Llevá las órdenes desde recibido y diagnóstico hasta reparación y entrega. Registrá trabajos, repuestos y kilometraje en el mismo lugar.",
	},
	{
		icon: FileText,
		label: "Clientes y vehículos",
		title: "Recibí al cliente sin esperar su registro",
		body: "Creá la ficha del cliente y del vehículo, y empezá a trabajar. El propietario puede aceptar después una invitación para consultar su historial.",
	},
	{
		icon: Package,
		label: "Tu equipo",
		title: "Acceso por rol y sucursal",
		body: "Organizá sucursales y asigná miembros de administración, recepción o mecánica. Cada persona consulta lo que le corresponde.",
	},
	{
		icon: History,
		label: "Historial del vehículo",
		title: "Recuperá el contexto del mantenimiento",
		body: "Consultá trabajos, piezas, fechas y kilometraje del historial al que tenés acceso. Revisá las sugerencias antes de recomendar un próximo servicio.",
	},
	{
		icon: ShieldCheck,
		label: "Información privada",
		title: "Tus costos y notas quedan en tu taller",
		body: "Compartí con el cliente los datos públicos del servicio. Los costos internos y las notas del mecánico no salen de tu equipo.",
	},
];

export function Features({ audience = "owner" }: AudienceProps) {
	const workshop = audience === "workshop";
	const features = workshop ? WORKSHOP_FEATURES : OWNER_FEATURES;
	return (
		<section
			id="funciones"
			aria-labelledby="funciones-title"
			className="scroll-mt-28 border-b bg-surface"
		>
			<div className="frame px-5 py-20 md:px-8 md:py-28">
				<SectionHead
					index="04"
					label="Más que un registro"
					id="funciones-title"
					title={
						workshop
							? "Todo el trabajo del taller, con su contexto."
							: "Guardá el servicio. Entendé el mantenimiento."
					}
				>
					{workshop
						? "Herramientas para recibir vehículos, preparar presupuestos y dejar constancia de cada servicio en tu taller de El Salvador."
						: "Tu historial de mantenimiento en El Salvador, desde el primer comprobante hasta el reporte que compartís al vender tu carro."}
				</SectionHead>
				<ul className="mt-14 grid gap-px overflow-hidden rounded-lg border bg-line md:grid-cols-2 lg:grid-cols-3">
					{features.map((feature) => (
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
				<div className="mt-6 flex flex-col gap-4 rounded-lg border bg-seal-soft p-6 dark:bg-accent sm:flex-row sm:items-start md:p-8">
					<Sparkles
						className="size-5 shrink-0 text-seal dark:text-primary"
						aria-hidden="true"
					/>
					<div>
						<h3 className="font-display text-xl font-bold">
							{workshop
								? "¿Qué órdenes tengo pendientes? ¿Dónde está la cotización?"
								: "¿Cuánto gasté? ¿Qué le hicieron a mi carro?"}
						</h3>
						<p className="mt-2 max-w-3xl leading-relaxed text-ink-2">
							{workshop
								? "Consultá al asistente sobre las órdenes, clientes, vehículos y cotizaciones a los que tu cuenta tiene acceso. También puede orientarte sobre cómo usar Kilora."
								: "Preguntale al asistente sobre los servicios y vehículos de tu cuenta. Encontrá respuestas usando los datos que ya guardaste en tu historial."}
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}

export function OtherAudience({ audience = "owner" }: AudienceProps) {
	const workshop = audience === "workshop";
	return (
		<section
			aria-labelledby="otra-experiencia-title"
			className="border-b bg-surface"
		>
			<div className="frame flex flex-col gap-5 px-5 py-10 sm:flex-row sm:items-center sm:justify-between md:px-8">
				<div>
					<h2
						id="otra-experiencia-title"
						className="font-display text-xl font-bold"
					>
						{workshop
							? "¿Buscás guardar el historial de tu propio carro?"
							: "¿Tenés un taller automotriz?"}
					</h2>
					<p className="mt-2 max-w-xl text-sm text-ink-3">
						{workshop
							? "Podés empezar como propietario aunque tu mecánico no use Kilora."
							: "Conocé las herramientas para organizar clientes, órdenes y cotizaciones de tu taller."}
					</p>
				</div>
				<Link
					to={workshop ? "/" : "/talleres"}
					className={`${buttonVariants({ variant: "outline" })} shrink-0`}
				>
					{workshop ? "Kilora para propietarios" : "Kilora para talleres"}
					<ArrowRight />
				</Link>
			</div>
		</section>
	);
}

export function FaqSection({ audience = "owner" }: AudienceProps) {
	const faqs = LANDING_PAGES[audience].faqs;
	return (
		<section
			id="preguntas"
			aria-labelledby="faq-title"
			className="scroll-mt-28 border-b"
		>
			<div className="frame px-5 py-20 md:px-8 md:py-28">
				<SectionHead
					index="05"
					label="Preguntas frecuentes"
					id="faq-title"
					title={
						audience === "workshop"
							? "Preguntas sobre Kilora para talleres."
							: "Preguntas sobre el historial de tu carro."
					}
				/>
				<div className="mt-14 border-t lg:ml-[15rem]">
					{faqs.map((f) => (
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

export function FinalCta({ audience = "owner" }: AudienceProps) {
	const workshop = audience === "workshop";
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
					{workshop ? "Organizá tu taller." : "Cuidás tu carro."}{" "}
					<span className="text-seal">
						{workshop
							? "Dale continuidad a cada servicio."
							: "Conservá su historia."}
					</span>
				</h2>
				<div className="mt-10 flex flex-wrap justify-center gap-3">
					<Link
						to="/registro"
						search={{ redirect: workshop ? "/onboarding" : undefined }}
						className={buttonVariants({ size: "lg" })}
					>
						{workshop
							? "Empezar con mi taller"
							: "Guardar el historial de mi carro"}
						<ArrowRight />
					</Link>
				</div>
			</div>
		</section>
	);
}

export function LandingFooter({ audience = "owner" }: AudienceProps) {
	return (
		<footer>
			<div className="frame flex flex-col gap-6 px-5 py-10 md:flex-row md:flex-wrap md:items-center md:justify-between md:px-8">
				<div className="flex items-center gap-2.5 font-display text-sm font-bold tracking-[0.22em]">
					<Logo />
					KILORA
				</div>
				<p className="font-mono text-xs text-ink-3">
					{audience === "workshop"
						? "El trabajo de tu taller, en orden"
						: "El cuidado de tu carro, a mano"}{" "}
					· Hecho en El Salvador · {new Date().getFullYear()}
				</p>
				<nav aria-label="Pie de página">
					<ul className="flex flex-wrap gap-5 text-sm text-ink-3">
						<li>
							<Link to="/" className="hover:text-foreground">
								Propietarios
							</Link>
						</li>
						<li>
							<Link to="/talleres" className="hover:text-foreground">
								Talleres
							</Link>
						</li>
						<li>
							<Link
								to="/login"
								search={{
									redirect: audience === "workshop" ? "/onboarding" : undefined,
								}}
								className="hover:text-foreground"
							>
								Ingresar
							</Link>
						</li>
						<li>
							<Link
								to="/registro"
								search={{
									redirect: audience === "workshop" ? "/onboarding" : undefined,
								}}
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
