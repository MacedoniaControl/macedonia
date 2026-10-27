# ============================================================================
#  Puente Valery - agente (Macedonia)
#  Ver docs/decisions/puente-valery.md en el repositorio de Macedonia.
#
#  Vive en el servidor de Valery como tarea de Windows (SYSTEM). Cada 15 s le
#  pregunta a Macedonia si hay algo pedido para su empresa. Si lo hay:
#    1. copia la base de Valery con una instantanea de Windows (VSS); si no se
#       puede, intenta la copia directa. NUNCA abre la base en uso.
#    2. abre la COPIA con Firebird embebido y transacciones de solo lectura.
#    3. le entrega a Macedonia lo pedido, por partes, por HTTPS.
#  Nunca escribe en Valery. No abre ningun puerto: solo conexiones de salida.
#
#  Uso: lo arranca la tarea "Macedonia Puente Valery".
#       puente.ps1 -Prueba   -> copia, lee y prueba la conexion, y termina.
# ============================================================================
param([switch]$Prueba)

$ErrorActionPreference = 'Stop'
$Version = '1.0.1'
$Raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$Config = Get-Content -LiteralPath (Join-Path $Raiz 'config.json') -Raw | ConvertFrom-Json
$Url = ($Config.url).TrimEnd('/') + '/api/valery/agente'
$CadaSeg = [int]$Config.cadaSeg; if ($CadaSeg -lt 5) { $CadaSeg = 15 }
$ReusarMin = [int]$Config.reusarMin; if ($ReusarMin -lt 1) { $ReusarMin = 5 }
$Copia = Join-Path $Raiz 'copia\valery3.fdb'
$script:InfoCopia = @{}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -LiteralPath (Join-Path $Raiz 'lib\FirebirdSql.Data.FirebirdClient.dll')

function Anotar([string]$t) {
  $linea = '{0}  {1}' -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $t
  if ($Prueba) { Write-Host $linea }
  try {
    $dir = Join-Path $Raiz 'log'; if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    Add-Content -LiteralPath (Join-Path $dir ('puente-{0}.log' -f (Get-Date).ToString('yyyy-MM'))) -Value $linea -Encoding UTF8
  } catch {}
}

function Llamar($cuerpo) {
  $json = $cuerpo | ConvertTo-Json -Depth 8 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  return Invoke-RestMethod -Uri $Url -Method Post -Headers @{ Authorization = ('Bearer ' + $Config.token) } `
    -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 120
}

# ---------------------------------------------------------------- copiar la base
function Copiar-Base {
  if ((Test-Path -LiteralPath $Copia) -and ((Get-Date) - (Get-Item -LiteralPath $Copia).LastWriteTime).TotalMinutes -lt $ReusarMin) {
    return
  }
  $origen = [string]$Config.base
  if (-not (Test-Path -LiteralPath $origen)) { throw "No encuentro la base de Valery en $origen." }
  $dir = Split-Path -Parent $Copia; if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $tmp = $Copia + '.tmp'
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }
  $metodo = ''; $errVss = ''
  $unidad = [IO.Path]::GetPathRoot($origen)
  $enlace = Join-Path $Raiz 'vss'
  $sombra = $null
  try {
    $r = (Get-WmiObject -List Win32_ShadowCopy).Create($unidad, 'ClientAccessible')
    if ($r.ReturnValue -ne 0) { throw ('VSS respondio ' + $r.ReturnValue) }
    $sombra = Get-WmiObject Win32_ShadowCopy | Where-Object { $_.ID -eq $r.ShadowID }
    if (Test-Path -LiteralPath $enlace) { cmd /c rmdir "$enlace" | Out-Null }
    cmd /c mklink /d "$enlace" ($sombra.DeviceObject + '\') | Out-Null
    Copy-Item -LiteralPath (Join-Path $enlace $origen.Substring($unidad.Length)) -Destination $tmp -Force
    $metodo = 'instantanea VSS'
  } catch {
    $errVss = $_.Exception.Message
  } finally {
    if (Test-Path -LiteralPath $enlace) { cmd /c rmdir "$enlace" | Out-Null }
    if ($sombra) { try { $sombra.Delete() } catch {} }
  }
  if (-not $metodo) {
    try { Copy-Item -LiteralPath $origen -Destination $tmp -Force; $metodo = 'copia directa' }
    catch { throw ("No se pudo copiar la base. VSS: {0} | Directa: {1}" -f $errVss, $_.Exception.Message) }
  }
  Move-Item -LiteralPath $tmp -Destination $Copia -Force
  (Get-Item -LiteralPath $Copia).LastWriteTime = Get-Date
  $o = Get-Item -LiteralPath $origen
  $script:InfoCopia = @{ metodoCopia = $metodo; copiaEn = (Get-Date).ToString('s'); baseModificada = $o.LastWriteTime.ToString('s'); baseMB = [math]::Round($o.Length / 1MB, 1) }
  if ($errVss) { $script:InfoCopia.avisoVss = $errVss }
  # Para que el panel muestre que base se lee: una base vieja se delata por su ultima venta.
  $script:InfoCopia.base = $origen
  try { $script:InfoCopia.ultimaVenta = [string](Consultar "select max(fecha_emision) as u from ventas where temporal <> 'T'")[0].u } catch {}
  Anotar ("Copia hecha por {0} ({1} MB)" -f $metodo, $script:InfoCopia.baseMB)
}

# ---------------------------------------------------------------- leer la copia (solo lectura)
function Consultar([string]$sql, [hashtable]$parametros = @{}) {
  $cs = 'ServerType=1;ClientLibrary={0};Database={1};User=SYSDBA;Password=puente;Charset=WIN1252;Dialect=3;Pooling=false' -f (Join-Path $Raiz 'fb\fbembed.dll'), $Copia
  $cn = New-Object FirebirdSql.Data.FirebirdClient.FbConnection($cs)
  $cn.Open()
  try {
    $op = New-Object FirebirdSql.Data.FirebirdClient.FbTransactionOptions
    $op.TransactionBehavior = [FirebirdSql.Data.FirebirdClient.FbTransactionBehavior]::Read -bor `
      [FirebirdSql.Data.FirebirdClient.FbTransactionBehavior]::ReadCommitted -bor [FirebirdSql.Data.FirebirdClient.FbTransactionBehavior]::RecVersion
    $tx = $cn.BeginTransaction($op)
    $cmd = $cn.CreateCommand(); $cmd.Transaction = $tx; $cmd.CommandText = $sql; $cmd.CommandTimeout = 600
    foreach ($k in $parametros.Keys) { [void]$cmd.Parameters.AddWithValue($k, $parametros[$k]) }
    $rd = $cmd.ExecuteReader()
    $filas = New-Object System.Collections.Generic.List[object]
    while ($rd.Read()) {
      $f = [ordered]@{}
      for ($i = 0; $i -lt $rd.FieldCount; $i++) {
        $v = $rd.GetValue($i)
        if ($v -is [DBNull]) { $v = $null }
        elseif ($v -is [datetime]) { $v = if ($v.TimeOfDay.Ticks -eq 0) { $v.ToString('yyyy-MM-dd') } else { $v.ToString('s') } }
        elseif ($v -is [string]) { $v = $v.Trim() }
        elseif ($v -is [timespan]) { $v = $v.ToString() }
        $f[$rd.GetName($i).ToLower()] = $v
      }
      $filas.Add($f)
    }
    $rd.Close(); $tx.Commit()
    return ,$filas
  } finally { $cn.Close(); $cn.Dispose() }
}

