import QRCode from "qrcode";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const documentStyles = {
	quote: {
		page: "mx-auto max-w-[8.5in] px-5 py-6",
		toolbar:
			"print-hidden mb-4 flex flex-wrap items-center justify-between gap-3",
		sheet: "quote-sheet bg-white p-8 text-black shadow-sm",
	},
	mechanic: {
		page: "mx-auto w-full space-y-6 px-4 py-6 sm:px-6 lg:py-8 max-w-4xl print:max-w-none print:p-0",
		toolbar: "flex flex-wrap items-center justify-between gap-3 print:hidden",
		sheet:
			"rounded-lg border bg-white p-6 text-[#111827] shadow-sm sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none",
	},
};

export function PrintDocument({
	appearance,
	back,
	printLabel,
	children,
}: {
	appearance: keyof typeof documentStyles;
	back: ReactNode;
	printLabel: ReactNode;
	children: ReactNode;
}) {
	const styles = documentStyles[appearance];
	return (
		<main className={styles.page}>
			<div className={styles.toolbar}>
				{back}
				<Button type="button" onClick={() => window.print()}>
					{printLabel}
				</Button>
			</div>
			<article className={styles.sheet}>{children}</article>
		</main>
	);
}

export function useDocumentQr(url: string, margin: number, width: number) {
	const [qr, setQr] = useState({ url: "", image: "" });
	useEffect(() => {
		if (!url) return;
		let active = true;
		void QRCode.toDataURL(url, { margin, width }).then((image) => {
			if (active) setQr({ url, image });
		});
		return () => {
			active = false;
		};
	}, [url, margin, width]);
	return qr.url === url ? qr.image : "";
}
