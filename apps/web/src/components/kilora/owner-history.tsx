import type { components } from "@kilora/contracts";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { categoryLabels } from "@/lib/domain";
import { day, km as formatKm, money, plural } from "@/lib/format";
import {
	OWNER_HISTORY_PAGE_SIZE,
	type OwnerHistoryFilters,
	ownerHistoryQuery,
} from "@/lib/owner";
import { useListPage } from "@/lib/pagination";
import type { PartKey } from "@/lib/part-catalog";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "./date-range-filter";
import { ClearFilters, FacetFilter } from "./facet-filter";
import { HistoryPartsStrip } from "./history-parts";
import { HistoryItems } from "./history-record";
import { ListPagination } from "./list-pagination";
import { OwnerReceiptDownload } from "./owner-receipt-download";
import { ServiceExplanation } from "./service-explanation";

type HistoryRecord = components["schemas"]["HistoryRecord"];
type Category = components["schemas"]["PartCategory"];

export function OwnerHistory({
	vehicleID,
	userID,
	bodyType,
	initialHistory,
	onAddService,
	onCorrect,
	onViewPart,
}: {
	vehicleID: string;
	userID: string;
	bodyType?: components["schemas"]["BodyType"] | null;
	initialHistory: components["schemas"]["OwnerHistory"];
	onAddService: () => void;
	onCorrect: (record: HistoryRecord) => void;
	onViewPart: (part: PartKey, record: HistoryRecord) => void;
}) {
	const [filters, setFilters] = useState<OwnerHistoryFilters>({});
	const [search, setSearch] = useState("");
	const updateFilters = (next: OwnerHistoryFilters) => {
		setFilters(next);
		setSearch(next.q ?? "");
	};
	const active = Object.values(filters).some(Boolean);
	const { page: historyPage, setPage: setHistoryPage } = useListPage(
		JSON.stringify([vehicleID, filters]),
	);
	const historyRef = useRef<HTMLElement>(null);
	const history = useQuery({
		...ownerHistoryQuery(vehicleID, historyPage, filters),
		initialData: historyPage === 1 && !active ? initialHistory : undefined,
	});
	const h = history.data ?? { ...initialHistory, records: [], total: 0 };
	const changeHistoryPage = (page: number) => {
		setHistoryPage(page);
		historyRef.current?.scrollIntoView({ block: "start" });
	};
	return (
		<section ref={historyRef} className="scroll-mt-6">
			<h2 className="mb-4 font-display text-2xl font-bold">
				Historial de servicios
			</h2>
			<OwnerHistoryFiltersForm
				value={filters}
				workshops={h.workshops}
				onChange={updateFilters}
				search={search}
				onSearchChange={setSearch}
			/>
			<output className="mb-3 block text-sm text-ink-3" aria-live="polite">
				{history.isError
					? "No se pudo actualizar la búsqueda"
					: history.isFetching
						? "Buscando servicios…"
						: `${plural(h.total, "servicio", "servicios")}${active ? ` de ${h.unfiltered_total} registrados` : ""}`}
			</output>
			{history.isError && (
				<Alert variant="destructive">
					<AlertDescription>
						No pudimos cargar el historial.{" "}
						<Button
							type="button"
							variant="link"
							onClick={() => history.refetch()}
						>
							Reintentar
						</Button>
					</AlertDescription>
				</Alert>
			)}
			<div
				className={cn(
					"space-y-4 transition-opacity",
					history.isPlaceholderData && "opacity-60",
				)}
				aria-busy={history.isFetching}
			>
				{h.total === 0 &&
					!history.isFetching &&
					!history.isError &&
					(active ? (
						<div className="rounded-xl border border-dashed p-6">
							<p className="font-medium">
								No encontramos servicios con esos filtros
							</p>
							<p className="mt-1 text-sm text-ink-3">
								Probá otra palabra o ampliá el rango de fechas.
							</p>
							<Button
								type="button"
								variant="outline"
								className="mt-3"
								onClick={() => updateFilters({})}
							>
								Limpiar filtros
							</Button>
						</div>
					) : (
						<OwnerHistoryEmpty onAddService={onAddService} />
					))}
				{h.records.map((record) => (
					<OwnerHistoryRecord
						key={record.id}
						record={record}
						vehicleID={vehicleID}
						userID={userID}
						bodyType={bodyType}
						onCorrect={onCorrect}
						onViewPart={onViewPart}
					/>
				))}
			</div>
			{!history.isError && (
				<ListPagination
					page={historyPage}
					total={h.total}
					pageSize={OWNER_HISTORY_PAGE_SIZE}
					pending={history.isPlaceholderData}
					onPageChange={changeHistoryPage}
					alwaysVisible
					className="mt-4 rounded-lg border px-4"
				/>
			)}
		</section>
	);
}

