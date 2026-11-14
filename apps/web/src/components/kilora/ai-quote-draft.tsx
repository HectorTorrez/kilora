import type { components } from "@kilora/contracts";
import { Mic, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage, unwrap } from "@/lib/api";

export type QuoteDraftItem = components["schemas"]["QuoteDraftItem"];

const maxLength = 2000;

/**
 * Panel para describir el trabajo en palabras (escritas o dictadas) y
 * convertirlo en ítems de cotización. No guarda nada: los ítems llegan al
 * formulario para que el recepcionista los revise.
 */
export function AIQuoteDraft({
	workshopID,
	vehicle,
	onItems,
}: {
	workshopID: string;
	vehicle?: string;
	onItems: (items: QuoteDraftItem[]) => void;
}) {
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const dictation = useDictation((heard) =>
		setText((current) =>
			`${current.trimEnd()} ${heard}`.trimStart().slice(0, maxLength),
		),
	);

	if (!open)
		return (
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => setOpen(true)}
			>
				<Sparkles className="size-4" aria-hidden />
				Describir con IA
			</Button>
		);

	const generate = async () => {
		dictation.stop();
		setPending(true);
		setError("");
		try {
			const draft = unwrap(
				await api.POST("/api/v1/workshops/{workshopID}/ai/quote-draft", {
					params: { path: { workshopID } },
					body: { text, vehicle: vehicle || undefined },
				}),
			);
			if (draft.items.length === 0) {
				setError(
					"No encontré trabajos ni repuestos en la descripción. Probá con más detalle.",
				);
				return;
			}
			onItems(draft.items);
			setText("");
			setOpen(false);
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="w-full space-y-2 rounded-md border border-dashed bg-muted/30 p-3">
			<div className="flex items-center justify-between gap-2">
				<p className="flex items-center gap-1.5 text-sm font-medium">
					<Sparkles className="size-4 text-primary" aria-hidden />
					Describí el trabajo y la IA arma los ítems
				</p>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-8"
					aria-label="Cerrar"
					onClick={() => {
						dictation.stop();
						setOpen(false);
					}}
				>
					<X className="size-4" />
				</Button>
			</div>
			<Textarea
				value={text}
				maxLength={maxLength}
				rows={3}
				autoFocus
				aria-label="Descripción del trabajo"
				placeholder="Ej. Cambio de aceite 5W-30 con filtro, pastillas delanteras y revisar ruido en la suspensión. Mano de obra $35."
				onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim())
						void generate();
				}}
			/>
			<p className="text-xs text-ink-3">
				Los precios solo se llenan si los mencionás. Revisá los ítems antes de
				guardar.
			</p>
			{error ? <p className="text-sm text-destructive">{error}</p> : null}
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					size="sm"
					disabled={!text.trim() || pending}
					onClick={generate}
				>
					{pending ? "Generando…" : "Generar ítems"}
				</Button>
				{dictation.supported ? (
					<Button
						type="button"
						size="sm"
						variant={dictation.listening ? "destructive" : "outline"}
						onClick={dictation.listening ? dictation.stop : dictation.start}
						disabled={pending}
					>
						{dictation.listening ? (
							<>
								<Square className="size-3.5" aria-hidden />
								Detener dictado
							</>
						) : (
							<>
								<Mic className="size-4" aria-hidden />
								Dictar
							</>
						)}
					</Button>
				) : null}
			</div>
		</div>
	);
}

type Recognition = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	onresult: (event: {
		resultIndex: number;
		results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
	}) => void;
	onend: () => void;
	onerror: () => void;
	start: () => void;
	stop: () => void;
};

function recognitionClass(): (new () => Recognition) | undefined {
	if (typeof window === "undefined") return undefined;
	const w = window as unknown as Record<string, new () => Recognition>;
	return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Dictado con el reconocimiento de voz del navegador, si lo tiene. */
function useDictation(onText: (text: string) => void) {
	const [supported, setSupported] = useState(false);
	const [listening, setListening] = useState(false);
	const ref = useRef<Recognition | null>(null);
	const callback = useRef(onText);
	callback.current = onText;
	useEffect(() => {
		setSupported(!!recognitionClass());
		return () => ref.current?.stop();
	}, []);
	const start = () => {
		const Class = recognitionClass();
		if (!Class) return;
		const r = new Class();
		r.lang = "es-SV";
		r.continuous = true;
		r.interimResults = false;
		r.onresult = (event) => {
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const result = event.results[i];
				if (result.isFinal) callback.current(result[0].transcript.trim());
			}
		};
		r.onend = () => setListening(false);
		r.onerror = () => setListening(false);
		ref.current = r;
		r.start();
		setListening(true);
	};
	const stop = () => {
		ref.current?.stop();
		setListening(false);
	};
	return { supported, listening, start, stop };
}
