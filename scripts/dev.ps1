# Ortho Diamond dev start (Windows PowerShell).
#   .\scripts\dev.ps1            -> local + same Wi-Fi
#   .\scripts\dev.ps1 -Ngrok     -> also expose :8100 via ngrok (needs NGROK_DOMAIN in BE\.env)
param([switch]$Ngrok)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (Get-Command docker -ErrorAction SilentlyContinue) {
  Write-Host 'Starting docker services (postgres, redis, ollama)...'
  docker compose -f "$root\docker-compose.yml" up -d postgres redis ollama
} else {
  Write-Host 'Docker not installed: using native PostgreSQL service and the Node gateway.'
  try { Start-Service postgresql-x64-17 -ErrorAction Stop } catch {}
}

Write-Host 'Building admin...'
Push-Location "$root\FE\admin"; npm run build; Pop-Location

Start-Process cmd -ArgumentList '/k', "cd /d `"$root\BE`" && npx prisma migrate deploy && npm run dev"
Start-Process cmd -ArgumentList '/k', "cd /d `"$root\FE\web`" && npm run dev -- -p 3100"
Start-Process cmd -ArgumentList '/k', "cd /d `"$root`" && node scripts\gateway.mjs"

if ($Ngrok) {
  $domain = (Get-Content "$root\BE\.env" | Where-Object { $_ -match '^NGROK_DOMAIN=' }) -replace '^NGROK_DOMAIN=', ''
  if (-not $domain) { throw 'Set NGROK_DOMAIN in BE\.env first' }
  Start-Process cmd -ArgumentList '/k', "ngrok http --url=$domain 8100"
}
Write-Host 'Open http://localhost:8100 and http://localhost:8100/admin/'
