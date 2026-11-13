import type { LandingAudience } from "@/lib/site";
import {
	FaqSection,
	Features,
	FinalCta,
	Hero,
	HowItWorks,
	LandingFooter,
	LandingHeader,
	OtherAudience,
	Problem,
	TwoLayers,
} from "./landing";

export function LandingPage({ audience }: { audience: LandingAudience }) {
	return (
		<div className="min-h-dvh bg-background">
			<a
				href="#contenido"
				className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:shadow"
			>
				Saltar al contenido
			</a>
			<LandingHeader audience={audience} />
			<main id="contenido">
				<Hero audience={audience} />
				<Problem audience={audience} />
				<HowItWorks audience={audience} />
				<TwoLayers audience={audience} />
				<Features audience={audience} />
				<FaqSection audience={audience} />
				<FinalCta audience={audience} />
				<OtherAudience audience={audience} />
			</main>
			<LandingFooter audience={audience} />
		</div>
	);
}
