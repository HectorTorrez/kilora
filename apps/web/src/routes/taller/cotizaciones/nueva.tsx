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
import { useWorkshopMutation } from "@/features/taller/mutation";
import { createCounterQuoteAction } from "@/features/taller/quotes";
import { useTallerContext, useWorkshopId } from "@/features/taller/session";

export const Route = createFileRoute("/taller/cotizaciones/nueva")({
	component: NewQuotePage,
});

function NewQuotePage() {
	const workshopID = useWorkshopId();
	const { me } = useTallerContext();
	const branches = me.memberships.filter(
		(item) => item.workshop_id === workshopID,
	);
	const navigate = useNavigate();
	const create = useWorkshopMutation(
		workshopID,
		createCounterQuoteAction(workshopID),
	);
	return (
		<PageBody>
			<PageHeader
				back={<BackLink to="/taller/cotizaciones">Cotizaciones</BackLink>}
				title="Nueva cotización"
				description="Presupuesto de mostrador: no hace falta que el vehículo esté registrado ni que el cliente tenga cuenta."
			/>
			<CounterQuoteForm
				workshopID={workshopID}
				branches={branches}
				initial={counterQuoteFormValues(
					undefined,
					branches[0]?.branch_id ?? "",
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
		</PageBody>
	);
}
