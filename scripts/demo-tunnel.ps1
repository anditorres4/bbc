# demo-tunnel.ps1
# Sets EXPO_PUBLIC_API_URL to Railway (production API) and starts Expo tunnel.
# Use this for demos where devices are NOT on the same local network.
# Run from the project root: .\scripts\demo-tunnel.ps1

$railwayUrl = "https://bbc-production-62ef.up.railway.app"
$envPath = Join-Path $PSScriptRoot "..\apps\mobile\.env"
Set-Content -Path $envPath -Value "EXPO_PUBLIC_API_URL=$railwayUrl" -Encoding utf8

Write-Host "Set EXPO_PUBLIC_API_URL=$railwayUrl"
Write-Host "Starting Expo tunnel..."
Write-Host ""

Set-Location (Join-Path $PSScriptRoot "..")
pnpm --filter mobile run tunnel
