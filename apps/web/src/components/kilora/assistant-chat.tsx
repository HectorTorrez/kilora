import type { components } from "@kilora/contracts";
import { useMutation } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { BookOpen, Send, Sparkles, Trash2 } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage, unwrap } from "@/lib/api";
import { cn } from "@/lib/utils";

type Reply = components["schemas"]["AssistantReply"];
type ChatMessage = {
	role: "user" | "assistant";
	content: string;
	sources?: Reply["sources"];
	error?: boolean;
};

const MAX_HISTORY = 20;
const MAX_LENGTH = 4000;

const suggestions = {
	taller: [
		"¿Cuántas órdenes abiertas tenemos?",
		"¿Qué recomendaciones están pendientes?",
		"¿Qué ve otro taller de nuestros servicios?",
		"¿Cómo comparto una cotización por WhatsApp?",
	],
	propietario: [
		"¿Cuándo fue mi último cambio de aceite?",
		"¿Cuánto he gastado en mantenimiento este año?",
		"¿Cómo agrego un servicio que hice fuera de Kilora?",
		"¿Los talleres ven lo que pagué?",
	],
};

/** Negritas (**texto**) sin interpretar HTML. */
function inline(text: string): ReactNode[] {
	return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
		part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: texto estático.
			<strong key={i} className="font-semibold">
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
					"space-y-1 pl-5",
					list.ordered ? "list-decimal" : "list-disc",
				)}
			>
				{list.items.map((item, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: texto estático.
					<li key={i}>{inline(item)}</li>
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
	return <div className="space-y-2">{blocks}</div>;
}

export function AssistantChat({
	mode,
	workshopId,
}: {
	mode: "taller" | "propietario";
	workshopId?: string;
}) {
	const [open, setOpen] = useState(false);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState("");
	const page = useRouterState({ select: (s) => s.location.pathname });
	const endRef = useRef<HTMLDivElement>(null);

	const ask = useMutation({
		mutationFn: async (history: ChatMessage[]) =>
			unwrap(
				await api.POST("/api/v1/assistant/chat", {
					body: {
						messages: history
							.filter((m) => !m.error)
							.slice(-MAX_HISTORY)
							.map(({ role, content }) => ({ role, content })),
						workshop_id: workshopId || undefined,
						page,
					},
				}),
			),
		onSuccess: (reply) =>
			setMessages((current) => [
				...current,
				{ role: "assistant", content: reply.reply, sources: reply.sources },
			]),
		onError: (error) =>
			setMessages((current) => [
				...current,
				{ role: "assistant", content: errorMessage(error), error: true },
			]),
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: desplazar al llegar mensajes.
	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [messages.length, ask.isPending]);

	const send = (text: string) => {
		const content = text.trim().slice(0, MAX_LENGTH);
		if (!content || ask.isPending) return;
		const next: ChatMessage[] = [...messages, { role: "user", content }];
		setMessages(next);
		setDraft("");
		ask.mutate(next);
	};

	return (
		<>
			<Button
				type="button"
				onClick={() => setOpen(true)}
				className="fixed right-4 bottom-4 z-40 h-12 gap-2 rounded-full px-4 shadow-lg print:hidden sm:right-6 sm:bottom-6"
				aria-label="Abrir asistente"
			>
				<Sparkles className="size-4" aria-hidden />
				<span className="hidden sm:inline">Asistente</span>
			</Button>
			<Sheet open={open} onOpenChange={setOpen}>
				<SheetContent
					side="right"
					className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
				>
					<SheetHeader className="border-b pr-12">
						<SheetTitle className="flex items-center gap-2">
							<Sparkles className="size-4 text-seal" aria-hidden />
							Asistente Kilora
						</SheetTitle>
						<SheetDescription>
							Pregunta cómo usar Kilora o consulta tus datos. Solo ve lo que tú
							puedes ver y no modifica nada.
						</SheetDescription>
					</SheetHeader>

					<div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
						{messages.length === 0 && (
							<div className="space-y-2">
								<p className="text-ink-3">Prueba con:</p>
								{suggestions[mode].map((s) => (
									<button
										key={s}
										type="button"
										onClick={() => send(s)}
										className="block w-full rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
									>
										{s}
									</button>
								))}
							</div>
						)}
						{messages.map((m, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: la conversación solo crece.
								key={i}
								className={cn(
									"flex",
									m.role === "user" ? "justify-end" : "justify-start",
								)}
							>
								<div
									className={cn(
										"max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed",
										m.role === "user"
											? "bg-seal text-white"
											: m.error
												? "border border-destructive/40 bg-destructive/5 text-destructive"
												: "bg-muted",
									)}
								>
									{m.role === "user" ? (
										<p className="whitespace-pre-wrap">{m.content}</p>
									) : (
										<RichText text={m.content} />
									)}
									{!!m.sources?.length && (
										<div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
											{m.sources.map((s) => (
												<span
													key={s.title}
													className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px] text-ink-3"
												>
													<BookOpen className="size-3" aria-hidden />
													{s.title}
												</span>
											))}
										</div>
									)}
								</div>
							</div>
						))}
						{ask.isPending && (
							<div className="flex justify-start">
								<output className="rounded-2xl bg-muted px-3.5 py-2.5 text-ink-3">
									Pensando…
								</output>
							</div>
						)}
						<div ref={endRef} />
					</div>

					<form
						className="flex items-end gap-2 border-t p-3"
						onSubmit={(e) => {
							e.preventDefault();
							send(draft);
						}}
					>
						{messages.length > 0 && (
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label="Nueva conversación"
								disabled={ask.isPending}
								onClick={() => setMessages([])}
							>
								<Trash2 className="size-4" />
							</Button>
						)}
						<Textarea
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									send(draft);
								}
							}}
							maxLength={MAX_LENGTH}
							rows={1}
							placeholder="Escribe tu pregunta…"
							aria-label="Pregunta para el asistente"
							className="max-h-32 min-h-10 resize-none"
						/>
						<Button
							type="submit"
							size="icon"
							aria-label="Enviar"
							disabled={!draft.trim() || ask.isPending}
						>
							<Send className="size-4" />
						</Button>
					</form>
				</SheetContent>
			</Sheet>
		</>
	);
}
