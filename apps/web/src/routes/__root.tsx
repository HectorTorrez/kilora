import { TanStackDevtools } from "@tanstack/react-devtools";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
	{
		head: () => ({
			meta: [
				{ charSet: "utf-8" },
				{
					name: "viewport",
					content:
						"width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
				},
				{
					name: "theme-color",
					media: "(prefers-color-scheme: light)",
					content: "#eef1f4",
				},
				{
					name: "theme-color",
					media: "(prefers-color-scheme: dark)",
					content: "#0f141a",
				},
				{ title: "Kilora" },
				{ name: "description", content: "Historial digital del vehículo" },
				{ name: "application-name", content: "Kilora" },
			],
			links: [
				{ rel: "stylesheet", href: appCss },
				{ rel: "icon", href: "/favicon.ico", sizes: "48x48" },
				{ rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
				{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
				{ rel: "manifest", href: "/site.webmanifest" },
				{ rel: "preconnect", href: "https://fonts.googleapis.com" },
				{
					rel: "preconnect",
					href: "https://fonts.gstatic.com",
					crossOrigin: "anonymous",
				},
				{
					rel: "stylesheet",
					href: "https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
				},
			],
		}),
		shellComponent: RootDocument,
		notFoundComponent: NotFoundPage,
	},
);

function NotFoundPage() {
	return (
		<main className="grid min-h-dvh place-items-center px-5 py-12">
			<div className="max-w-md space-y-4 text-center">
				<p className="font-mono text-sm text-ink-3">404</p>
				<h1 className="font-display text-3xl font-bold">
					Página no encontrada
				</h1>
				<p className="text-sm text-ink-2">
					El enlace puede estar incompleto o la página ya no está disponible.
				</p>
				<Button asChild>
					<Link to="/">Volver al inicio</Link>
				</Button>
			</div>
		</main>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	const { queryClient } = Route.useRouteContext();

	return (
		<html lang="es-SV">
			<head>
				<HeadContent />
			</head>
			<body className="antialiased" suppressHydrationWarning>
				<QueryClientProvider client={queryClient}>
					<TooltipProvider>{children}</TooltipProvider>
					<Toaster richColors position="top-center" />
				</QueryClientProvider>
				<TanStackDevtools
					config={{ position: "bottom-right" }}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
