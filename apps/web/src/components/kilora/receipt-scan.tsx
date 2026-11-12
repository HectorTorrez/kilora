import type { components } from "@kilora/contracts";
import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, errorMessage, unwrap } from "@/lib/api";

export type ReceiptDraft = components["schemas"]["ReceiptDraft"];

const maxSide = 1600;

/**
 * Reduce la foto antes de enviarla: menos datos por la red y, al volver a
 * codificarla, se descartan los metadatos EXIF (ubicación, cámara).
 */
async function shrink(file: File): Promise<string> {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	return canvas.toDataURL("image/jpeg", 0.82);
}

/**
 * Botón para leer un recibo o factura con IA. La foto no se guarda: solo se
 * usa para prellenar el formulario, que el propietario revisa.
 */
export function ReceiptScan({
	vehicleID,
	onDraft,
}: {
	vehicleID: string;
	onDraft: (draft: ReceiptDraft) => void;
}) {
	const input = useRef<HTMLInputElement>(null);
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState("");
	const read = async (file: File) => {
		setPending(true);
		setMessage("");
		try {
			const image = await shrink(file);
			const draft = unwrap(
				await api.POST("/api/v1/me/vehicles/{vehicleID}/ai/receipt", {
					params: { path: { vehicleID } },
					body: { image },
				}),
			);
			if (!draft.readable) {
				setMessage(
					"No pude leer un recibo en esa foto. Probá con más luz y el documento completo.",
				);
				return;
			}
			onDraft(draft);
			setMessage("Revisá los datos que leí del recibo antes de guardar.");
		} catch (error) {
			setMessage(errorMessage(error));
		} finally {
			setPending(false);
		}
	};
	return (
		<div className="grid gap-2 rounded-md border border-dashed bg-muted/30 p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-sm text-ink-2">
					¿Tenés el recibo o la factura? La IA llena el formulario por vos.
				</p>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={pending}
					onClick={() => input.current?.click()}
				>
					<Camera className="size-4" aria-hidden />
					{pending ? "Leyendo recibo…" : "Escanear recibo"}
				</Button>
			</div>
			<input
				ref={input}
				type="file"
				accept="image/*"
				capture="environment"
				className="sr-only"
				tabIndex={-1}
				aria-hidden
				onChange={(e) => {
					const file = e.target.files?.[0];
					e.target.value = "";
					if (file) void read(file);
				}}
			/>
			{message ? (
				<output className="text-xs text-ink-3">{message}</output>
			) : null}
		</div>
	);
}
