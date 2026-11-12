import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import {
	ArrowUp,
	BookOpen,
	Check,
	Copy,
	Loader2,
	RotateCcw,
	Sparkles,
	Square,
	X,
} from "lucide-react";
import {
	Fragment,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	type ServiceQuestion,
	useAssistantRequest,
} from "@/components/kilora/assistant-context";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@/components/ui/sheet";
import { api, errorMessage, unwrap } from "@/lib/api";
import { type AssistantSource, streamAssistant } from "@/lib/assistant";
import { cn } from "@/lib/utils";

type ChatMessage = {
	role: "user" | "assistant";
	service?: ServiceQuestion;
	content: string;
	/** Consultas que hizo el asistente para responder, en orden. */
	steps?: string[];
	sources?: AssistantSource[];
	streaming?: boolean;
	error?: boolean;
};

const MAX_HISTORY = 20;
const MAX_LENGTH = 4000;

const suggestions: Record<
	"taller" | "propietario",
	{ title: string; prompt: string }[]
> = {
	taller: [
		{
			title: "Órdenes abiertas",
			prompt: "¿Cuántas órdenes abiertas tenemos y en qué estado están?",
		},
		{
			title: "Recomendaciones",
			prompt: "¿Qué recomendaciones están pendientes?",
		},
		{
			title: "Privacidad",
			prompt: "¿Qué ve otro taller de los servicios que hacemos?",
		},
		{
			title: "Cotizaciones",
			prompt: "¿Cómo comparto una cotización por WhatsApp?",
		},
	],
	propietario: [
		{
			title: "Último aceite",
			prompt: "¿Cuándo fue mi último cambio de aceite?",
		},
		{
			title: "Gastos",
			prompt: "¿Cuánto he gastado en mantenimiento este año?",
		},
		{
			title: "Servicio manual",
			prompt: "¿Cómo agrego un servicio que hice fuera de Kilora?",
		},
		{
			title: "Privacidad",
			prompt: "¿Los talleres ven lo que pagué?",
		},
	],
};

/** Negritas (**texto**) sin interpretar HTML. */
function inline(text: string): ReactNode[] {
	return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
		part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: texto estático.
			<strong key={i} className="font-semibold text-foreground">
				{part.slice(2, -2)}
			</strong>
		) : (
			// biome-ignore lint/suspicious/noArrayIndexKey: texto estático.
			<Fragment key={i}>{part}</Fragment>
		),
	);
}

/** Párrafos y listas con "- " o "1. ", lo que el asistente tiene permitido usar. */
function RichText({ text }: { text: string }) {
	const blocks: ReactNode[] = [];
	let list: { ordered: boolean; items: string[] } | null = null;
	const flush = () => {
		if (!list) return;
		const Tag = list.ordered ? "ol" : "ul";
		blocks.push(
			<Tag
				key={blocks.length}
				className={cn(
					"space-y-1 pl-5 marker:text-ink-3",
					list.ordered ? "list-decimal" : "list-disc",
				)}
			>
				{list.items.map((item, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: texto estático.
					<li key={i} className="pl-0.5">
						{inline(item)}
					</li>
				))}
			</Tag>,
		);
		list = null;
	};
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		const bullet = /^[-*•]\s+(.*)$/.exec(line);
		const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
		const item = bullet ?? numbered;
		if (item) {
			const ordered = !bullet;
			if (list && list.ordered !== ordered) flush();
			list ??= { ordered, items: [] };
			list.items.push(item[1] ?? "");
			continue;
		}
		flush();
		if (line)
			blocks.push(
				<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ""))}</p>,
			);
	}
	flush();
	return <div className="space-y-2.5">{blocks}</div>;
}

function AssistantAvatar({ className }: { className?: string }) {
	return (
		<span
			aria-hidden
			className={cn(
				"grid size-7 shrink-0 place-items-center rounded-full bg-seal text-white",
				className,
			)}
		>
			<Sparkles className="size-3.5" />
		</span>
	);
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			className="text-ink-3"
			aria-label={copied ? "Copiado" : "Copiar respuesta"}
			onClick={() => {
				void navigator.clipboard?.writeText(text).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				});
			}}
		>
			{copied ? <Check /> : <Copy />}
		</Button>
	);
}

