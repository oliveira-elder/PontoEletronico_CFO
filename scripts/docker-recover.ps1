# Recupera o Docker Desktop quando a API retorna 500 (motor Linux indisponível)
$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogFile = Join-Path $ProjectRoot "docker-recover.log"
Set-Location $ProjectRoot

function Write-Log {
    param([string]$Message)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

"=== docker-recover $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Set-Content -Path $LogFile -Encoding UTF8

function Test-DockerReady {
    docker info *> $null
    return $LASTEXITCODE -eq 0
}

Write-Log "Encerrando processos do Docker Desktop..."
Get-Process -Name "Docker Desktop", "com.docker.backend", "com.docker.service" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue

Write-Log "Desligando WSL..."
wsl --shutdown 2>$null
Start-Sleep -Seconds 5

$dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
if (Test-Path $dockerExe) {
    Write-Log "Iniciando Docker Desktop..."
    Start-Process $dockerExe
} else {
    Write-Log "ERRO: Docker Desktop nao encontrado em $dockerExe"
    exit 1
}

Write-Log "Aguardando motor Docker ficar pronto (ate 2 min)..."
$ready = $false
for ($i = 1; $i -le 40; $i++) {
    if (Test-DockerReady) {
        $ready = $true
        Write-Log "Docker pronto apos $($i * 3)s."
        break
    }
    Start-Sleep -Seconds 3
}

if (-not $ready) {
    Write-Log "ERRO: Docker nao respondeu. Reinicie o PC ou use Docker Desktop > Troubleshoot > Restart."
    exit 1
}

Write-Log "Limpando stack anterior..."
docker-compose down --remove-orphans 2>&1 | ForEach-Object { Write-Log $_ }

Write-Log "Subindo stack..."
docker-compose up --build -d 2>&1 | ForEach-Object { Write-Log $_ }

Write-Log "Status dos containers:"
docker-compose ps 2>&1 | ForEach-Object { Write-Log $_ }

Write-Log "Ultimas linhas do backend:"
docker-compose logs backend --tail 40 2>&1 | ForEach-Object { Write-Log $_ }

Write-Log "Concluido. Log salvo em $LogFile"
