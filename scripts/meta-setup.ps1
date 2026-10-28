# Exchanges a short-lived Graph API Explorer token for a long-lived Page token
# and writes the META_* values into .env. Secrets are prompted for, never stored in this file.
#
# Usage (from the project root):  powershell -ExecutionPolicy Bypass -File .\scripts\meta-setup.ps1

$ErrorActionPreference = "Stop"

$appId   = "1657999485980569"
$version = "v26.0"
$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"

function ConvertTo-PlainText([Security.SecureString]$secure) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Invoke-Graph([string]$url) {
    try {
        Invoke-RestMethod $url
    } catch {
        $detail = $_.ErrorDetails.Message
        if (-not $detail) { $detail = $_.Exception.Message }
        throw "Graph API request failed: $detail"
    }
}

function Set-EnvValue([string]$content, [string]$key, [string]$value) {
    $line = "$key=`"$value`""
    $pattern = "(?m)^$key=[^\r\n]*"
    if ($content -match $pattern) {
        return [regex]::Replace($content, $pattern, { param($m) $line })
    }
    $nl = if ($content -match "`r`n") { "`r`n" } else { "`n" }
    return $content.TrimEnd() + $nl + $line + $nl
}

if (-not (Test-Path $envPath)) { throw ".env not found at $envPath" }

$appSecret = ConvertTo-PlainText (Read-Host "App Secret (hidden)" -AsSecureString)
$shortToken = ConvertTo-PlainText (Read-Host "Short-lived token from Graph API Explorer (hidden)" -AsSecureString)

Write-Host "Exchanging for a long-lived user token..."
$exchangeUrl = "https://graph.facebook.com/$version/oauth/access_token" +
    "?grant_type=fb_exchange_token&client_id=$appId" +
    "&client_secret=$([uri]::EscapeDataString($appSecret))" +
    "&fb_exchange_token=$([uri]::EscapeDataString($shortToken))"
$longToken = (Invoke-Graph $exchangeUrl).access_token

Write-Host "Fetching Pages..."
$pages = @((Invoke-Graph "https://graph.facebook.com/$version/me/accounts?access_token=$longToken").data)
if ($pages.Count -eq 0) {
    throw "No Pages returned. Regenerate the token and select your Page in the Facebook dialog."
}

if ($pages.Count -eq 1) {
    $page = $pages[0]
} else {
    for ($i = 0; $i -lt $pages.Count; $i++) { Write-Host "[$i] $($pages[$i].name) ($($pages[$i].id))" }
    $page = $pages[[int](Read-Host "Which Page number")]
}

$ig = Invoke-Graph "https://graph.facebook.com/$version/$($page.id)?fields=instagram_business_account&access_token=$($page.access_token)"
$igId = $ig.instagram_business_account.id
if (-not $igId) {
    Write-Warning "No Instagram business account linked to '$($page.name)'. META_IG_USER_ID will be left unchanged."
}

$content = [IO.File]::ReadAllText($envPath)
$content = Set-EnvValue $content "META_GRAPH_API_VERSION" $version
$content = Set-EnvValue $content "META_PAGE_ID" $page.id
$content = Set-EnvValue $content "META_PAGE_ACCESS_TOKEN" $page.access_token
if ($igId) { $content = Set-EnvValue $content "META_IG_USER_ID" $igId }
[IO.File]::WriteAllText($envPath, $content, (New-Object Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "Updated $envPath"
Write-Host "  Page:  $($page.name) ($($page.id))"
Write-Host "  IG ID: $igId"
Write-Host "  Token: saved (not displayed)"
