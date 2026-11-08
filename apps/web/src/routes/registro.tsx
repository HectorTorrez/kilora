import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/kilora/auth-page";
export const Route = createFileRoute("/registro")({
	component: () => <AuthPage mode="registro" />,
});
