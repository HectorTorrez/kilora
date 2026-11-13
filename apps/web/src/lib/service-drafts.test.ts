import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import "fake-indexeddb/auto";
import {
	clearServiceDrafts,
	createServiceDraftStore,
	emptyServiceDraft,
	type SavedServiceDraft,
	ServiceDraftController,
} from "./service-drafts.ts";

const draft = (summary = "Cambio de aceite"): SavedServiceDraft => ({
	values: {
		...emptyServiceDraft(),
		summary,
		date: "2026-01-10",
		where: "Taller",
		total: "25.00",
	},
	receipt: {
		filename: "recibo.pdf",
		data: "data:application/pdf;base64,JVBERi0xLjQ=",
	},
	updatedAt: Date.now(),
});
beforeEach(async () => {
	await clearServiceDrafts();
});

test("drafts and receipts survive reopening and stay scoped to owner and vehicle", async () => {
	const store = createServiceDraftStore("owner-a", "vehicle-a");
	const saved = draft();
	await store.save(saved);
	assert.deepEqual(
		await createServiceDraftStore("owner-a", "vehicle-a").load(),
		saved,
	);
	assert.equal(
		await createServiceDraftStore("owner-b", "vehicle-a").load(),
		null,
	);
	assert.equal(
		await createServiceDraftStore("owner-a", "vehicle-b").load(),
		null,
	);
});

test("large receipt data and subsequent receipt removal are persisted", async () => {
	const store = createServiceDraftStore("owner", "vehicle");
	const saved = draft();
	saved.receipt = {
		filename: "large.pdf",
		data: `data:application/pdf;base64,${Buffer.alloc(4 * 1024 * 1024, 97).toString("base64")}`,
	};
	await store.save(saved);
	assert.equal(
		(await createServiceDraftStore("owner", "vehicle").load())?.receipt?.data,
		saved.receipt.data,
	);
	await store.save({ ...saved, receipt: null });
	assert.equal(
		(await createServiceDraftStore("owner", "vehicle").load())?.receipt,
		null,
	);
	await store.save({
		values: emptyServiceDraft(),
		receipt: null,
		updatedAt: Date.now(),
	});
	assert.equal(await store.load(), null);
});

test("queued autosaves cannot recreate a removed draft", async () => {
	const store = createServiceDraftStore("owner", "vehicle");
	await Promise.all([
		store.save(draft("First")),
		store.save(draft("Last")),
		store.remove(),
	]);
	assert.equal(await createServiceDraftStore("owner", "vehicle").load(), null);
});

test("logout clears every scope and invalidates pending writers from the old session", async () => {
	const old = createServiceDraftStore("owner", "vehicle");
	const other = createServiceDraftStore("other", "vehicle");
	await other.save(draft());
	const pending = old.save(draft());
	await clearServiceDrafts();
	await pending;
	await old.save(draft("Late cleanup from unmounted form"));
	assert.equal(await createServiceDraftStore("owner", "vehicle").load(), null);
	assert.equal(await createServiceDraftStore("other", "vehicle").load(), null);
});

test("mounting and closing a restore prompt never overwrites the existing draft", async () => {
	const store = createServiceDraftStore("owner", "vehicle");
	const saved = draft();
	await store.save(saved);
	const controller = new ServiceDraftController(store, 10000);
	await controller.load();
	assert.equal(controller.getSnapshot().phase, "restore");
	controller.track(emptyServiceDraft(), null);
	assert.equal(await controller.flush(), true);
	assert.deepEqual(await store.load(), saved);
	const restored = controller.resume();
	assert.deepEqual(restored, saved);
	controller.track({ ...saved.values, summary: "Updated" }, saved.receipt);
	assert.equal(await controller.flush(), true);
	assert.equal((await store.load())?.values.summary, "Updated");
	await controller.finish();
	assert.equal(await controller.flush(), true);
	assert.equal(await store.load(), null);
});

test("save and discard cancel pending autosaves and clear attachments", async () => {
	const store = createServiceDraftStore("owner", "vehicle");
	const controller = new ServiceDraftController(store, 10000);
	await controller.load();
	controller.track(draft().values, draft().receipt);
	const inFlight = controller.flush();
	await controller.finish();
	await inFlight;
	assert.equal(await store.load(), null);
	const next = new ServiceDraftController(store, 10000);
	await next.load();
	next.track(draft().values, draft().receipt);
	await next.discard();
	next.track(emptyServiceDraft(), null);
	await next.flush();
	assert.equal(await store.load(), null);
});

test("storage failure remains visible and retains the data for retry", async () => {
	let failing = true;
	const state: { stored: SavedServiceDraft | null } = { stored: null };
	const controller = new ServiceDraftController(
		{
			load: async () => null,
			save: async (value) => {
				if (failing) throw new Error("quota");
				state.stored = value;
			},
			remove: async () => {
				state.stored = null;
			},
		},
		10000,
	);
	await controller.load();
	const values = draft();
	controller.track(values.values, values.receipt);
	assert.equal(await controller.flush(), false);
	assert.equal(controller.getSnapshot().status, "error");
	failing = false;
	assert.equal(await controller.flush(), true);
	assert.deepEqual(state.stored?.values, values.values);
	assert.equal(controller.getSnapshot().status, "saved");
});

test("unavailable storage permits editing but does not pretend a draft was saved", async () => {
	const controller = new ServiceDraftController(
		{
			load: async () => {
				throw new Error("blocked");
			},
			save: async () => {
				throw new Error("blocked");
			},
			remove: async () => {},
		},
		10000,
	);
	await controller.load();
	assert.equal(controller.getSnapshot().phase, "editing");
	assert.equal(controller.getSnapshot().status, "error");
	controller.track(draft().values, null);
	assert.equal(await controller.flush(), false);
	controller.abandon();
	assert.equal(await controller.flush(), true);
});

test("two form sessions never mix one draft's details with another receipt", async () => {
	const first = createServiceDraftStore("owner", "vehicle");
	const second = createServiceDraftStore("owner", "vehicle");
	const original = draft("First");
	const replacement = {
		...draft("Second"),
		receipt: {
			filename: "second.pdf",
			data: "data:application/pdf;base64,U2Vjb25k",
		},
	};
	await first.save(original);
	await second.load();
	await second.save(replacement);
	await first.save({
		...original,
		values: { ...original.values, summary: "First edited" },
	});
	const saved = await second.load();
	assert.equal(saved?.values.summary, "First edited");
	assert.deepEqual(saved?.receipt, original.receipt);
});

test("autosave debounces edits and persists the latest incomplete form", {
	timeout: 3000,
}, async () => {
	const store = createServiceDraftStore("owner", "vehicle");
	const controller = new ServiceDraftController(store, 5);
	await controller.load();
	const persisted = new Promise<void>((resolve) => {
		const unsubscribe = controller.subscribe(() => {
			if (controller.getSnapshot().status === "saved") {
				unsubscribe();
				resolve();
			}
		});
	});
	controller.track({ ...emptyServiceDraft(), summary: "Partial" }, null);
	controller.track(
		{ ...emptyServiceDraft(), summary: "Latest partial entry" },
		null,
	);
	await persisted;
	const saved = await store.load();
	assert.equal(saved?.values.summary, "Latest partial entry");
	assert.equal(saved?.values.date, "");
});
