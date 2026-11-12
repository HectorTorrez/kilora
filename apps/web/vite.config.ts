import { request } from "node:http";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";

function apiProxy(): Plugin {
	return {
		name: "kilora-api-proxy",
		enforce: "pre",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				if (!req.url?.startsWith("/api/") && req.url !== "/api") return next();
				const upstream = request(
					{
						hostname: "localhost",
						port: 8080,
						path: req.url,
						method: req.method,
						headers: req.headers,
					},
					(response) => {
						res.writeHead(response.statusCode ?? 502, response.headers);
						response.pipe(res);
					},
				);
				upstream.on("error", () => {
					if (!res.headersSent) res.writeHead(502);
					res.end();
				});
				req.pipe(upstream);
			});
		},
	};
}

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	// El mapa 3D se carga aparte (lazy). Sin esto, Vite descubre three.js tarde,
	// re-optimiza a mitad de sesión y el navegador recibe 504 "Outdated Optimize Dep".
	optimizeDeps: {
		include: [
			"three",
			"@react-three/fiber",
			"@react-three/drei",
			"@react-three/postprocessing",
		],
	},
	plugins: [
		apiProxy(),
		devtools(),
		nitro(),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
