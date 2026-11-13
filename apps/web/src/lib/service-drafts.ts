import type { components } from "@kilora/contracts";
import { z } from "zod";

export const serviceDraftValuesSchema = z.object({
	date: z.string(),
	km: z.string(),
	summary: z.string(),
	total: z.string(),
	where: z.string(),
	items: z.array(
		z.object({ description: z.string(), brand: z.string(), price: z.string() }),
	),
});
export type ServiceDraftValues = z.infer<typeof serviceDraftValuesSchema>;
type ReceiptFile = components["schemas"]["ReceiptFileInput"];
export type SavedServiceDraft = {
	values: ServiceDraftValues;
	receipt: ReceiptFile | null;
	updatedAt: number;
};
export const emptyServiceDraft = (): ServiceDraftValues => ({
	date: "",
	km: "",
	summary: "",
	total: "",
	where: "",
	items: [{ description: "", brand: "", price: "" }],
});
export function hasServiceDraft(
	values: ServiceDraftValues,
	receipt: ReceiptFile | null,
) {
	return (
		!!receipt ||
		[
			values.date,
			values.km,
			values.summary,
			values.total,
			values.where,
			...values.items.flatMap((i) => [i.description, i.brand, i.price]),
		].some((value) => value.trim() !== "")
	);
}

const databaseName = "kilora-service-drafts";
const stores = ["drafts", "receipts"];
let connection: Promise<IDBDatabase> | undefined;
let sessionGeneration = 0;

function openDatabase(): Promise<IDBDatabase> {
	if (connection) return connection;
	connection = new Promise<IDBDatabase>((resolve, reject) => {
		if (!globalThis.indexedDB) {
			reject(new Error("Draft storage unavailable"));
			return;
		}
		const request = globalThis.indexedDB.open(databaseName, 1);
		let blocked = false;
		request.onupgradeneeded = () => {
			for (const name of stores) request.result.createObjectStore(name);
		};
		request.onerror = () =>
			reject(request.error ?? new Error("Draft storage unavailable"));
		request.onblocked = () => {
			blocked = true;
			reject(new Error("Draft storage blocked"));
		};
		request.onsuccess = () => {
			const db = request.result;
			if (blocked) {
				db.close();
				return;
			}
			db.onversionchange = () => {
				db.close();
				connection = undefined;
			};
			resolve(db);
		};
	}).catch((error) => {
		connection = undefined;
		throw error;
	});
	return connection;
}

function transaction(
	db: IDBDatabase,
	mode: IDBTransactionMode,
	run: (tx: IDBTransaction) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const tx = db.transaction(stores, mode);
		tx.oncomplete = () => resolve();
		tx.onabort = () =>
			reject(tx.error ?? new Error("Draft transaction aborted"));
		tx.onerror = () =>
			reject(tx.error ?? new Error("Draft transaction failed"));
		try {
			run(tx);
		} catch (error) {
			tx.abort();
			reject(error);
		}
	});
}

export function createServiceDraftStore(ownerID: string, vehicleID: string) {
	const generation = sessionGeneration;
	const key = JSON.stringify([ownerID, vehicleID]);
	let operations: Promise<unknown> = Promise.resolve();
	const enqueue = <T>(run: () => Promise<T>): Promise<T> => {
		const result = operations.then(run, run);
		operations = result.catch(() => undefined);
		return result;
	};
	return {
		load: () =>
			enqueue(async (): Promise<SavedServiceDraft | null> => {
				const db = await openDatabase();
				if (generation !== sessionGeneration) return null;
				let metadata: unknown, file: unknown;
				await transaction(db, "readonly", (tx) => {
					const draft = tx.objectStore("drafts").get(key);
					const receipt = tx.objectStore("receipts").get(key);
					draft.onsuccess = () => {
						metadata = draft.result;
					};
					receipt.onsuccess = () => {
						file = receipt.result;
					};
				});
				if (generation !== sessionGeneration || metadata === undefined)
					return null;
				const record = z
					.object({
						version: z.literal(1),
						ownerID: z.literal(ownerID),
						vehicleID: z.literal(vehicleID),
						values: serviceDraftValuesSchema,
						updatedAt: z.number(),
					})
					.parse(metadata);
				const receipt =
					file === undefined
						? null
						: z.object({ filename: z.string(), data: z.string() }).parse(file);
				return { values: record.values, updatedAt: record.updatedAt, receipt };
			}),
		save: (draft: SavedServiceDraft) =>
			enqueue(async () => {
				const db = await openDatabase();
				if (generation !== sessionGeneration) return;
				await transaction(db, "readwrite", (tx) => {
					if (!hasServiceDraft(draft.values, draft.receipt)) {
						for (const name of stores) tx.objectStore(name).delete(key);
					} else {
						tx.objectStore("drafts").put(
							{
								version: 1,
								ownerID,
								vehicleID,
								values: draft.values,
								updatedAt: draft.updatedAt,
							},
							key,
						);
						if (draft.receipt)
							tx.objectStore("receipts").put(draft.receipt, key);
						else tx.objectStore("receipts").delete(key);
					}
				});
			}),
		remove: () =>
			enqueue(async () => {
				const db = await openDatabase();
				if (generation !== sessionGeneration) return;
				await transaction(db, "readwrite", (tx) => {
					for (const name of stores) tx.objectStore(name).delete(key);
				});
			}),
	};
}