$SQL = @{
  ventas = @'
select v.fecha_emision as fecha, v.tipo_documento as tipo, v.documento, v.cliente_nombre as cliente,
       d.producto_codigo as codigo, d.producto_nombre as producto, d.cantidad, d.total_neto as neto,
       v.factor_cambio as factor,
       (select first 1 h.factor_cambio from moneda_historial h
         where h.moneda_codigo = '02'
           and h.fecha_hora <= cast(v.fecha_emision || ' ' || coalesce(v.hora_emision, '23:59:59') as timestamp)
         order by h.fecha_hora desc) as tasa_historial
  from ventas v join ventas_detalles d on d.correlativo_principal = v.correlativo
 where v.fecha_emision between cast(@desde as date) and cast(@hasta as date)
   and v.tipo_documento in ('FAC', 'NET', 'DEV') and v.temporal <> 'T'
 order by v.correlativo, d.numero_linea
'@
  cxc = @'
select c.tipo_documento as tipo, c.documento, c.cliente_codigo, c.cliente_nombre as cliente, c.cliente_rif as rif,
       c.fecha_emision as emision, c.fecha_vencimiento as vencimiento, c.moneda_codigo as moneda, c.factor_cambio as factor,
       c.total_operacion as total, c.saldo, c.vendedor_codigo as vendedor
  from v3cxc c where c.saldo > 0.005 and c.temporal <> 'T'
 order by c.cliente_nombre, c.fecha_emision
'@
  cxp = @'
select c.tipo_documento as tipo, c.documento, c.numero_control, c.proveedor_codigo, c.proveedor_nombre as proveedor, c.proveedor_rif as rif,
       c.fecha_emision as emision, c.fecha_vencimiento as vencimiento, c.moneda_codigo as moneda, c.factor_cambio as factor,
       c.total_operacion as total, c.saldo
  from v3cxp c where c.saldo > 0.005 and c.temporal <> 'T'
 order by c.proveedor_nombre, c.fecha_emision
'@
  existencias = @'
select d.producto_codigo as codigo, p.nombre, p.departamento_codigo as departamento, pt.unidad, d.deposito_codigo as deposito,
       d.existencia_actual as existencia, d.existencia_comprometida as comprometida
  from productos_terminados_depositos d
  left join productos p on p.codigo_producto = d.producto_codigo and p.tipo_producto = d.producto_tipo
  left join productos_terminados pt on pt.codigo_producto = d.producto_codigo
 order by d.producto_codigo, d.deposito_codigo
'@
  estado = @'
select (select count(*) from ventas where temporal <> 'T') as ventas,
       (select max(fecha_emision) from ventas where temporal <> 'T') as ultima_venta,
       (select count(*) from v3cxc where saldo > 0.005 and temporal <> 'T') as cxc_abiertas,
       (select count(*) from v3cxp where saldo > 0.005 and temporal <> 'T') as cxp_abiertas,
       (select count(*) from productos_terminados_depositos) as productos
  from rdb$database
'@
}

