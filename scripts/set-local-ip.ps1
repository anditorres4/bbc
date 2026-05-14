# set-local-ip.ps1
# Detects the machine's LAN IP and updates apps/mobile/.env for physical device testing.
# Run from the project root: .\scripts\set-local-ip.ps1

$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*","Ethernet*" -ErrorAction SilentlyContinue |
       Where-Object { $_.IPAddress -notmatch '^169\.' -and $_.IPAddress -ne '127.0.0.1' } |
       Select-Object -First 1).IPAddress

if (-not $ip) {
    $ip = (ipconfig | Select-String "IPv4" | Select-Object -First 1) -replace '.*:\s*', '' -replace '\s',''
}

if (-not $ip) {
    Write-Host "ERROR: Could not detect LAN IP. Set EXPO_PUBLIC_API_URL manually in apps/mobile/.env"
    exit 1
}

$apiUrl = "http://${ip}:4000"
$envPath = Join-Path $PSScriptRoot "..\apps\mobile\.env"
Set-Content -Path $envPath -Value "EXPO_PUBLIC_API_URL=$apiUrl" -Encoding utf8

Write-Host "Updated apps/mobile/.env:"
Write-Host "  EXPO_PUBLIC_API_URL=$apiUrl"
Write-Host ""
Write-Host "Now run:"
Write-Host "  pnpm --filter mobile run dev      # LAN mode (devices must be on same WiFi)"
Write-Host "  pnpm --filter mobile run tunnel   # Tunnel mode (any network, API via Railway)"
Write-Host ""
Write-Host "For tunnel mode with local API, also run ngrok on port 4000:"
Write-Host "  ngrok http 4000"
Write-Host "  Then update EXPO_PUBLIC_API_URL to the ngrok URL."
