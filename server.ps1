# =========================================================
# ShareMax — High Speed Local Wi-Fi Web Server (.NET Sockets)
# Works 100% Offline over Phone Hotspot (0 KB Data)
# Non-Admin execution supported on any Windows PC
# =========================================================

$ErrorActionPreference = "Continue"

$RootDir = $PSScriptRoot
if (-not $RootDir) { $RootDir = Get-Location }
$SharedFilesDir = Join-Path $RootDir "shared_files"
$TextShareFile = Join-Path $RootDir "shared_text.json"

if (-not (Test-Path $SharedFilesDir)) { New-Item -ItemType Directory -Path $SharedFilesDir | Out-Null }
if (-not (Test-Path $TextShareFile)) { Set-Content -Path $TextShareFile -Value "[]" -Encoding UTF8 }

function Get-LocalIPAddress {
    $ip = $null
    try {
        $adapters = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | 
            Where-Object { 
                $_.IPAddress -notlike "127.*" -and 
                $_.IPAddress -notlike "169.254.*" -and
                $_.IPAddress -notlike "172.17.*"
            } | Select-Object -ExpandProperty IPAddress
        if ($adapters) {
            if ($adapters -is [array]) { $ip = $adapters[0] } else { $ip = $adapters }
        }
    } catch {}

    if (-not $ip) {
        try {
            $ipList = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | 
                Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.IPAddressToString -notlike '127.*' }
            if ($ipList) { $ip = $ipList[0].IPAddressToString }
        } catch {}
    }
    if (-not $ip) { $ip = "127.0.0.1" }
    return $ip
}

$Port = 8080
$LocalIP = Get-LocalIPAddress
$BaseUrl = "http://${LocalIP}:${Port}/"
$LocalhostUrl = "http://localhost:${Port}/"

$MimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css"
    ".js"   = "application/javascript"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".mp4"  = "video/mp4"
    ".webm" = "video/webm"
    ".mp3"  = "audio/mpeg"
    ".pdf"  = "application/pdf"
    ".zip"  = "application/zip"
    ".txt"  = "text/plain; charset=utf-8"
}

# Terminate previous instance if running
Get-Process -Name "powershell" -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID } | ForEach-Object {
    # soft cleanup
}

$tcpListener = $null
try {
    $tcpListener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
    $tcpListener.Start()
} catch {
    $Port = 8081
    $BaseUrl = "http://${LocalIP}:${Port}/"
    $LocalhostUrl = "http://localhost:${Port}/"
    $tcpListener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
    $tcpListener.Start()
}

Clear-Host
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "                ShareMax Local File Server                 " -ForegroundColor Green
Write-Host "             iOS 13 Style - 0 KB Mobile Data               " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " [!] CONNECT YOUR IPHONE / ANDROID / PC TO THE SAME HOTSPOT" -ForegroundColor Yellow
Write-Host ""
Write-Host " [>] Access ShareMax on Mobile / PC Browser at:" -ForegroundColor White
Write-Host "     $BaseUrl" -ForegroundColor Green -NoNewline; Write-Host "  (Scan QR on PC Screen!)" -ForegroundColor Gray
Write-Host "     http://localhost:${Port}/" -ForegroundColor DarkGray
Write-Host ""
Write-Host " [v] Shared files directory: $SharedFilesDir" -ForegroundColor DarkGray
Write-Host " [v] Server Running on Port $Port. Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

function Send-HttpResponse {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [int]$StatusCode = 200,
        [string]$StatusText = "OK",
        [string]$ContentType = "text/html; charset=utf-8",
        [byte[]]$BodyBytes = @(),
        [hashtable]$Headers = @{}
    )

    $headerStr = "HTTP/1.1 $StatusCode $StatusText`r`n"
    $headerStr += "Content-Type: $ContentType`r`n"
    $headerStr += "Content-Length: $($BodyBytes.Length)`r`n"
    $headerStr += "Access-Control-Allow-Origin: *`r`n"
    $headerStr += "Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE`r`n"
    $headerStr += "Access-Control-Allow-Headers: Content-Type, X-File-Name, X-File-Size`r`n"
    $headerStr += "Connection: close`r`n"

    foreach ($k in $Headers.Keys) {
        $headerStr += "$k`: $($Headers[$k])`r`n"
    }
    $headerStr += "`r`n"

    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($headerStr)
    try {
        $Stream.Write($headerBytes, 0, $headerBytes.Length)
        if ($BodyBytes.Length -gt 0) {
            $Stream.Write($BodyBytes, 0, $BodyBytes.Length)
        }
        $Stream.Flush()
    } catch {}
}

