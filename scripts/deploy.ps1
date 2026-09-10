param(
  [switch]$WorkerOnly,
  [switch]$PagesOnly,
  [string]$ProjectName = "fairgemeinschaft"
)

$ErrorActionPreference = "Stop"
$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $PSScriptRoot
$clientDist = Join-Path (Join-Path $projectRoot "dist") "client"

# 1. Build dist assets
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build.ps1")

# 2. Deploy Worker to Cloudflare (Backend)
if (-not $PagesOnly) {
  Write-Output "Deploying Cloudflare Worker (Backend API)..."
  npx wrangler deploy
}

# 3. Deploy Frontend to Cloudflare Pages
if (-not $WorkerOnly) {
  Write-Output "Deploying Frontend to Cloudflare Pages (Project: $ProjectName)..."
  npx wrangler pages deploy $clientDist --project-name=$ProjectName --commit-dirty=true --no-bundle
}
