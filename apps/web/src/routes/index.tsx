import { createFileRoute } from "@tanstack/react-router";
import {
	Audiences,
	FaqSection,
	FinalCta,
	Hero,
	HowItWorks,
	LandingFooter,
	LandingHeader,
	Problem,
	TwoLayers,
} from "@/components/kilora/landing";
import {
	FAQS,
	OG_IMAGE,
	SITE_DESCRIPTION,
	SITE_NAME,
	SITE_TITLE,
	SITE_URL,
} from "@/lib/site";

const structuredData = {
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "Organization",
			"@id": `${SITE_URL}/#organization`,
			name: SITE_NAME,
			url: SITE_URL,
			logo: `${SITE_URL}/icon.svg`,
			description: SITE_DESCRIPTION,
			areaServed: { "@type": "Country", name: "El Salvador" },
		},
		{
			"@type": "WebSite",
			"@id": `${SITE_URL}/#website`,
			url: SITE_URL,
			name: SITE_NAME,
			inLanguage: "es-SV",
			publisher: { "@id": `${SITE_URL}/#organization` },
		},
		{
			"@type": "SoftwareApplication",
			"@id": `${SITE_URL}/#app`,
			name: SITE_NAME,
			url: SITE_URL,
			applicationCategory: "BusinessApplication",
			applicationSubCategory: "Software para talleres mecánicos",
			operatingSystem: "Web",
			inLanguage: "es-SV",
			description: SITE_DESCRIPTION,
			areaServed: { "@type": "Country", name: "El Salvador" },
			audience: [
				{ "@type": "BusinessAudience", audienceType: "Talleres automotrices" },
				{ "@type": "Audience", audienceType: "Propietarios de vehículos" },
			],
			featureList: [
				"Órdenes de servicio en menos de 5 minutos",
				"Historial del vehículo con kilometraje y fotos",
				"Historial en dos capas: vista completa para el propietario y vista ciega para otros talleres",
				"Invitaciones por correo, link y QR compartible por WhatsApp",
				"Cotizaciones registradas como constancia",
				"Registros append-only con correcciones fechadas",
				"Sello de taller verificado",
			],
			publisher: { "@id": `${SITE_URL}/#organization` },
		},
		{
			"@type": "FAQPage",
			"@id": `${SITE_URL}/#faq`,
			mainEntity: FAQS.map((f) => ({
				"@type": "Question",
				name: f.q,
				acceptedAnswer: { "@type": "Answer", text: f.a },
			})),
		},
	],
};

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: SITE_TITLE },
			{ name: "description", content: SITE_DESCRIPTION },
			{ name: "robots", content: "index, follow, max-image-preview:large" },
			{ name: "geo.region", content: "SV" },
			{ name: "geo.placename", content: "El Salvador" },
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: SITE_NAME },
			{ property: "og:locale", content: "es_SV" },
			{ property: "og:url", content: `${SITE_URL}/` },
			{ property: "og:title", content: SITE_TITLE },
			{ property: "og:description", content: SITE_DESCRIPTION },
			{ property: "og:image", content: OG_IMAGE },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{
				property: "og:image:alt",
				content:
					"Kilora: el historial de tu carro no debería quedarse en el taller.",
			},
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: SITE_TITLE },
			{ name: "twitter:description", content: SITE_DESCRIPTION },
			{ name: "twitter:image", content: OG_IMAGE },
		],
		links: [
			{ rel: "canonical", href: `${SITE_URL}/` },
			{ rel: "alternate", hrefLang: "es-SV", href: `${SITE_URL}/` },
			{ rel: "alternate", hrefLang: "x-default", href: `${SITE_URL}/` },
		],
		scripts: [
			{
				type: "application/ld+json",
				children: JSON.stringify(structuredData),
			},
		],
	}),
	component: Landing,
});

function Landing() {
	return (
		<div className="min-h-dvh bg-background">
			<a
				href="#contenido"
				className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:shadow"
			>
				Saltar al contenido
			</a>
			<LandingHeader />
			<main id="contenido">
				<Hero />
				<Problem />
				<HowItWorks />
				<TwoLayers />
				<Audiences />
				<FaqSection />
				<FinalCta />
			</main>
			<LandingFooter />
		</div>
	);
}