function AssistantMessage({
	message,
	onRetry,
}: {
	message: ChatMessage;
	onRetry?: () => void;
}) {
	const steps = message.steps ?? [];
	const waiting = message.streaming && !message.content;
	return (
		<div className="flex gap-3">
			<AssistantAvatar className="mt-0.5" />
			<div className="min-w-0 flex-1 space-y-2">
				{steps.length > 0 && (
					<ul className="space-y-1 text-xs text-ink-3">
						{steps.map((step, i) => {
							const active = waiting && i === steps.length - 1;
							return (
								// biome-ignore lint/suspicious/noArrayIndexKey: los pasos solo crecen.
								<li key={i} className="flex items-center gap-1.5">
									{active ? (
										<Loader2 className="size-3 animate-spin" aria-hidden />
									) : (
										<Check className="size-3 text-ok" aria-hidden />
									)}
									{step}
									{active && "…"}
								</li>
							);
						})}
					</ul>
				)}
				{waiting && steps.length === 0 && (
					<output className="flex h-6 items-center gap-1" aria-label="Pensando">
						{[0, 150, 300].map((delay) => (
							<span
								key={delay}
								className="size-1.5 animate-bounce rounded-full bg-ink-3/60"
								style={{ animationDelay: `${delay}ms` }}
							/>
						))}
					</output>
				)}
				{message.error ? (
					<div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
						<p>{message.content}</p>
						{onRetry && (
							<Button
								type="button"
								variant="link"
								size="sm"
								className="h-auto p-0 text-destructive"
								onClick={onRetry}
							>
								Reintentar
							</Button>
						)}
					</div>
				) : (
					message.content && (
						<div className="leading-relaxed text-ink-2">
							<RichText text={message.content} />
							{message.streaming && (
								<span
									aria-hidden
									className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-seal/70"
								/>
							)}
						</div>
					)
				)}
				{!message.streaming && !message.error && message.content && (
					<div className="flex flex-wrap items-center gap-1.5">
						{message.sources?.map((s) => (
							<span
								key={s.title}
								title={s.title}
								className="inline-flex max-w-full items-center gap-1 truncate rounded-full border bg-card px-2 py-0.5 text-[11px] text-ink-3"
							>
								<BookOpen className="size-3 shrink-0" aria-hidden />
								<span className="truncate">{s.title.split(" — ").pop()}</span>
							</span>
						))}
						<CopyButton text={message.content} />
					</div>
				)}
			</div>
		</div>
	);
}

const storageKey = (mode: string) => `kilora-assistant-${mode}`;

function loadMessages(mode: string): ChatMessage[] {
	try {
		const raw = sessionStorage.getItem(storageKey(mode));
		const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
		return Array.isArray(parsed)
			? parsed.filter((m) => !m.streaming && !m.error)
			: [];
	} catch {
		return [];
	}
}

