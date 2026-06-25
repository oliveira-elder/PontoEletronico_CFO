# Compacta docker_data.vhdx após docker volume prune — requer PowerShell como Administrador.
# Uso: clique direito > Executar como administrador
$ErrorActionPreference = "Stop"
$vhdx = Join-Path $env:LOCALAPPDATA "Docker\wsl\disk\docker_data.vhdx"

if (-not (Test-Path $vhdx)) {
    Write-Host "Arquivo não encontrado: $vhdx"
    exit 1
}

$before = (Get-Item $vhdx).Length
Write-Host "docker_data.vhdx antes: $([math]::Round($before/1GB,2)) GB"
Write-Host "Parando WSL/Docker..."
wsl --shutdown | Out-Null
Start-Sleep -Seconds 5

if (Get-Command Optimize-VHD -ErrorAction SilentlyContinue) {
    Optimize-VHD -Path $vhdx -Mode Full
    Write-Host "Compactação concluída (Optimize-VHD)."
} else {
    $script = @"
select vdisk file="$vhdx"
attach vdisk readonly
compact vdisk
detach vdisk
exit
"@
    $script | diskpart
    Write-Host "Compactação concluída (diskpart)."
}

$after = (Get-Item $vhdx).Length
Write-Host "docker_data.vhdx depois: $([math]::Round($after/1GB,2)) GB"
Write-Host "Espaço recuperado no disco C: ~$([math]::Round(($before-$after)/1GB,2)) GB"

$d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
Write-Host "C: livre: $([math]::Round($d.FreeSpace/1GB,2)) GB"
Write-Host "Reinicie o Docker Desktop manualmente."
