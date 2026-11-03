# ============================================================================
#  Puente Valery - instalador (Macedonia)
#
#  Se ejecuta UNA vez, en el SERVIDOR donde esta la base de Valery, como
#  administrador. Lo arma el panel de Macedonia con la direccion, la empresa y
#  la clave del agente ya puestas (variables $PuenteUrl, $PuenteEmpresa,
#  $PuenteToken y el texto del agente en $PuenteAgente).
#
#  Que hace:
#    1. busca la base de Valery en este equipo;
#    2. crea C:\MacedoniaPuente (solo SYSTEM y Administradores pueden leerla);
#    3. baja Firebird 2.5.9 embebido y FirebirdClient de sus sitios oficiales y
#       comprueba su huella SHA-256 antes de usarlos;
#    4. arma el agente nuevo aparte y lo prueba: copia la base, la lee en solo
#       lectura y habla con Macedonia;
#    5. solo si la prueba pasa, reemplaza al agente anterior (si lo hay);
#    6. deja el agente como tarea de Windows que arranca sola con el equipo.
#  Si algo falla antes del paso 5, el agente que ya estaba sigue funcionando.
#  Que NO hace: no modifica Valery, ni su base, ni Firebird del servidor, ni
#  abre puertos.
# ============================================================================

$ErrorActionPreference = 'Stop'
$Destino = 'C:\MacedoniaPuente'
$Tarea = 'Macedonia Puente Valery'
$Deps = @(
  @{ nombre = 'Firebird 2.5.9 embebido (x64)'; url = 'https://github.com/FirebirdSQL/firebird/releases/download/R2_5_9/Firebird-2.5.9.27139-0_x64_embed.zip'
     sha = '082F2143CA801441A95E2E88D5A06E7E6083D13EF33FCFA8F216EBFA177C71FD'; archivo = 'fb.zip' },
  @{ nombre = 'FirebirdClient 7.10.1 (.NET)'; url = 'https://api.nuget.org/v3-flatcontainer/firebirdsql.data.firebirdclient/7.10.1/firebirdsql.data.firebirdclient.7.10.1.nupkg'
     sha = 'DC8C662AD36AC6087D706C84A7A2FBAD9D6C6113093E989F32C77960A0E4E5D8'; archivo = 'fbclient.zip' }
)

function Paso([string]$t) { Write-Host ''; Write-Host ('>> ' + $t) -ForegroundColor Cyan }
function Bien([string]$t) { Write-Host ('   ' + $t) -ForegroundColor Green }
function Mal([string]$t) { Write-Host ''; Write-Host ('ERROR: ' + $t) -ForegroundColor Red; Write-Host ''; exit 1 }

Write-Host ''
Write-Host ('Instalador del Puente Valery para {0}' -f $PuenteEmpresa) -ForegroundColor Yellow
Write-Host 'Solo lee una COPIA de la base de Valery. No modifica Valery.'

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Mal 'Hay que ejecutarlo como administrador (clic derecho > Ejecutar como administrador).' }
if (-not [Environment]::Is64BitProcess) { Mal 'Este equipo no es de 64 bits.' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---------------------------------------------------------------- 1. la base
Paso 'Buscando la base de Valery en este equipo...'
# Puede haber varias instalaciones de Valery (una vieja olvidada al lado de la
# que se usa): se juntan TODAS las bases y se elige la que esta en uso. Firebird
# la tiene abierta, asi que no se deja abrir en exclusivo. Si nadie esta en
# Valery ahora, gana la modificada mas reciente.
function En-Uso([string]$f) {
  try { $s = [IO.File]::Open($f, 'Open', 'Read', 'None'); $s.Close(); return $false } catch [IO.IOException] { return $true } catch { return $false }
}
$vistas = @{}
foreach ($raiz in (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -match '^[A-Z]:\\$' } | ForEach-Object { $_.Root })) {
  foreach ($dir in (Get-ChildItem -LiteralPath $raiz -Filter 'ValerySMB*' -Directory -ErrorAction SilentlyContinue)) {
    $rutas = @(Join-Path $dir.FullName 'datos\valery3.mdf')
    $ini = Join-Path $dir.FullName 'CONTROL.INI'
    if (Test-Path -LiteralPath $ini) {
      foreach ($l in (Get-Content -LiteralPath $ini -Encoding Default | Where-Object { $_ -match '^\s*DB\s*=' })) {
        # DB= puede venir como SERVIDOR:D:\... ; se queda la ruta.
        $rutas += (($l -replace '^\s*DB\s*=\s*', '').Trim() -replace '^[^:\\]{2,}:(?=[A-Za-z]:\\)', '')
      }
    }
    foreach ($r in $rutas) { if ($r -and (Test-Path -LiteralPath $r -PathType Leaf)) { $vistas[$r.ToLower()] = $r } }
  }
}
$cand = @($vistas.Values | ForEach-Object {
  $i = Get-Item -LiteralPath $_
  [pscustomobject]@{ ruta = $i.FullName; uso = (En-Uso $i.FullName); fecha = $i.LastWriteTime; mb = [math]::Round($i.Length / 1MB, 1) }
} | Sort-Object @{ e = 'uso'; Descending = $true }, @{ e = 'fecha'; Descending = $true }, @{ e = 'mb'; Descending = $true })
if (-not $cand.Count) { Mal 'No encontre la base de Valery (valery3.mdf) en este equipo. Este instalador va en el SERVIDOR donde esta la base.' }
$base = $cand[0].ruta
if ($cand.Count -gt 1) {
  Write-Host ('   Hay {0} bases de Valery en este equipo:' -f $cand.Count)
  foreach ($c in $cand) {
    Write-Host ('   {0} {1}  ({2} MB, modificada {3:yyyy-MM-dd HH:mm}{4})' -f $(if ($c.ruta -eq $base) { '->' } else { '  ' }), $c.ruta, $c.mb, $c.fecha, $(if ($c.uso) { ', EN USO' } else { '' }))
  }
}
$tam = [math]::Round((Get-Item -LiteralPath $base).Length / 1MB, 1)
Bien ("Base: {0} ({1} MB)" -f $base, $tam)
$libre = (Get-PSDrive -Name 'C').Free
if ($libre -lt ((Get-Item -LiteralPath $base).Length * 2.2)) { Mal ("Falta espacio en C: para la copia de trabajo (hace falta unas {0} MB libres)." -f [math]::Round($tam * 2.2)) }

