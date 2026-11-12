import { createContext, type ReactNode, useContext, useState } from "react";

export type ServiceQuestion = {
	vehicleID: string;
	recordID: string;
	corrections: number;
	summary: string;
	performedOn: string;
};

const AssistantContext = createContext<{
	request: ServiceQuestion | null;
	askAboutService: (service: ServiceQuestion) => void;
} | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
	const [request, setRequest] = useState<ServiceQuestion | null>(null);
	return (
		<AssistantContext.Provider value={{ request, askAboutService: setRequest }}>
			{children}
		</AssistantContext.Provider>
	);
}

export function useAssistantRequest() {
	return useContext(AssistantContext);
}
