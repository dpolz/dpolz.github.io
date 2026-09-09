param()

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot

foreach ($size in @(192, 512)) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#101c2c"))
  $scale = $size / 512.0
  $white = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), (28 * $scale)
  $cyan = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml("#21bdd1")), (26 * $scale)
  $lime = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml("#a8d92d")), (22 * $scale)
  foreach ($pen in @($white, $cyan, $lime)) { $pen.StartCap = $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round }
  $graphics.DrawLine($white, 128 * $scale, 351 * $scale, 384 * $scale, 351 * $scale)
  $graphics.DrawLine($white, 157 * $scale, 351 * $scale, 177 * $scale, 247 * $scale)
  $graphics.DrawLine($white, 177 * $scale, 247 * $scale, 227 * $scale, 205 * $scale)
  $graphics.DrawLine($white, 227 * $scale, 205 * $scale, 285 * $scale, 205 * $scale)
  $graphics.DrawLine($white, 285 * $scale, 205 * $scale, 335 * $scale, 247 * $scale)
  $graphics.DrawLine($white, 335 * $scale, 247 * $scale, 355 * $scale, 351 * $scale)
  $graphics.DrawLine($white, 171 * $scale, 351 * $scale, 171 * $scale, 386 * $scale)
  $graphics.DrawLine($white, 341 * $scale, 351 * $scale, 341 * $scale, 386 * $scale)
  $graphics.DrawLine($cyan, 180 * $scale, 300 * $scale, 181 * $scale, 300 * $scale)
  $graphics.DrawLine($cyan, 331 * $scale, 300 * $scale, 332 * $scale, 300 * $scale)
  $graphics.DrawLine($lime, 256 * $scale, 96 * $scale, 256 * $scale, 154 * $scale)
  $path = Join-Path $projectRoot "icon-$size.png"
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $white.Dispose(); $cyan.Dispose(); $lime.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

Write-Output "Generated PWA icons."
