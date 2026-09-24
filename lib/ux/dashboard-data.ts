// Alertas operativas de la cabecera y el Dashboard.
//
// Aquí vivían las cifras de ejemplo de 2024 (series, KPIs, «productos con
// mayor retorno», «categorías más rentables»). Se quitaron: el Dashboard y
// Rentabilidad leen ahora el histórico real (history-data) y la base
// (dashboard-db), y dejar las de ejemplo a mano era invitar a volver a usarlas.

// Vacío a propósito: una alerta falsa es peor que ninguna alerta. Se llenará
// cuando haya reglas reales (mínimos de stock, retornos vencidos, etc.).
export const alertasOperativas: { tone: "warn" | "info" | "danger"; titulo: string; mensaje: string }[] = [];