function Filas-De([string]$tipo, $parametros) {
  if ($tipo -eq 'ventas') {
    $filas = Consultar $SQL.ventas @{ '@desde' = [string]$parametros.desde; '@hasta' = [string]$parametros.hasta }
    # La tasa del dia: en documentos en dolares, su factor; si no, la del historial a esa hora.
    foreach ($f in $filas) {
      $fx = [double]($f.factor); $th = if ($null -ne $f.tasa_historial) { [double]$f.tasa_historial } else { 0 }
      $f.tasa = if ($fx -gt 1.0001) { $fx } else { $th }
      $f.Remove('factor'); $f.Remove('tasa_historial')
    }
    return ,$filas
  }
  if ($SQL.ContainsKey($tipo)) { return ,(Consultar $SQL[$tipo]) }
  throw "Pedido desconocido: $tipo"
}

function Atender($s) {
  Anotar ("Pedido {0}: {1}" -f $s.id, $s.tipo)
  try {
    Copiar-Base
    $filas = Filas-De ([string]$s.tipo) $s.parametros
    $n = $filas.Count; $tam = 1000; $total = [math]::Max(1, [math]::Ceiling($n / $tam))
    $resumen = @{ filas = $n; agente = $Version; equipo = $env:COMPUTERNAME } + $script:InfoCopia
    if ($s.tipo -eq 'estado' -and $n -gt 0) { foreach ($k in @($filas[0].Keys)) { $resumen[$k] = $filas[0][$k] } }
    for ($p = 1; $p -le $total; $p++) {
      $parte = if ($n) { [object[]]($filas.GetRange(($p - 1) * $tam, [math]::Min($tam, $n - ($p - 1) * $tam)).ToArray()) } else { [object[]]@() }
      $cuerpo = @{ accion = 'resultado'; solicitud = $s.id; parte = $p; total = $total; datos = $parte }
      if ($p -eq $total) { $cuerpo.resumen = $resumen }
      [void](Llamar $cuerpo)
    }
    Anotar ("Pedido {0} entregado: {1} filas en {2} parte(s)" -f $s.id, $n, $total)
  } catch {
    $m = $_.Exception.Message
    Anotar ("Pedido {0} con error: {1}" -f $s.id, $m)
    try { [void](Llamar @{ accion = 'error'; solicitud = $s.id; mensaje = $m }) } catch { Anotar ('No se pudo avisar el error: ' + $_.Exception.Message) }
  }
}

# ---------------------------------------------------------------- prueba (la usa el instalador)
if ($Prueba) {
  Write-Host 'Prueba del Puente Valery (solo lectura)'
  Copiar-Base
  $e = (Consultar $SQL.estado)[0]
  Write-Host ("  Copia: {0}  |  ventas: {1}  |  ultima venta: {2}  |  CxC abiertas: {3}  |  CxP abiertas: {4}  |  productos: {5}" -f `
    $script:InfoCopia.metodoCopia, $e.ventas, $e.ultima_venta, $e.cxc_abiertas, $e.cxp_abiertas, $e.productos)
  if ($e.ultima_venta -and ((Get-Date) - [datetime]$e.ultima_venta).TotalDays -gt 30) {
    Write-Host ("  OJO: la ultima venta de esta base es del {0}. Si en Valery se factura a diario, esta NO es la base en uso." -f $e.ultima_venta) -ForegroundColor Yellow
  }
  $r = Llamar @{ accion = 'siguiente'; version = $Version; info = (@{ equipo = $env:COMPUTERNAME; base = [string]$Config.base } + $script:InfoCopia) }
  Write-Host '  Conexion con Macedonia: OK'
  if ($r.solicitud) { Atender $r.solicitud }
  return
}

# ---------------------------------------------------------------- vuelta principal
$mutex = New-Object System.Threading.Mutex($false, 'Global\MacedoniaPuenteValery')
if (-not $mutex.WaitOne(0)) { Anotar 'Ya hay otro agente corriendo; este termina.'; return }
Anotar ("Agente {0} iniciado en {1}" -f $Version, $env:COMPUTERNAME)
while ($true) {
  try {
    $info = @{ equipo = $env:COMPUTERNAME; base = [string]$Config.base } + $script:InfoCopia
    $r = Llamar @{ accion = 'siguiente'; version = $Version; info = $info }
    if ($r.solicitud) { Atender $r.solicitud; continue }
  } catch {
    Anotar ('Sin conexion con Macedonia: ' + $_.Exception.Message)
  }
  Start-Sleep -Seconds $CadaSeg
}
