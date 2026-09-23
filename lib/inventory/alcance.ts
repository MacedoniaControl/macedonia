// Que abarca un conteo, ademas de un departamento o la planilla de 75.
//
// El inventario general (consolidado) cuenta todos los departamentos que se
// cuentan, en un solo conteo con una sola acta. Se guarda en `zona`, como la
// planilla de 75, para no tocar la base: la 23 ya bloquea `zona` al cerrar.
// En pantalla se recorre departamento por departamento.

export const ZONA_GENERAL = "Inventario general";