# ---------------------------------------------------------------- 2. la carpeta
# Todo lo nuevo se arma y se prueba en $Nuevo. El agente que ya está instalado
# NO se toca hasta que el nuevo pasa su prueba: de la 1.0.2 a la 1.0.3 el
# instalador quitaba el viejo primero y, al fallar la prueba, el servidor se
# quedó sin agente. Si algo falla aquí, el de antes sigue como estaba (y su
# clave también: Macedonia la cambia recién cuando el nuevo se conecta).
Paso "Preparando $Destino ..."
$Nuevo = Join-Path $Destino 'nuevo'
$habia = [bool](Get-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue)
if (-not (Test-Path -LiteralPath $Destino)) { New-Item -ItemType Directory -Path $Destino | Out-Null }
# Solo SYSTEM y los Administradores: aqui queda la clave del agente y una copia de la base.
cmd /c icacls "$Destino" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" | Out-Null
if (Test-Path -LiteralPath $Nuevo) { Remove-Item -LiteralPath $Nuevo -Recurse -Force }
foreach ($d in $Nuevo, "$Nuevo\fb", "$Nuevo\lib", "$Nuevo\copia", "$Nuevo\log", "$Nuevo\descargas") {
  New-Item -ItemType Directory -Path $d | Out-Null
}
Bien 'Carpeta lista (acceso solo para SYSTEM y Administradores).'
if ($habia) { Bien 'Hay un agente instalado: sigue funcionando mientras se prueba el nuevo.' }

# Si algo falla de aquí en adelante, se borra lo nuevo y el de antes queda intacto.
function Fallo([string]$t) {
  try { if (Test-Path -LiteralPath $Nuevo) { Remove-Item -LiteralPath $Nuevo -Recurse -Force } } catch {}
  if ($habia) { $t += ' El agente que ya estaba instalado sigue funcionando como antes.' }
  Mal $t
}