function OwnerHistoryRecord({
	record: r,
	vehicleID,
	userID,
	bodyType,
	onCorrect,
	onViewPart,
}: {
	record: HistoryRecord;
	vehicleID: string;
	userID: string;
	bodyType?: components["schemas"]["BodyType"] | null;
	onCorrect: (record: HistoryRecord) => void;
	onViewPart: (part: PartKey, record: HistoryRecord) => void;
}) {
	return (
		<Card className="gap-0 p-5 shadow-none">
			<p className="text-sm text-ink-3">
				{day(r.performed_on)} · {formatKm(r.odometer_km)}
			</p>
			<h3 className="mt-2 font-display text-lg font-bold">{r.summary}</h3>
			<OwnerHistorySource record={r} />
			<HistoryPartsStrip record={r} bodyType={bodyType} onOpen={onViewPart} />
			<HistoryItems items={r.items} />
			{r.total && <p className="mt-3 font-semibold">Total: {money(r.total)}</p>}
			{r.workshop_notes && (
				<p className="mt-3 text-sm">Notas del taller: {r.workshop_notes}</p>
			)}
			{r.receipt && (
				<OwnerReceiptDownload
					vehicleID={vehicleID}
					recordID={r.id}
					receipt={r.receipt}
				/>
			)}
			<ServiceExplanation
				vehicleID={vehicleID}
				recordID={r.id}
				corrections={r.corrections?.length ?? 0}
				summary={r.summary}
				performedOn={day(r.performed_on)}
			/>
			{r.corrections?.map((c) => (
				<p key={c.id} className="mt-3 rounded bg-secondary p-2 text-sm">
					Corrección del {day(c.created_at)}: {c.reason} ·{" "}
					{Object.entries(c.changes)
						.map(
							([k, v]) =>
								`${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`,
						)
						.join(", ")}
				</p>
			))}
			{r.source === "propietario" && r.created_by === userID && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="mt-4"
					onClick={() => onCorrect(r)}
				>
					Corregir
				</Button>
			)}
		</Card>
	);
}

const categoryOptions = Object.entries(categoryLabels).map(
	([value, label]) => ({ value: value as Category, label }),
);
function OwnerHistoryFiltersForm({
	value,
	workshops,
	onChange,
	search,
	onSearchChange,
}: {
	value: OwnerHistoryFilters;
	workshops: string[];
	onChange: (filters: OwnerHistoryFilters) => void;
	search: string;
	onSearchChange: (value: string) => void;
}) {
	const active = Object.values(value).some(Boolean) || search.length > 0;
	return (
		<div className="mb-4 grid gap-3">
			<form
				className="flex gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					onChange({ ...value, q: search.trim() || undefined });
				}}
			>
				<SearchInput
					type="search"
					aria-label="Buscar en el historial de servicios"
					placeholder="Buscar servicio, pieza, marca o taller"
					value={search}
					maxLength={200}
					onChange={(event) => onSearchChange(event.target.value)}
					containerClassName="min-w-0 flex-1"
				/>
				<Button type="submit" variant="outline">
					Buscar
				</Button>
			</form>
			<div className="flex flex-wrap gap-2 [&>button]:max-w-full [&>button>span]:truncate">
				<DateRangeFilter
					label="Fecha"
					value={{ from: value.from, to: value.to }}
					onChange={(range) =>
						onChange({
							...value,
							q: search.trim() || undefined,
							from: range.from,
							to: range.to,
						})
					}
				/>
				<FacetFilter
					label="Taller"
					multiple={false}
					options={workshops.map((name) => ({ value: name, label: name }))}
					selected={value.workshop ? [value.workshop] : []}
					onChange={(selected) =>
						onChange({
							...value,
							q: search.trim() || undefined,
							workshop: selected[0],
						})
					}
				/>
				<FacetFilter
					label="Categoría"
					multiple={false}
					options={categoryOptions}
					selected={value.category ? [value.category] : []}
					onChange={(selected) =>
						onChange({
							...value,
							q: search.trim() || undefined,
							category: selected[0],
						})
					}
				/>
				<ClearFilters
					show={active}
					onClear={() => {
						onSearchChange("");
						onChange({});
					}}
				/>
			</div>
		</div>
	);
}
function OwnerHistorySource({ record }: { record: HistoryRecord }) {
	const externalWorkshop =
		record.source === "propietario" &&
		record.workshop_notes?.startsWith("Realizado en: ")
			? record.workshop_notes.slice("Realizado en: ".length)
			: null;
	return (
		<>
			<p className="text-sm text-seal">
				{record.workshop_name ||
					externalWorkshop ||
					(record.source === "propietario" ? "Registro personal" : "Taller")}
				{record.workshop_verified_at && (
					<span className="ml-2 text-sm text-seal">✓ Taller verificado</span>
				)}
			</p>
			<p className="mt-1 text-xs text-ink-3">
				{record.source === "propietario"
					? "Agregado por el propietario"
					: "Registrado por el taller"}
			</p>
		</>
	);
}

function OwnerHistoryEmpty({ onAddService }: { onAddService: () => void }) {
	return (
		<div className="space-y-2 rounded-xl border border-dashed p-6">
			<p className="font-medium">Empezá con el último servicio de tu carro</p>
			<p className="text-sm text-ink-3">
				Usá una foto del recibo o anotá lo que le hicieron. No necesitás que el
				taller use Kilora ni completar todo el historial de una vez.
			</p>
			<Button type="button" variant="outline" onClick={onAddService}>
				Guardar mi primer servicio
			</Button>
		</div>
	);
}
