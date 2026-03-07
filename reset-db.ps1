# BinMaps – Database Reset Script
# Drops the BinMaps database and re-creates it with fresh migrations + seed data.
# Run from the repo root: .\reset-db.ps1

$ErrorActionPreference = "Stop"

Write-Host "Dropping BinMaps database..." -ForegroundColor Yellow

Push-Location "$PSScriptRoot\BinMaps.API"

try {
    dotnet ef database drop `
        --project ..\BinMaps.Data\BinMaps.Data.csproj `
        --startup-project BinMaps.API.csproj `
        --force

    Write-Host "Database dropped." -ForegroundColor Green
    Write-Host ""
    Write-Host "Starting API to apply migrations and seed data..." -ForegroundColor Yellow
    Write-Host "(Press Ctrl+C once you see 'Application started' to stop)" -ForegroundColor Cyan
    Write-Host ""

    dotnet run
}
finally {
    Pop-Location
}