# ---------------------------------------------------------------- 3. dependencias
Paso 'Bajando Firebird embebido y FirebirdClient (sitios oficiales)...'
try {
  foreach ($dep in $Deps) {
    $f = Join-Path "$Nuevo\descargas" $dep.archivo
    Invoke-WebRequest -Uri $dep.url -OutFile $f -UseBasicParsing
    $h = (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash
    if ($h -ne $dep.sha) { throw ("La huella de {0} no coincide ({1}). No se instala nada." -f $dep.nombre, $h) }
    Bien ("{0}: huella correcta" -f $dep.nombre)
  }
  Expand-Archive -LiteralPath "$Nuevo\descargas\fb.zip" -DestinationPath "$Nuevo\fb" -Force
  $tmpNu = Join-Path "$Nuevo\descargas" 'fbclient'
  Expand-Archive -LiteralPath "$Nuevo\descargas\fbclient.zip" -DestinationPath $tmpNu -Force
  Copy-Item -LiteralPath (Join-Path $tmpNu 'lib\net452\FirebirdSql.Data.FirebirdClient.dll') -Destination "$Nuevo\lib\" -Force
  Remove-Item -LiteralPath "$Nuevo\descargas" -Recurse -Force
  Get-ChildItem -LiteralPath $Nuevo -Recurse -File | Unblock-File
} catch { Fallo ('No se pudieron bajar las dependencias: ' + $_.Exception.Message) }
Bien 'Dependencias listas.'

# ---------------------------------------------------------------- 4. agente nuevo y su prueba
Paso 'Preparando el agente nuevo...'
# El marcador se arma en dos partes: si apareciera entero aqui, el .bat cortaria en este lugar.
$agente = $PuenteAgente -replace ('^\s*#' + '==AGENTE==\s*'), ''
[IO.File]::WriteAllText("$Nuevo\puente.ps1", $agente, (New-Object System.Text.UTF8Encoding($true)))
$cfg = [ordered]@{ url = $PuenteUrl; empresa = $PuenteEmpresa; token = $PuenteToken; base = $base; cadaSeg = 15; reusarMin = 5 }
[IO.File]::WriteAllText("$Nuevo\config.json", ($cfg | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
Bien 'Agente y configuracion escritos.'

Paso 'Probando el agente nuevo: copia de la base, lectura en solo lectura y conexion con Macedonia...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$Nuevo\puente.ps1" -Prueba
if ($LASTEXITCODE -ne 0) { Fallo 'La prueba del agente nuevo fallo (arriba esta el motivo). No se instalo.' }
Bien 'Prueba superada: Macedonia ya usa la clave nueva.'

# ---------------------------------------------------------------- 5. cambiar el viejo por el nuevo
Paso 'Reemplazando el agente anterior por el nuevo...'
if ($habia) {
  Stop-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $Tarea -Confirm:$false
  # Hasta que el proceso viejo suelte sus archivos (Firebird, FirebirdClient).
  $hasta = (Get-Date).AddSeconds(30)
  while ((Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
          Where-Object { $_.CommandLine -like "*$Destino\puente.ps1*" }) -and (Get-Date) -lt $hasta) { Start-Sleep -Milliseconds 500 }
}
# Primero lo viejo se aparta (no se borra) y después entra lo nuevo. Desde la
# prueba, Macedonia solo acepta la clave nueva: si algo no se deja mover, la
# tarea corre el agente nuevo desde $Nuevo, que ya está probado y completo.
$Partes = 'fb', 'lib', 'copia', 'puente.ps1', 'config.json'
$Anterior = Join-Path $Destino 'anterior'
$Ejecutable = "$Destino\puente.ps1"
try {
  if (Test-Path -LiteralPath $Anterior) { Remove-Item -LiteralPath $Anterior -Recurse -Force }
  New-Item -ItemType Directory -Path $Anterior | Out-Null
  foreach ($x in $Partes) { if (Test-Path -LiteralPath (Join-Path $Destino $x)) { Move-Item -LiteralPath (Join-Path $Destino $x) -Destination (Join-Path $Anterior $x) } }
} catch {
  # Lo que alcanzó a moverse vuelve a su sitio; el agente nuevo corre desde su carpeta.
  foreach ($x in $Partes) { try { if (Test-Path -LiteralPath (Join-Path $Anterior $x)) { Move-Item -LiteralPath (Join-Path $Anterior $x) -Destination (Join-Path $Destino $x) } } catch {} }
  $Ejecutable = "$Nuevo\puente.ps1"
  Write-Host ('   No se pudo apartar el agente anterior ({0}): el nuevo queda corriendo desde {1}.' -f $_.Exception.Message, $Nuevo) -ForegroundColor Yellow
}
if ($Ejecutable -eq "$Destino\puente.ps1") {
  foreach ($x in $Partes) { Move-Item -LiteralPath (Join-Path $Nuevo $x) -Destination (Join-Path $Destino $x) }
  if (-not (Test-Path -LiteralPath "$Destino\log")) { New-Item -ItemType Directory -Path "$Destino\log" | Out-Null }
  Get-ChildItem -LiteralPath "$Nuevo\log" -File | ForEach-Object {
    Add-Content -LiteralPath (Join-Path "$Destino\log" $_.Name) -Value (Get-Content -LiteralPath $_.FullName) -Encoding UTF8
  }
  Remove-Item -LiteralPath $Nuevo -Recurse -Force
  try { Remove-Item -LiteralPath $Anterior -Recurse -Force } catch { Write-Host "   Quedo ${Anterior}: se puede borrar a mano." -ForegroundColor Yellow }
}
Bien ('Agente nuevo en su lugar: {0}' -f $Ejecutable)

# ---------------------------------------------------------------- 6. tarea de Windows
Paso 'Dejando el agente como tarea de Windows...'
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Ejecutable`""
$disparo = New-ScheduledTaskTrigger -AtStartup
$quien = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $Tarea -Action $accion -Trigger $disparo -Principal $quien -Settings $ajustes `
  -Description 'Puente entre Valery y Macedonia: lee una copia de la base de Valery (solo lectura) y entrega a Macedonia lo que se pide desde el panel.' | Out-Null
Start-ScheduledTask -TaskName $Tarea
Start-Sleep -Seconds 3
$estado = (Get-ScheduledTask -TaskName $Tarea).State
Bien ("Tarea '{0}': {1}" -f $Tarea, $estado)

Write-Host ''
Write-Host 'LISTO. El Puente Valery quedo instalado y conectado.' -ForegroundColor Green
Write-Host 'En Macedonia (Configuracion > Puente con Valery) ya deberia verse "Conectado".' -ForegroundColor Green
Write-Host 'Registro del agente: C:\MacedoniaPuente\log' -ForegroundColor Green
Write-Host 'Este instalador tiene la clave del agente: borralo despues de usarlo.' -ForegroundColor Yellow