while ($true) {
    if ($tcpListener.Pending()) {
        try {
            $client = $tcpListener.AcceptTcpClient()
            [System.Threading.ThreadPool]::QueueUserWorkItem({
                param($cl)
                try {
                    $stream = $cl.GetStream()
                    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8, $false, 4096, $true)

                    $requestLine = $reader.ReadLine()
                    if ([string]::IsNullOrEmpty($requestLine)) { $cl.Close(); return }

                    $reqHeaderLines = @()
                    while ($true) {
                        $line = $reader.ReadLine()
                        if ([string]::IsNullOrEmpty($line)) { break }
                        $reqHeaderLines += $line
                    }

                    $reqTokens = $requestLine.Split(" ")
                    if ($reqTokens.Length -lt 2) { $cl.Close(); return }

                    $method = $reqTokens[0].ToUpper()
                    $rawUrl = [System.Uri]::UnescapeDataString($reqTokens[1])
                    $pathOnly = $rawUrl.Split("?")[0]

                    $reqHeaders = @{}
                    foreach ($hLine in $reqHeaderLines) {
                        $colonIdx = $hLine.IndexOf(":")
                        if ($colonIdx -gt 0) {
                            $hKey = $hLine.Substring(0, $colonIdx).Trim()
                            $hVal = $hLine.Substring($colonIdx + 1).Trim()
                            $reqHeaders[$hKey] = $hVal
                        }
                    }

                    if ($method -eq "OPTIONS") {
                        Send-HttpResponse -Stream $stream -StatusCode 200
                        $cl.Close()
                        return
                    }

                    if ($pathOnly -eq "/api/info") {
                        $fileCount = (Get-ChildItem -Path $SharedFilesDir -File | Measure-Object).Count
                        $json = @{
                            ip = $LocalIP
                            port = $Port
                            url = $BaseUrl
                            fileCount = $fileCount
                            status = "online"
                        } | ConvertTo-Json
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                        Send-HttpResponse -Stream $stream -ContentType "application/json" -BodyBytes $bytes
                        $cl.Close()
                        return
                    }

                    if ($pathOnly -eq "/api/files" -and $method -eq "GET") {
                        $files = Get-ChildItem -Path $SharedFilesDir -File | ForEach-Object {
                            @{
                                name = $_.Name
                                size = $_.Length
                                modified = $_.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
                                url = "/files/" + [System.Uri]::EscapeDataString($_.Name)
                                extension = $_.Extension.ToLower()
                            }
                        }
                        if (-not $files) { $files = @() }
                        $json = $files | ConvertTo-Json -Depth 3
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
                        Send-HttpResponse -Stream $stream -ContentType "application/json" -BodyBytes $bytes
                        $cl.Close()
                        return
                    }

                    if ($pathOnly -eq "/upload" -and $method -eq "POST") {
                        $contentLength = 0
                        if ($reqHeaders.ContainsKey("Content-Length")) {
                            [int]::TryParse($reqHeaders["Content-Length"], [ref]$contentLength) | Out-Null
                        }

                        $fileName = "Upload_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".bin"
                        if ($reqHeaders.ContainsKey("X-File-Name")) {
                            $fileName = [System.Uri]::UnescapeDataString($reqHeaders["X-File-Name"])
                        }
                        $fileName = [System.IO.Path]::GetFileName($fileName)
                        $targetPath = Join-Path $SharedFilesDir $fileName

                        $fileStream = [System.IO.File]::Create($targetPath)
                        $buffer = New-Object byte[] 65536
                        $bytesReadTotal = 0
                        while ($bytesReadTotal -lt $contentLength) {
                            $toRead = [Math]::Min(65536, $contentLength - $bytesReadTotal)
                            $readCount = $stream.Read($buffer, 0, $toRead)
                            if ($readCount -le 0) { break }
                            $fileStream.Write($buffer, 0, $readCount)
                            $bytesReadTotal += $readCount
                        }
                        $fileStream.Close()

                        Write-Host "[+] Received File: $fileName ($bytesReadTotal bytes)" -ForegroundColor Green

                        $respJson = @{ success = $true; filename = $fileName } | ConvertTo-Json
                        $bytes = [System.Text.Encoding]::UTF8.GetBytes($respJson)
                        Send-HttpResponse -Stream $stream -ContentType "application/json" -BodyBytes $bytes
                        $cl.Close()
                        return
                    }

                    if ($pathOnly -eq "/api/text") {
                        if ($method -eq "POST") {
                            $contentLength = 0
                            if ($reqHeaders.ContainsKey("Content-Length")) {
                                [int]::TryParse($reqHeaders["Content-Length"], [ref]$contentLength) | Out-Null
                            }
                            $bodyBytes = New-Object byte[] $contentLength
                            if ($contentLength -gt 0) {
                                $readTotal = 0
                                while ($readTotal -lt $contentLength) {
                                    $r = $stream.Read($bodyBytes, $readTotal, $contentLength - $readTotal)
                                    if ($r -le 0) { break }
                                    $readTotal += $r
                                }
                            }
                            $bodyText = [System.Text.Encoding]::UTF8.GetString($bodyBytes)

                            $existing = @()
                            if (Test-Path $TextShareFile) {
                                try { $existing = Get-Content -Path $TextShareFile -Raw | ConvertFrom-Json } catch { $existing = @() }
                            }
                            if ($existing -isnot [array]) { $existing = @($existing) }

                            $newEntry = @{
                                id = [guid]::NewGuid().ToString()
                                text = $bodyText
                                time = (Get-Date -Format "HH:mm:ss")
                            }
                            $updated = @($newEntry) + $existing | Select-Object -First 50
                            $updated | ConvertTo-Json -Depth 3 | Set-Content -Path $TextShareFile -Encoding UTF8

                            $bytes = [System.Text.Encoding]::UTF8.GetBytes('{"success":true}')
                            Send-HttpResponse -Stream $stream -ContentType "application/json" -BodyBytes $bytes
                            $cl.Close()
                            return
                        } else {
                            $content = "[]"
                            if (Test-Path $TextShareFile) { $content = Get-Content -Path $TextShareFile -Raw }
                            if (-not $content) { $content = "[]" }
                            $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
                            Send-HttpResponse -Stream $stream -ContentType "application/json" -BodyBytes $bytes
                            $cl.Close()
                            return
                        }
                    }

                    if ($pathOnly.StartsWith("/files/")) {
                        $subFile = $pathOnly.Substring(7)
                        $filePath = Join-Path $SharedFilesDir $subFile

                        if (Test-Path $filePath -PathType Leaf) {
                            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                            $mime = "application/octet-stream"
                            if ($MimeTypes.ContainsKey($ext)) { $mime = $MimeTypes[$ext] }

                            $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
                            Send-HttpResponse -Stream $stream -ContentType $mime -BodyBytes $fileBytes
                            $cl.Close()
                            return
                        } else {
                            Send-HttpResponse -Stream $stream -StatusCode 404 -StatusText "Not Found" -BodyBytes ([System.Text.Encoding]::UTF8.GetBytes("File Not Found"))
                            $cl.Close()
                            return
                        }
                    }

                    $relPath = $pathOnly.TrimStart('/')
                    if ([string]::IsNullOrWhiteSpace($relPath)) { $relPath = "index.html" }
                    $targetFile = Join-Path $RootDir $relPath

                    if (Test-Path $targetFile -PathType Leaf) {
                        $ext = [System.IO.Path]::GetExtension($targetFile).ToLower()
                        $mime = "application/octet-stream"
                        if ($MimeTypes.ContainsKey($ext)) { $mime = $MimeTypes[$ext] }
                        $bytes = [System.IO.File]::ReadAllBytes($targetFile)
                        Send-HttpResponse -Stream $stream -ContentType $mime -BodyBytes $bytes
                        $cl.Close()
                    } else {
                        Send-HttpResponse -Stream $stream -StatusCode 404 -StatusText "Not Found" -BodyBytes ([System.Text.Encoding]::UTF8.GetBytes("Not Found"))
                        $cl.Close()
                    }
                } catch {
                    try { $cl.Close() } catch {}
                }
            }, $client)
        } catch {}
    } else {
        Start-Sleep -Milliseconds 30
    }
}
