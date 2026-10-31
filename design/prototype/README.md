# Kilora · Prototipo web

Diseño navegable, sin build y sin dependencias. Abrí `index.html` en el navegador
(doble clic o `open design/prototype/index.html`).

## Vistas

| Vista | Qué muestra |
| --- | --- |
| Vehículos | Pantalla principal del taller: métricas, tabla densa, seguimiento |
| Nueva orden | Registro en ≤5 min: plantillas, fotos, resumen y visibilidad |
| Propietario · móvil | Historial por placa, tal como llega desde WhatsApp |
| Landing | Entrada pública: consulta por placa y las dos capas del historial |
| Login | Acceso del taller por email y contraseña |

Cambiá de vista con la barra superior o con el hash (`#vehiculos`, `#orden`,
`#historial`, `#landing`, `#login`).

## Interacciones reales

- Buscar en la tabla filtra las filas.
- Las plantillas de "Nueva orden" agregan trabajos y recalculan el total.
- El switch de WhatsApp y los chips de filtro responden.
- "Registrar orden", "Compartir historial" y "Recordar" muestran confirmación.
- La consulta por placa de la landing abre el historial móvil con esa placa.
- El login entra al dashboard.

## Dirección visual

- **Papel** `#F4F3EF` · **Grafito** `#15181B` · **Verde sello** `#0E5A46`
- Archivo (títulos) · Inter (interfaz) · IBM Plex Mono (placas, fechas, km)
- Radios de 6–8 px, hairlines de 1 px, sin sombras decorativas.
- El historial se lee como ficha técnica: números tabulares y jerarquía por peso.

## Pendiente para pasar a código

- Estados vacío, carga y error de la tabla.
- Responsive real del taller (hoy es una vista de 1280 px).
- Copiar los tokens a `apps/web` y mapear componentes a shadcn/ui.