export async function clearServiceDrafts() {
	sessionGeneration++;
	const db = await openDatabase();
	await transaction(db, "readwrite", (tx) => {
		for (const name of stores) tx.objectStore(name).clear();
	});
}

type DraftStorage = ReturnType<typeof createServiceDraftStore>;
type DraftSnapshot = {
	phase: "loading" | "restore" | "editing";
	saved: SavedServiceDraft | null;
	status: "idle" | "saving" | "saved" | "error";
};
const initialSnapshot: DraftSnapshot = {
	phase: "loading",
	saved: null,
	status: "idle",
};

export class ServiceDraftController {
	private snapshot: DraftSnapshot = initialSnapshot;
	private listeners = new Set<() => void>();
	private latest: SavedServiceDraft | null = null;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private active = false;
	private started = false;
	private revision = 0;
	private storage: DraftStorage;
	private debounceMs: number;
	constructor(storage: DraftStorage, debounceMs = 500) {
		this.storage = storage;
		this.debounceMs = debounceMs;
	}
	getSnapshot = () => this.snapshot;
	getServerSnapshot = () => initialSnapshot;
	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};
	private update(next: Partial<DraftSnapshot>) {
		this.snapshot = { ...this.snapshot, ...next };
		for (const listener of this.listeners) listener();
	}
	async load() {
		if (this.started) return;
		this.started = true;
		try {
			const saved = await this.storage.load();
			this.active = !saved;
			this.update({ phase: saved ? "restore" : "editing", saved });
		} catch {
			this.update({ phase: "editing", status: "error" });
		}
	}
	track(values: ServiceDraftValues, receipt: ReceiptFile | null) {
		this.latest = {
			values: serviceDraftValuesSchema.parse(values),
			receipt,
			updatedAt: Date.now(),
		};
		if (!this.active) return;
		this.revision++;
		clearTimeout(this.timer);
		const revision = this.revision;
		queueMicrotask(() => {
			if (this.active && revision === this.revision)
				this.update({ status: "saving" });
		});
		this.timer = setTimeout(() => {
			void this.flush();
		}, this.debounceMs);
	}
	async flush(): Promise<boolean> {
		clearTimeout(this.timer);
		if (!this.latest || this.snapshot.phase !== "editing") return true;
		if (!this.active)
			return !hasServiceDraft(this.latest.values, this.latest.receipt);
		const draft = this.latest,
			revision = this.revision;
		try {
			await this.storage.save(draft);
			if (this.active && revision === this.revision)
				this.update({
					status: hasServiceDraft(draft.values, draft.receipt)
						? "saved"
						: "idle",
				});
			return true;
		} catch {
			if (this.active) this.update({ status: "error" });
			return false;
		}
	}
	resume() {
		const saved = this.snapshot.saved;
		if (!saved) return null;
		this.latest = saved;
		this.active = true;
		this.update({ phase: "editing", saved: null, status: "saved" });
		return saved;
	}
	async discard() {
		clearTimeout(this.timer);
		this.active = false;
		try {
			await this.storage.remove();
			this.latest = null;
			this.active = true;
			this.update({ phase: "editing", saved: null, status: "idle" });
		} catch {
			this.update({ status: "error" });
			throw new Error("No pudimos descartar el borrador. Intentá de nuevo.");
		}
	}
	abandon() {
		clearTimeout(this.timer);
		this.active = false;
		this.latest = null;
	}
	async finish() {
		clearTimeout(this.timer);
		this.active = false;
		await this.storage.remove();
		this.latest = null;
		this.update({ phase: "editing", saved: null, status: "idle" });
	}
}
