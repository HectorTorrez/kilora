import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
	CounterQuoteForm,
	counterQuoteFormValues,
} from "@/components/kilora/counter-quote-form";
import {
	BackLink,
	PageBody,
	PageHeader,
} from "@/components/kilora/workshop-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { customerQuery } from "@/features/taller/customers";
import { useWorkshopMutation } from "@/features/taller/mutation";
import { createCounterQuoteAction } from "@/features/taller/quotes";
import {
	useActiveBranch,
	useTallerContext,
	useWorkshopId,
} from "@/features/taller/session";

export const Route = createFileRoute("/taller/cotizaciones/nueva")({
	validateSearch: (search: Record<string, unknown>): { cliente?: string } => ({
		cliente:
			typeof search.cliente === "string" && search.cliente
				? search.cliente
				: undefined,
	}),
	component: NewQuotePage,
});

type CustomerDetail = Awaited<
	ReturnType<NonNullable<ReturnType<typeof customerQuery>["queryFn"]>>
>;

function initialValues(branchID: string, customer?: CustomerDetail) {
	const values = counterQuoteFormValues(undefined, branchID);
	if (!customer) return values;
	values.customer_id = customer.id;
	values.customer_name = customer.full_name;
	values.customer_phone = customer.phone ?? "";
	// With a single vehicle there is nothing to choose: prefill it too.
	const [only] = customer.vehicles.length === 1 ? customer.vehicles : [];
	if (only) {
		values.vehicle_id = only.id;
		values.vehicle_make = only.make;
		values.vehicle_model = only.model;
		values.vehicle_year = only.year ? String(only.year) : "";
		values.vehicle_plate = only.plate ?? "";
	}
	return values;
}

function NewQuotePage() {
	const { cliente } = Route.useSearch();
	const workshopID = useWorkshopId();
	const { me } = useTallerContext();
	const branches = me.memberships.filter(
		(item) => item.workshop_id === workshopID,
	);
	const activeBranch = useActiveBranch().id;
	const navigate = useNavigate();
	const create = useWorkshopMutation(
		workshopID,
		createCounterQuoteAction(workshopID),
	);
	const customer = useQuery({
		...customerQuery(workshopID, cliente ?? ""),
		enabled: !!workshopID && !!cliente,
	});
	const back = customer.data ? (
		<BackLink to={`/taller/clientes/${customer.data.id}`}>
			{customer.data.full_name}
		</BackLink>
	) : (
		<BackLink to="/taller/cotizaciones">Cotizaciones</BackLink>
	);
	return (
		<PageBody>
			<PageHeader
				back={back}
				title="Nueva cotización"
				description="Presupuesto de mostrador: no hace falta que el vehículo esté registrado ni que el cliente tenga cuenta."
			/>
			{cliente && customer.isLoading ? (
				<Skeleton className="h-96" />
			) : (
				<>
					{cliente && customer.error ? (
						<Alert variant="destructive">
							<AlertDescription>
								No se pudo cargar el cliente. Podés completar sus datos a mano.
							</AlertDescription>
						</Alert>
					) : null}
					<CounterQuoteForm
						workshopID={workshopID}
						branches={branches}
						initial={initialValues(
							activeBranch || (branches[0]?.branch_id ?? ""),
							customer.data,
						)}
						pending={create.isPending}
						showPrint
						onSubmit={async (body, print) => {
							const quote = await create.mutateAsync(body);
							toast.success("Cotización guardada");
							await navigate({
								to: print
									? "/taller/cotizaciones/$quoteId/imprimir"
									: "/taller/cotizaciones/$quoteId",
								params: { quoteId: quote.id },
							});
						}}
					/>
				</>
			)}
		</PageBody>
	);
}
