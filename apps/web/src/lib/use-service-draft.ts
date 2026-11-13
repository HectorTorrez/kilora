import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { UseFormReturn } from "react-hook-form";
import {
	createServiceDraftStore,
	emptyServiceDraft,
	type SavedServiceDraft,
	ServiceDraftController,
	type ServiceDraftValues,
} from "./service-drafts";

export function useServiceDraft(
	ownerID: string,
	vehicleID: string,
	form: UseFormReturn<ServiceDraftValues>,
) {
	const [controller] = useState(
		() =>
			new ServiceDraftController(createServiceDraftStore(ownerID, vehicleID)),
	);
	const snapshot = useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getServerSnapshot,
	);
	const [receipt, setReceipt] = useState<SavedServiceDraft["receipt"]>(null);
	const receiptRef = useRef(receipt);
	const { subscribe, getValues, reset } = form;
	useEffect(() => {
		void controller.load();
		const unsubscribe = subscribe({
			formState: { values: true },
			callback: ({ values }) => controller.track(values, receiptRef.current),
		});
		const flush = () => {
			void controller.flush();
		};
		window.addEventListener("pagehide", flush);
		return () => {
			unsubscribe();
			window.removeEventListener("pagehide", flush);
			flush();
		};
	}, [controller, subscribe]);
	const changeReceipt = (next: SavedServiceDraft["receipt"]) => {
		receiptRef.current = next;
		setReceipt(next);
		controller.track(getValues(), next);
	};
	const resume = () => {
		const saved = controller.resume();
		if (!saved) return;
		receiptRef.current = saved.receipt;
		setReceipt(saved.receipt);
		reset(saved.values, { keepDefaultValues: true });
	};
	const discard = async () => {
		await controller.discard();
		receiptRef.current = null;
		setReceipt(null);
		reset(emptyServiceDraft());
	};
	return { snapshot, controller, receipt, changeReceipt, resume, discard };
}
