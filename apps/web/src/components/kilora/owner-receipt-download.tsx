import type { components } from "@kilora/contracts";
import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, apiError, errorMessage } from "@/lib/api";

export function OwnerReceiptDownload({
	vehicleID,
	recordID,
	receipt,
}: {
	vehicleID: string;
	recordID: string;
	receipt: components["schemas"]["ReceiptMetadata"];
}) {
	const [pending, setPending] = useState(false);
	const download = async () => {
		setPending(true);
		try {
			const result = await api.GET(
				"/api/v1/me/vehicles/{vehicleID}/history/{recordID}/receipt",
				{
					params: { path: { vehicleID, recordID } },
					parseAs: "blob",
				},
			);
			if (!result.response.ok || !result.data)
				throw apiError(undefined, result.response.status);
			const url = URL.createObjectURL(result.data);
			const link = document.createElement("a");
			link.href = url;
			link.download = receipt.filename;
			document.body.append(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			setPending(false);
		}
	};
	return (
		<div className="mt-3 flex min-w-0 items-center gap-2 rounded-md border px-3 py-2">
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm" title={receipt.filename}>
					{receipt.filename}
				</p>
				<p className="text-xs text-ink-3">
					Comprobante privado · {(receipt.size_bytes / 1024).toFixed(0)} KB
				</p>
			</div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={pending}
				onClick={() => void download()}
				aria-label={`Descargar comprobante ${receipt.filename}`}
			>
				<Download className="size-4" aria-hidden />
				{pending ? "Descargando…" : "Descargar"}
			</Button>
		</div>
	);
}
