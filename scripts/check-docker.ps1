param(
    [Parameter(Mandatory = $true)]
    [string]$ImagePath,
    [string]$BaseUrl = "http://127.0.0.1:5174",
    [string]$ExpectedClass = "",
    [string]$ExpectedBin = ""
)

$ErrorActionPreference = "Stop"
$resolvedImage = (Resolve-Path -LiteralPath $ImagePath).Path
$endpoint = $BaseUrl.TrimEnd("/") + "/api/v1/detections"
$curlCommand = Get-Command curl.exe -ErrorAction Stop
$curlArgs = @(
    "--silent", "--show-error", "--fail-with-body",
    "--max-time", "30", "--form", "image=@$resolvedImage", $endpoint
)

$responseLines = & $curlCommand.Source @curlArgs
if ($LASTEXITCODE -ne 0) {
    throw "Detection request failed: $($responseLines -join [Environment]::NewLine)"
}

$response = ($responseLines -join [Environment]::NewLine) | ConvertFrom-Json
if ($response.Status -ne "success" -or $null -eq $response.Data) {
    throw "Expected Status=success and a Data object."
}
if ($response.Data.image_width -le 0 -or $response.Data.image_height -le 0) {
    throw "Expected positive image dimensions."
}
if ($null -eq $response.Data.detections) {
    throw "Expected a detections array."
}

foreach ($detection in $response.Data.detections) {
    if (@($detection.bbox).Count -ne 4) {
        throw "Expected four bbox coordinates."
    }
    if ($detection.confidence -lt 0 -or $detection.confidence -gt 1) {
        throw "Expected confidence in the range 0..1."
    }
}

if ($ExpectedClass) {
    $matching = @($response.Data.detections | Where-Object class_name -eq $ExpectedClass)
    if ($matching.Count -eq 0) {
        throw "Expected class '$ExpectedClass' was not detected."
    }
    if ($ExpectedBin -and -not ($matching | Where-Object bin -eq $ExpectedBin)) {
        throw "Expected bin '$ExpectedBin' for class '$ExpectedClass'."
    }
} elseif ($ExpectedBin) {
    throw "Specify ExpectedClass when checking ExpectedBin."
}

Write-Output "PASS: $endpoint"
$response.Data | ConvertTo-Json -Depth 8
