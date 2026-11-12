import { Sparkles } from "lucide-react";
import {
	type ServiceQuestion,
	useAssistantRequest,
} from "@/components/kilora/assistant-context";
import { Button } from "@/components/ui/button";

export function ServiceExplanation(service: ServiceQuestion) {
	const assistant = useAssistantRequest();
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="mt-3 -ml-2 min-h-11 touch-manipulation text-seal"
			onClick={() => assistant?.askAboutService({ ...service })}
		>
			<Sparkles className="size-4" aria-hidden />
			¿Qué me hicieron?
		</Button>
	);
}
