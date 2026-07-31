# Decisión técnica — Cilindros y recargas

> ⚠️ **PROVISIONAL — no refleja el proceso real.** Este documento y el módulo de
> Cilindros se diseñaron antes de levantar el proceso con el cliente. Antes de rehacerlo hay que
> responder: ¿se cuentan por serie individual o por cantidad?, ¿de quién son los cilindros
> (comodato)?, ¿cuáles son los estados reales?, ¿se rellenan o se compran llenos?, ¿cuál es el paso
> a paso del técnico? Ver `docs/planning/BLUEPRINT.md` §5.5.

## Control

Los cilindros se controlan por cantidad, no por serial individual en el MVP.

## Filtros

- Tipo de gas
- Capacidad
- Propiedad
- Estado
- Cliente
- Ubicación
- Empresa
- Almacén

## Estados

- Lleno
- Vacío
- En cliente
- Prestado
- Alquilado
- En prueba hidrostática
- Vencido
- Perdido
- Dañado
- Pendiente por retorno

## Operaciones base

### Intercambio directo

Cliente entrega vacío y recibe lleno.

Resultado:

- Entra 1 vacío.
- Sale 1 lleno.
- Se cobra gas/recarga.
- No queda pendiente.

### Entrega sin retorno

Cliente recibe lleno y no entrega vacío.

Resultado:

- Sale 1 lleno.
- Queda pendiente por retorno.
- Genera alerta.

### Cilindro de cliente

Cliente deja cilindro propio.

Resultado:

- Se registra recepción.
- No aumenta stock propio.
- Puede convertirse a inventario propio solo con autorización.

## Operación especial

`Convertir cilindro de cliente a inventario propio` requiere:

- Autorización OWNER/ADMIN.
- Motivo obligatorio.
- AuditLog.

## Fase 2

Cálculo real de gas por peso queda para fase 2.
