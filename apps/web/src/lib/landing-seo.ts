import {
	LANDING_PAGES,
	type LandingAudience,
	OG_IMAGE,
	SITE_NAME,
	SITE_URL,
} from "./site";

export function landingHead(audience: LandingAudience) {
	const page = LANDING_PAGES[audience];
	const url = `${SITE_URL}${page.path}`;
	const structuredData = {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "Organization",
				"@id": `${SITE_URL}/#organization`,
				name: SITE_NAME,
				url: SITE_URL,
				logo: `${SITE_URL}/icon.svg`,
				areaServed: { "@type": "Country", name: "El Salvador" },
			},
			{
				"@type": "WebSite",
				"@id": `${SITE_URL}/#website`,
				name: SITE_NAME,
				url: `${SITE_URL}/`,
				inLanguage: "es-SV",
				publisher: { "@id": `${SITE_URL}/#organization` },
			},
			{
				"@type": "WebPage",
				"@id": `${url}#webpage`,
				url,
				name: page.title,
				description: page.description,
				inLanguage: "es-SV",
				isPartOf: { "@id": `${SITE_URL}/#website` },
				mainEntity: { "@id": `${url}#app` },
				hasPart: { "@id": `${url}#preguntas` },
				about: { "@type": "Thing", name: page.topic },
				audience: { "@type": "Audience", audienceType: page.audience },
			},
			{
				"@type": "SoftwareApplication",
				"@id": `${url}#app`,
				name:
					audience === "owner"
						? "Kilora para propietarios"
						: "Kilora para talleres",
				url,
				applicationCategory: page.category,
				applicationSubCategory: page.topic,
				operatingSystem: "Web",
				inLanguage: "es-SV",
				description: page.description,
				featureList: page.features,
				audience: { "@type": "Audience", audienceType: page.audience },
				publisher: { "@id": `${SITE_URL}/#organization` },
			},
			{
				"@type": "FAQPage",
				"@id": `${url}#preguntas`,
				url: `${url}#preguntas`,
				inLanguage: "es-SV",
				isPartOf: { "@id": `${url}#webpage` },
				mainEntity: page.faqs.map(({ q, a }) => ({
					"@type": "Question",
					name: q,
					acceptedAnswer: { "@type": "Answer", text: a },
				})),
			},
		],
	};
	return {
		meta: [
			{ title: page.title },
			{ name: "description", content: page.description },
			{ name: "robots", content: "index, follow, max-image-preview:large" },
			{ name: "geo.region", content: "SV" },
			{ name: "geo.placename", content: "El Salvador" },
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: SITE_NAME },
			{ property: "og:locale", content: "es_SV" },
			{ property: "og:url", content: url },
			{ property: "og:title", content: page.title },
			{ property: "og:description", content: page.description },
			{ property: "og:image", content: OG_IMAGE },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{
				property: "og:image:alt",
				content:
					"Kilora · Historial del vehículo y gestión de talleres en El Salvador",
			},
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: page.title },
			{ name: "twitter:description", content: page.description },
			{ name: "twitter:image", content: OG_IMAGE },
			{
				name: "twitter:image:alt",
				content:
					"Kilora · Historial del vehículo y gestión de talleres en El Salvador",
			},
		],
		links: [
			{ rel: "canonical", href: url },
			{ rel: "alternate", hrefLang: "es-SV", href: url },
			{ rel: "alternate", hrefLang: "x-default", href: url },
		],
		scripts: [
			{
				type: "application/ld+json",
				children: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
			},
		],
	};
}
