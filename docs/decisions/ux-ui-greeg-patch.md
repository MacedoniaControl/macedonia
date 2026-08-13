# Decisión — Patch UX/UI para Greeg

## Contexto

Se solicitó un parche específico de UX/UI para mejorar la presentación visual, navegación,
estructura de pantallas, dashboard, experiencia responsive y consistencia del admin de SumiControl,
de cara a la demo de Sumigases.

## Alcance y límites (explícitos)

- Este parche **no sustituye el planning original**. Solo agrega una capa visual y de experiencia.
- Este parche **no cambia reglas de negocio** (inventario, notas de entrega, cilindros, caja, etc.).
- Este parche **no cambia el modelo de datos** ni el schema Prisma.
- Este parche **no cambia el modelo de permisos** ni el stack.
- Este parche **no elimina rutas existentes** ni reescribe lógica de negocio.
- Este parche **no introduce** e-commerce, tienda pública, referidos ni WhatsApp como flujo central.

## Qué sí hace

- Mejora el layout administrativo (AppShell, sidebar agrupado, header).
- Crea componentes UI reutilizables, estados vacíos accionables, badges, alertas y patrones de
  tabla/formulario consistentes.
- Mejora el responsive (móvil sin overflow horizontal global, sidebar colapsable, tablas con scroll
  interno, botones táctiles de 44px).
- Mejora la jerarquía visual (PageHeader, breadcrumbs, secciones).
- Aterriza el dashboard ejecutivo y una capa visual de ROI en varias pantallas.

## Identidad visual

Industrial, ejecutiva y operativa: azul marino profundo, naranja Sumigases, blanco, grises
neutros, amarillo solo como acento para alertas/ROI. Modo claro/oscuro por clase.

## Coordinación

El trabajo vive en la rama aislada `patch/greeg-ux-ui` y se propone como PR hacia `dev`. Toca el
dominio de UI que pertenece a Salem (`feature/ui-system`); cuando esa rama avance, debe reconciliarse
con este patch para evitar duplicación. La integración real con datos y auth queda fuera de este
parche (es solo capa de presentación).
