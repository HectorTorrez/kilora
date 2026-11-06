import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
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
		],
		links: [
			{ rel: "stylesheet", href: appCss },
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
});

function RootDocument({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
				},
			}),
	);

	return (
		<html lang="es">
			<head>
				<HeadContent />
			</head>
			<body className="antialiased">
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
