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
#    4. prueba: copia la base, la lee en solo lectura y habla con Macedonia;
#    5. deja el agente como tarea de Windows que arranca sola con el equipo.
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
$base = ''
foreach ($ini in (Get-ChildItem -Path 'C:\', 'D:\' -Filter 'ValerySMB*' -Directory -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'CONTROL.INI' })) {
  if (Test-Path -LiteralPath $ini) {
    $l = Get-Content -LiteralPath $ini -Encoding Default | Where-Object { $_ -match '^\s*DB\s*=' } | Select-Object -First 1
    if ($l) { $r = ($l -replace '^\s*DB\s*=\s*', '').Trim(); if (Test-Path -LiteralPath $r) { $base = $r; break } }
  }
}
if (-not $base) {
  $cand = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -match '^[A-Z]:\\$' } | ForEach-Object {
    Get-ChildItem -Path $_.Root -Filter 'ValerySMB*' -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      Get-ChildItem -Path (Join-Path $_.FullName 'datos') -Filter 'valery3.mdf' -File -ErrorAction SilentlyContinue }
  } | Sort-Object Length -Descending
  if ($cand) { $base = @($cand)[0].FullName }
}
if (-not $base) { Mal 'No encontre la base de Valery (valery3.mdf) en este equipo. Este instalador va en el SERVIDOR donde esta la base.' }
$tam = [math]::Round((Get-Item -LiteralPath $base).Length / 1MB, 1)
Bien ("Base: {0} ({1} MB)" -f $base, $tam)
$libre = (Get-PSDrive -Name 'C').Free
if ($libre -lt ((Get-Item -LiteralPath $base).Length * 2.2)) { Mal ("Falta espacio en C: para la copia de trabajo (hace falta unas {0} MB libres)." -f [math]::Round($tam * 2.2)) }

# ---------------------------------------------------------------- 2. la carpeta
Paso "Preparando $Destino ..."
if (Get-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $Tarea -Confirm:$false
  Bien 'Habia un agente anterior: se detuvo y se reemplaza.'
}
foreach ($d in $Destino, "$Destino\fb", "$Destino\lib", "$Destino\copia", "$Destino\log", "$Destino\descargas") {
  if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
}
# Solo SYSTEM y los Administradores: aqui queda la clave del agente y una copia de la base.
cmd /c icacls "$Destino" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" | Out-Null
Bien 'Carpeta lista (acceso solo para SYSTEM y Administradores).'

# ---------------------------------------------------------------- 3. dependencias
Paso 'Bajando Firebird embebido y FirebirdClient (sitios oficiales)...'
foreach ($dep in $Deps) {
  $f = Join-Path "$Destino\descargas" $dep.archivo
  Invoke-WebRequest -Uri $dep.url -OutFile $f -UseBasicParsing
  $h = (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash
  if ($h -ne $dep.sha) { Remove-Item -LiteralPath $f -Force; Mal ("La huella de {0} no coincide ({1}). No se instala nada." -f $dep.nombre, $h) }
  Bien ("{0}: huella correcta" -f $dep.nombre)
}
Expand-Archive -LiteralPath "$Destino\descargas\fb.zip" -DestinationPath "$Destino\fb" -Force
$tmpNu = Join-Path "$Destino\descargas" 'fbclient'
Expand-Archive -LiteralPath "$Destino\descargas\fbclient.zip" -DestinationPath $tmpNu -Force
Copy-Item -LiteralPath (Join-Path $tmpNu 'lib\net452\FirebirdSql.Data.FirebirdClient.dll') -Destination "$Destino\lib\" -Force
Remove-Item -LiteralPath "$Destino\descargas" -Recurse -Force
Get-ChildItem -LiteralPath $Destino -Recurse -File | Unblock-File
Bien 'Dependencias instaladas.'

# ---------------------------------------------------------------- 4. agente y configuracion
Paso 'Instalando el agente...'
# El marcador se arma en dos partes: si apareciera entero aqui, el .bat cortaria en este lugar.
$agente = $PuenteAgente -replace ('^\s*#' + '==AGENTE==\s*'), ''
[IO.File]::WriteAllText("$Destino\puente.ps1", $agente, (New-Object System.Text.UTF8Encoding($true)))
$cfg = [ordered]@{ url = $PuenteUrl; empresa = $PuenteEmpresa; token = $PuenteToken; base = $base; cadaSeg = 15; reusarMin = 5 }
[IO.File]::WriteAllText("$Destino\config.json", ($cfg | ConvertTo-Json), (New-Object System.Text.UTF8Encoding($false)))
Bien 'Agente y configuracion escritos.'

Paso 'Probando: copia de la base, lectura en solo lectura y conexion con Macedonia...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$Destino\puente.ps1" -Prueba
if ($LASTEXITCODE -ne 0) { Mal 'La prueba fallo (arriba esta el motivo). El agente no quedo instalado como tarea.' }

# ---------------------------------------------------------------- 5. tarea de Windows
Paso 'Dejando el agente como tarea de Windows...'
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Destino\puente.ps1`""
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
