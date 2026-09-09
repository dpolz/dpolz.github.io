param([int]$Port = 4173)

$ErrorActionPreference = "Stop"
$publicRoot = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) "public"))
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Output "Local: http://127.0.0.1:$Port/"

$types = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".svg" = "image/svg+xml"
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $requestLine = $reader.ReadLine()
    while ($reader.ReadLine()) { }
    $requestPath = ($requestLine -split " ")[1]
    $relative = ([System.Uri]::UnescapeDataString(($requestPath -split "\?")[0])).TrimStart("/")
    if ([string]::IsNullOrWhiteSpace($relative)) { $relative = "index.html" }
    $target = [System.IO.Path]::GetFullPath((Join-Path $publicRoot $relative))
    if (-not $target.StartsWith($publicRoot + [System.IO.Path]::DirectorySeparatorChar) -or -not (Test-Path -LiteralPath $target -PathType Leaf)) {
      $header = "HTTP/1.1 404 Not Found`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $client.Close()
      continue
    }
    $bytes = [System.IO.File]::ReadAllBytes($target)
    $extension = [System.IO.Path]::GetExtension($target)
    $contentType = $types[$extension]
    $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush()
    $client.Close()
  }
} finally {
  $listener.Stop()
}
