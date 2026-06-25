# Sobe a stack após login/reboot quando o Docker Desktop já está em execução.
# Uso: Agendador de Tarefas do Windows → Disparo "Ao fazer logon" → ação:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\PontoEletronico_CFO\scripts\docker-startup.ps1"
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogFile = Join-Path $ProjectRoot "docker-startup.log"
Set-Location $ProjectRoot

function Write-Log {
    param([string]$Message)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

"=== docker-startup $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Set-Content -Path $LogFile -Encoding UTF8

Write-Log "Aguardando Docker Desktop (ate 3 min)..."
$ready = $false
for ($i = 1; $i -le 60; $i++) {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        Write-Log "Docker pronto apos $($i * 3)s."
        break
    }
    Start-Sleep -Seconds 3
}

if (-not $ready) {
    Write-Log "Docker indisponivel — abortando. Verifique se 'Iniciar ao entrar' esta ativo no Docker Desktop."
    exit 1
}

Write-Log "Subindo stack (docker compose up -d)..."
docker compose up -d 2>&1 | ForEach-Object { Write-Log $_ }

Write-Log "Status:"
docker compose ps 2>&1 | ForEach-Object { Write-Log $_ }

Write-Log "Concluido."