export function AssistantChat({
	mode,
	userName,
	workshopId,
}: {
	mode: "taller" | "propietario";
	userName: string;
	workshopId?: string;
}) {
	const assistant = useAssistantRequest();
	const queryClient = useQueryClient();
	const handledRequest = useRef<ServiceQuestion | null>(null);
	const [open, setOpen] = useState(false);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState("");
	const page = useRouterState({ select: (s) => s.location.pathname });
	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const abortRef = useRef<AbortController | null>(null);
	const stickRef = useRef(true);
	const busy = messages.some((m) => m.streaming);
	const firstName = userName.trim().split(/\s+/)[0] ?? "";

	// La conversación sobrevive a recargas dentro de la pestaña.
	useEffect(() => setMessages(loadMessages(mode)), [mode]);
	useEffect(() => {
		if (busy) return;
		try {
			sessionStorage.setItem(storageKey(mode), JSON.stringify(messages));
		} catch {}
	}, [messages, busy, mode]);

	useEffect(() => () => abortRef.current?.abort(), []);

	// Sigue el final mientras llega texto, salvo que el usuario haya subido.
	// biome-ignore lint/correctness/useExhaustiveDependencies: desplazar al cambiar los mensajes.
	useEffect(() => {
		const el = scrollRef.current;
		if (el && stickRef.current) el.scrollTop = el.scrollHeight;
	}, [messages, open]);

	// Altura del campo según el texto.
	// biome-ignore lint/correctness/useExhaustiveDependencies: recalcular con cada cambio.
	useEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
	}, [draft, open]);

	const fitViewport = useCallback((sheet: HTMLDivElement | null) => {
		const viewport = window.visualViewport;
		if (!viewport || !sheet) return;
		const resize = () => {
			sheet.style.height = `${viewport.height}px`;
			sheet.style.top = `${viewport.offsetTop}px`;
			if (stickRef.current && scrollRef.current) {
				scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
			}
		};
		resize();
		viewport.addEventListener("resize", resize);
		viewport.addEventListener("scroll", resize);
		return () => {
			viewport.removeEventListener("resize", resize);
			viewport.removeEventListener("scroll", resize);
		};
	}, []);

	const updateLast = useCallback(
		(fn: (m: ChatMessage) => ChatMessage) =>
			setMessages((current) => {
				const last = current[current.length - 1];
				if (!last || last.role !== "assistant") return current;
				return [...current.slice(0, -1), fn(last)];
			}),
		[],
	);

	const run = useCallback(
		async (history: ChatMessage[]) => {
			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;
			stickRef.current = true;
			setMessages([
				...history,
				{ role: "assistant", content: "", steps: [], streaming: true },
			]);
			const update = (fn: (m: ChatMessage) => ChatMessage) => {
				if (abortRef.current === controller) updateLast(fn);
			};
			try {
				const service = history.at(-1)?.service;
				if (service) {
					update((m) => ({ ...m, steps: ["Leyendo el servicio"] }));
					const result = await queryClient.fetchQuery({
						queryKey: [
							"owner",
							"explain",
							service.vehicleID,
							service.recordID,
							service.corrections,
						],
						queryFn: async () =>
							unwrap(
								await api.POST(
									"/api/v1/me/vehicles/{vehicleID}/history/{recordID}/ai/explain",
									{
										params: {
											path: {
												vehicleID: service.vehicleID,
												recordID: service.recordID,
											},
										},
									},
								),
							),
						staleTime: Number.POSITIVE_INFINITY,
						retry: false,
					});
					update((m) => ({
						...m,
						content: result.explanation,
						streaming: false,
					}));
					return;
				}
				await streamAssistant(
					{
						messages: history
							.filter((m) => !m.error && m.content)
							.slice(-MAX_HISTORY)
							.map(({ role, content, service }) => ({
								role,
								content: service
									? `${content}\nContexto del servicio: vehicle_id=${service.vehicleID}, record_id=${service.recordID}.`
									: content,
							})),
						workshop_id: workshopId || undefined,
						page,
					},
					(event) => {
						if (event.type === "status" && event.text) {
							const step = event.text;
							update((m) => ({ ...m, steps: [...(m.steps ?? []), step] }));
						} else if (event.type === "delta" && event.text) {
							const delta = event.text;
							update((m) => ({ ...m, content: m.content + delta }));
						} else if (event.type === "sources") {
							update((m) => ({ ...m, sources: event.sources }));
						}
					},
					controller.signal,
				);
				update((m) => ({ ...m, streaming: false }));
			} catch (error) {
				if (controller.signal.aborted) {
					update((m) =>
						m.content
							? { ...m, streaming: false }
							: { ...m, streaming: false, content: "Respuesta detenida." },
					);
				} else {
					update((m) => ({
						...m,
						streaming: false,
						error: true,
						content: errorMessage(error),
					}));
				}
			} finally {
				if (abortRef.current === controller) abortRef.current = null;
			}
		},
		[page, queryClient, updateLast, workshopId],
	);

	useEffect(() => {
		const request = assistant?.request;
		if (!request || handledRequest.current === request) return;
		handledRequest.current = request;
		setOpen(true);
		setDraft("");
		const history = messages.filter((m) => !m.streaming && !m.error);
		void run([
			...history,
			{
				role: "user",
				content: `¿Qué me hicieron en el servicio «${request.summary}» del ${request.performedOn}? Explícamelo en palabras simples.`,
				service: request,
			},
		]);
	}, [assistant?.request, messages, run]);

	const send = (text: string) => {
		const content = text.trim().slice(0, MAX_LENGTH);
		if (!content || abortRef.current) return;
		setDraft("");
		void run([...messages, { role: "user", content }]);
	};

	const retry = () => {
		const history = messages.slice(0, -1);
		if (history[history.length - 1]?.role === "user") void run(history);
	};

	const stop = () => {
		abortRef.current?.abort();
		abortRef.current = null;
		updateLast((m) => ({
			...m,
			streaming: false,
			content: m.content || "Respuesta detenida.",
		}));
	};

	const reset = () => {
		abortRef.current?.abort();
		abortRef.current = null;
		setMessages([]);
		inputRef.current?.focus();
	};

	return (
		<>
			{!open && (
				<Button
					type="button"
					onClick={() => setOpen(true)}
					className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-40 h-12 touch-manipulation select-none gap-2 rounded-full bg-seal px-4 text-white shadow-lg shadow-seal/25 transition-transform hover:scale-[1.03] hover:bg-seal/90 print:hidden sm:right-6 sm:bottom-6 sm:px-5"
					aria-label="Abrir asistente"
				>
					<Sparkles className="size-4" aria-hidden />
					<span className="hidden font-medium sm:inline">
						Pregúntale a Kilora
					</span>
				</Button>
			)}
			<Sheet open={open} onOpenChange={setOpen}>
				<SheetContent
					ref={fitViewport}
					side="right"
					showCloseButton={false}
					onOpenAutoFocus={(e) => {
						e.preventDefault();
						if (
							window.matchMedia("(hover: hover) and (pointer: fine)").matches
						) {
							inputRef.current?.focus();
						}
					}}
					className="flex h-dvh w-full flex-col gap-0 overflow-hidden border-l-0 p-0 sm:max-w-lg sm:border-l"
				>
					<header className="flex shrink-0 items-center gap-2 border-b bg-card px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:gap-3">
						<AssistantAvatar className="size-9" />
						<div className="min-w-0 flex-1">
							<SheetTitle className="text-base">Asistente Kilora</SheetTitle>
							<SheetDescription className="text-xs">
								Tu historial y tus dudas, en un solo lugar
							</SheetDescription>
						</div>
						{messages.length > 0 && (
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="size-11 shrink-0 touch-manipulation"
								aria-label="Nueva conversación"
								title="Nueva conversación"
								onClick={reset}
							>
								<RotateCcw className="size-4" />
							</Button>
						)}
						<SheetClose asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="size-11 shrink-0 touch-manipulation"
								aria-label="Cerrar"
							>
								<X className="size-4" />
							</Button>
						</SheetClose>
					</header>

					<div
						ref={scrollRef}
						onScroll={(e) => {
							const el = e.currentTarget;
							stickRef.current =
								el.scrollHeight - el.scrollTop - el.clientHeight < 48;
						}}
						className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 text-[15px] [overflow-wrap:anywhere] sm:text-sm"
					>
						{messages.length === 0 ? (
							<div className="flex min-h-full flex-col justify-center gap-5 pb-2">
								<div className="space-y-2 text-center">
									<AssistantAvatar className="mx-auto size-12 [&_svg]:size-5" />
									<h2 className="font-display text-xl font-semibold">
										{firstName ? `Hola, ${firstName}` : "Hola"}
									</h2>
									<p className="mx-auto max-w-xs text-ink-3">
										{mode === "taller"
											? "Pregúntame por órdenes, vehículos, cotizaciones o cómo usar Kilora."
											: "Pregúntame por el historial de tus vehículos o cómo usar Kilora."}
									</p>
								</div>
								<div className="grid grid-cols-2 gap-2">
									{suggestions[mode].map((s) => (
										<button
											key={s.prompt}
											type="button"
											onClick={() => send(s.prompt)}
											className="group touch-manipulation rounded-xl border bg-card p-3 text-left transition-colors hover:border-seal/40 hover:bg-seal-soft/40 focus-visible:outline-2 focus-visible:outline-ring"
										>
											<span className="block text-xs font-medium text-seal">
												{s.title}
											</span>
											<span className="mt-0.5 block text-ink-2">
												{s.prompt}
											</span>
										</button>
									))}
								</div>
							</div>
						) : (
							<div className="space-y-6" aria-live="polite">
								{messages.map((m, i) =>
									m.role === "user" ? (
										<div
											// biome-ignore lint/suspicious/noArrayIndexKey: la conversación solo crece.
											key={i}
											className="flex justify-end"
										>
											<p className="max-w-[85%] rounded-2xl rounded-br-md bg-seal px-3.5 py-2 whitespace-pre-wrap text-white">
												{m.content}
											</p>
										</div>
									) : (
										<AssistantMessage
											// biome-ignore lint/suspicious/noArrayIndexKey: la conversación solo crece.
											key={i}
											message={m}
											onRetry={i === messages.length - 1 ? retry : undefined}
										/>
									),
								)}
							</div>
						)}
					</div>

					<form
						className="shrink-0 border-t bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
						onSubmit={(e) => {
							e.preventDefault();
							send(draft);
						}}
					>
						<div className="flex items-end gap-2 rounded-2xl border bg-card p-1.5 pl-3.5 shadow-xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
							<textarea
								ref={inputRef}
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								onKeyDown={(e) => {
									if (
										e.key === "Enter" &&
										!e.shiftKey &&
										!e.nativeEvent.isComposing
									) {
										e.preventDefault();
										send(draft);
									}
								}}
								enterKeyHint="send"
								maxLength={MAX_LENGTH}
								rows={1}
								placeholder="Escribe tu pregunta…"
								aria-label="Pregunta para el asistente"
								className="max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-base sm:text-sm outline-none placeholder:text-ink-3"
							/>
							{busy ? (
								<Button
									type="button"
									size="icon-sm"
									variant="secondary"
									className="size-11 shrink-0 touch-manipulation rounded-xl"
									aria-label="Detener respuesta"
									onClick={stop}
								>
									<Square className="size-3 fill-current" />
								</Button>
							) : (
								<Button
									type="submit"
									size="icon-sm"
									className="size-11 shrink-0 touch-manipulation rounded-xl bg-seal text-white hover:bg-seal/90"
									aria-label="Enviar"
									disabled={!draft.trim()}
								>
									<ArrowUp className="size-4" />
								</Button>
							)}
						</div>
						<p className="mt-1.5 text-center text-[11px] text-ink-3">
							Puede equivocarse. Verifica los datos importantes en su ficha.
						</p>
					</form>
				</SheetContent>
			</Sheet>
		</>
	);
}
