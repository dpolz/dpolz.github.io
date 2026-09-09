param(
  [switch]$Deploy
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$distRoot = Join-Path $projectRoot "dist"
$clientRoot = Join-Path $distRoot "client"
$serverRoot = Join-Path $distRoot "server"

if (Test-Path -LiteralPath $distRoot) {
  Remove-Item -LiteralPath $distRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $clientRoot -Force | Out-Null
New-Item -ItemType Directory -Path $serverRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot "index.html") -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "styles.css") -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "app.js") -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "config.js") -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "manifest.webmanifest") -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "service-worker.js") -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "icon.svg") -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "icon-192.png") -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "icon-512.png") -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "worker\index.js") -Destination $serverRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "config.js") -Destination (Join-Path $serverRoot "config.js")

Write-Output "Built worker and client assets in $distRoot"

if ($Deploy) {
  Write-Output "Deploying worker via wrangler..."
  npx wrangler deploy
}
