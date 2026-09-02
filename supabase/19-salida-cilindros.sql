-- Salida de cilindros: quien autoriza y quien retira.
--
-- Pedido por Greeg: cuando los cilindros salen de la planta hay que dejar
-- declarado quien dio la autorizacion y quien fisicamente se los llevo. Sin eso
-- un cilindro que no vuelve no tiene a quien reclamarsele, que es justo el
-- problema que Macedonia existe para resolver.
--
-- `usuario_id` ya guardaba quien REGISTRA el movimiento. No alcanza: el que
-- teclea y el que carga el camion suelen ser personas distintas, y el que
-- autoriza casi siempre es una tercera.

alter table cilindros_mov
  add column if not exists autorizado_por uuid references usuarios(id),
  -- Texto libre a proposito: quien retira puede ser un chofer o un empleado del
  -- cliente, gente que no tiene usuario en el sistema. Exigir un uuid aqui
  -- obligaria a inventar usuarios o a dejar el campo vacio, y un campo vacio no
  -- sirve para reclamar nada.
  add column if not exists retirado_por text;

-- Toda salida hacia un cliente tiene que decir quien la autorizo. Los ingresos
-- y los movimientos internos no: nadie autoriza que un cilindro vuelva a casa.
alter table cilindros_mov
  drop constraint if exists salida_autorizada;
alter table cilindros_mov
  add constraint salida_autorizada check (
    estado_hacia is distinct from 'en_cliente'
    or (autorizado_por is not null
        and retirado_por is not null
        and length(trim(retirado_por)) > 0)
  );

comment on column cilindros_mov.autorizado_por is
  'Usuario que autorizo la salida. Obligatorio cuando el cilindro va a un cliente.';
comment on column cilindros_mov.retirado_por is
  'Quien se llevo fisicamente los cilindros. Texto libre: puede no ser un usuario.';

create index if not exists cil_mov_autoriza
  on cilindros_mov (empresa_id, autorizado_por) where autorizado_por is not null;
