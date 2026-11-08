import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useWorkshopId } from "@/components/kilora/app-shell";
import {
	CounterQuoteForm,
	counterQuoteFormValues,
} from "@/components/kilora/counter-quote-form";
import { counterQuoteActions, useWorkshopMutation } from "@/lib/workshop";
import { Route as TallerRoute } from "@/routes/taller";

export const Route = createFileRoute("/taller/cotizaciones/nueva")({
	component: NewQuotePage,
});

function NewQuotePage() {
	const workshopID = useWorkshopId();
	const { me } = TallerRoute.useRouteContext();
	const branches = me.memberships.filter(
		(item) => item.workshop_id === workshopID,
	);
	const navigate = useNavigate();
	const create = useWorkshopMutation(
		workshopID,
		counterQuoteActions(workshopID).create,
	);
	return (
		<main className="mx-auto max-w-3xl space-y-5 px-5 py-7">
			<div>
				<p className="text-xs text-ink-3">MOSTRADOR</p>
				<h1 className="font-display text-3xl font-bold">Nueva cotización</h1>
			</div>
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
		</main>
	);
}
