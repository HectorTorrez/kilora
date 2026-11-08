import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";

export function useWorkshopMutation<T, R>(
	workshopID: string,
	fn: (value: T) => Promise<R>,
	options?: { inlineErrors?: boolean },
) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: fn,
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ["workshop", workshopID] }),
		onError: (error) => {
			if (!options?.inlineErrors) toast.error(errorMessage(error));
		},
	});
}
