import type { components } from "@kilora/contracts";
import { Camera, FileText, LoaderCircle, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, errorMessage, unwrap } from "@/lib/api";

export type ReceiptDraft = components["schemas"]["ReceiptDraft"];
export type ReceiptFile = components["schemas"]["ReceiptFileInput"];
const maxBytes = 4 * 1024 * 1024;
const acceptedTypes = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
];

async function readFile(file: File): Promise<ReceiptFile> {
	if (file.size === 0 || file.size > maxBytes) {
		throw new Error("Elegí un archivo de hasta 4 MB que no esté vacío.");
	}
	const extensionTypes: Record<string, string> = {
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		webp: "image/webp",
		pdf: "application/pdf",
	};
	const type =
		file.type ||
		extensionTypes[file.name.split(".").pop()?.toLowerCase() ?? ""];
	if (!acceptedTypes.includes(type)) {
		throw new Error("Usá una imagen JPG, PNG o WebP, o un documento PDF.");
	}
	if (file.name.length > 180)
		throw new Error("Acortá el nombre del archivo a 180 caracteres.");
	const data = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () =>
			typeof reader.result === "string"
				? resolve(reader.result)
				: reject(new Error("No se pudo abrir el archivo."));
		reader.onerror = () => reject(new Error("No se pudo abrir el archivo."));
		reader.readAsDataURL(new Blob([file], { type }));
	});
	return { filename: file.name, data };
}

async function imageForReading(file: File): Promise<string> {
	const bitmap = await createImageBitmap(file);
	try {
		const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("No se pudo preparar la imagen para leerla.");
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL("image/jpeg", 0.82);
	} finally {
		bitmap.close();
	}
}

export function ReceiptScan({
	vehicleID,
	file,
	disabled,
	onFileChange,
	onReadingChange,
	onDraft,
}: {
	vehicleID: string;
	file: ReceiptFile | null;
	disabled: boolean;
	onFileChange: (file: ReceiptFile | null) => void;
	onReadingChange: (pending: boolean) => void;
	onDraft: (draft: ReceiptDraft) => void;
}) {
	const camera = useRef<HTMLInputElement>(null);
	const upload = useRef<HTMLInputElement>(null);
	const request = useRef<AbortController | null>(null);
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState("");
	const [failed, setFailed] = useState(false);
	useEffect(() => () => request.current?.abort(), []);

	const read = async (selected: File) => {
		if (request.current || disabled) return;
		const controller = new AbortController();
		request.current = controller;
		setPending(true);
		onReadingChange(true);
		setMessage("");
		setFailed(false);
		onFileChange(null);
		try {
			const receipt = await readFile(selected);
			if (controller.signal.aborted) return;
			onFileChange(receipt);
			const body = receipt.data.startsWith("data:application/pdf;")
				? { file: receipt }
				: { image: await imageForReading(selected) };
			if (controller.signal.aborted) return;
			const draft = unwrap(
				await api.POST("/api/v1/me/vehicles/{vehicleID}/ai/receipt", {
					params: { path: { vehicleID } },
					body,
					signal: controller.signal,
				}),
			);
			if (controller.signal.aborted) return;
			if (!draft.readable)
				throw new Error(
					"No pude leer un comprobante de servicio. Podés completar los datos y guardar el archivo adjunto.",
				);
			onDraft(draft);
			setMessage("Datos leídos. Revisalos antes de guardar el servicio.");
		} catch (error) {
			if (controller.signal.aborted) return;
			setFailed(true);
			setMessage(
				`${errorMessage(error)} Podés ingresar el servicio manualmente.`,
			);
		} finally {
			request.current = null;
			setPending(false);
			onReadingChange(false);
		}
	};
	const choose = (input: HTMLInputElement) => {
		const selected = input.files?.[0];
		input.value = "";
		if (selected) void read(selected);
	};
	return (
		<section
			className="space-y-3 rounded-lg border bg-muted/30 p-4"
			aria-label="Comprobante del servicio"
			aria-busy={pending}
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p className="text-sm font-medium">Comprobante del servicio</p>
					<p className="mt-1 text-xs text-ink-3">
						Leemos los datos y guardamos el archivo con tu servicio.
					</p>
				</div>
				<div className="flex shrink-0 flex-wrap gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={pending || disabled}
						onClick={() => camera.current?.click()}
					>
						<Camera className="size-4" aria-hidden />
						Tomar foto
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={pending || disabled}
						onClick={() => upload.current?.click()}
					>
						<Upload className="size-4" aria-hidden />
						Subir imagen o PDF
					</Button>
				</div>
			</div>
			<p className="text-xs text-ink-3">
				JPG, PNG, WebP o PDF · Máx. 4 MB · Opcional
			</p>
			<input
				ref={camera}
				type="file"
				accept="image/jpeg,image/png,image/webp"
				capture="environment"
				className="sr-only"
				tabIndex={-1}
				aria-hidden
				onChange={(e) => choose(e.target)}
			/>
			<input
				ref={upload}
				type="file"
				accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
				className="sr-only"
				tabIndex={-1}
				aria-hidden
				onChange={(e) => choose(e.target)}
			/>
			{file && (
				<div className="flex min-w-0 items-center gap-3 rounded-md border bg-background px-3 py-2">
					<FileText className="size-4 shrink-0 text-seal" aria-hidden />
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-medium" title={file.filename}>
							{file.filename}
						</p>
						<p className="text-xs text-ink-3">
							Se adjuntará al guardar el servicio.
						</p>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						disabled={pending || disabled}
						aria-label="Quitar comprobante"
						onClick={() => {
							onFileChange(null);
							setMessage("");
						}}
					>
						<X className="size-4" />
					</Button>
				</div>
			)}
			{pending && (
				<output className="flex items-center gap-2 text-xs text-ink-3">
					<LoaderCircle
						className="size-4 animate-spin motion-reduce:animate-none"
						aria-hidden
					/>
					Leyendo comprobante…
				</output>
			)}
			{message && (
				<p
					role={failed ? "alert" : "status"}
					className={failed ? "text-xs text-destructive" : "text-xs text-seal"}
				>
					{message}
				</p>
			)}
		</section>
	);
}
