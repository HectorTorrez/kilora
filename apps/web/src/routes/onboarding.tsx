import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/kilora/auth-page";
export const Route = createFileRoute("/onboarding")({
	component: () => <AuthPage mode="onboarding" />,
});
