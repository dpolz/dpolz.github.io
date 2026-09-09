param()

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
Copy-Item -LiteralPath (Join-Path $projectRoot "public\index.html") -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "public\styles.css") -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "public\app.js") -Destination $clientRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "worker\index.js") -Destination $serverRoot
Copy-Item -LiteralPath (Join-Path $projectRoot "config.js") -Destination $distRoot

Write-Output "Built worker and client assets in $distRoot"
