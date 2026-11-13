import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/kilora/landing-page";
import { landingHead } from "@/lib/landing-seo";

export const Route = createFileRoute("/talleres")({
	head: () => landingHead("workshop"),
	component: () => <LandingPage audience="workshop" />,
});
