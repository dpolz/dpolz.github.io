param()

$ErrorActionPreference = "Stop"
$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Build dist assets
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build.ps1")

# 2. Deploy Worker to Cloudflare
Write-Output "Deploying Cloudflare Worker..."
npx wrangler deploy
