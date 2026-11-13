import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/kilora/landing-page";
import { landingHead } from "@/lib/landing-seo";

export const Route = createFileRoute("/")({
	head: () => landingHead("owner"),
	component: () => <LandingPage audience="owner" />,
});
