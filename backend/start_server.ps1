# Script para iniciar el servidor FastAPI con Python 3.12 y Playwright
# Uso: .\start_server.ps1

$venvPath = Join-Path $PSScriptRoot "venv312"

if (-not (Test-Path $venvPath)) {
    Write-Host "Error: No se encontró el entorno virtual venv312" -ForegroundColor Red
    Write-Host "Por favor, ejecuta primero: py -3.12 -m venv venv312" -ForegroundColor Yellow
    exit 1
}

Write-Host "Activando entorno virtual con Python 3.12..." -ForegroundColor Green
& "$venvPath\Scripts\Activate.ps1"

Write-Host "Iniciando servidor FastAPI en http://127.0.0.1:8001..." -ForegroundColor Green
uvicorn main:app --reload --host 127.0.0.1 --port 8001

