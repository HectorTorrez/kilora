import { MessageCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api";

type Shared = { url: string; whatsapp_url: string };

/** Enlace de WhatsApp al mismo número que el del taller, con otro texto. */
function whatsAppWith(base: string, text: string) {
	const url = new URL(base);
	url.search = new URLSearchParams({ text }).toString();
	return url.toString();
}

/**
 * Redacta con IA un mensaje de WhatsApp que explica la cotización. El
 * recepcionista lo edita y, al enviarlo, se comparte el enlace como siempre.
 */
export function AIQuoteMessage({
	generate,
	share,
	onShared,
	disabled,
	disabledReason,
}: {
	generate: () => Promise<{ message: string }>;
	share: () => Promise<Shared>;
	onShared?: (url: string) => void;
	disabled?: boolean;
	disabledReason?: string;
}) {
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	const [pending, setPending] = useState<"generate" | "share" | null>(null);
	const [error, setError] = useState("");

	const draft = async () => {
		setPending("generate");
		setError("");
		try {
			setText((await generate()).message);
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setPending(null);
		}
	};
	const send = async () => {
		setPending("share");
		setError("");
		try {
			const shared = await share();
			onShared?.(shared.url);
			window.open(
				whatsAppWith(shared.whatsapp_url, `${text.trim()}\n\n${shared.url}`),
				"_blank",
				"noopener,noreferrer",
			);
			setOpen(false);
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setPending(null);
		}
	};

	return (
		<>
			<Button
				type="button"
				variant="outline"
				disabled={disabled}
				title={disabled ? disabledReason : undefined}
				onClick={() => {
					setOpen(true);
					setText("");
					void draft();
				}}
			>
				<Sparkles className="size-4" aria-hidden />
				Mensaje con IA
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Mensaje para el cliente</DialogTitle>
						<DialogDescription>
							La IA explica cada ítem en palabras simples. Revisalo y editalo;
							el enlace a la cotización se agrega al final.
						</DialogDescription>
					</DialogHeader>
					<Textarea
						value={text}
						rows={9}
						maxLength={1500}
						aria-label="Mensaje"
						placeholder={pending === "generate" ? "Redactando…" : ""}
						disabled={pending === "generate"}
						onChange={(e) => setText(e.target.value)}
					/>
					{error ? <p className="text-sm text-destructive">{error}</p> : null}
					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							disabled={pending !== null}
							onClick={draft}
						>
							{pending === "generate" ? "Redactando…" : "Redactar de nuevo"}
						</Button>
						<Button
							type="button"
							disabled={!text.trim() || pending !== null}
							onClick={send}
						>
							<MessageCircle className="size-4" aria-hidden />
							{pending === "share" ? "Compartiendo…" : "Enviar por WhatsApp"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
