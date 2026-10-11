#requires -Version 7.0
[CmdletBinding()]
param(
    [switch]$Apply,
    [string]$SupabaseUrl = 'https://spffrdgttkhlwgosuvix.supabase.co'
)

$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -CommandType Application -ErrorAction Stop
$bootstrapScript = Join-Path $PSScriptRoot 'grant-admin.mjs'
if (-not (Test-Path -LiteralPath $bootstrapScript -PathType Leaf)) {
    throw 'The bootstrap script is missing.'
}

Write-Host 'Use Authentication > Users to find the exact account UUID. Do not paste a JWT.'
Write-Host "Project: $SupabaseUrl"
if ($Apply) {
    Write-Host 'APPLY: this run grants archive_admin to the account after UUID/email verification.'
} else {
    Write-Host 'DRY RUN: this run checks the account without changing it.'
}
$adminUserId = Read-Host 'Administrator user UUID'
$adminEmail = Read-Host 'Expected account email'
$adminSecret = Read-Host 'Supabase secret key (sb_secret_...; legacy service_role also supported)' -AsSecureString

$bootstrapStart = [System.Diagnostics.ProcessStartInfo]::new()
$bootstrapStart.FileName = $nodeCommand.Source
$bootstrapStart.UseShellExecute = $false
$bootstrapStart.CreateNoWindow = $true
$bootstrapStart.ArgumentList.Add($bootstrapScript)
if ($Apply) { $bootstrapStart.ArgumentList.Add('--apply') }
$bootstrapStart.Environment['ARCHIVE_BOOTSTRAP_SUPABASE_URL'] = $SupabaseUrl
$bootstrapStart.Environment['ARCHIVE_BOOTSTRAP_USER_ID'] = $adminUserId
$bootstrapStart.Environment['ARCHIVE_BOOTSTRAP_EXPECTED_EMAIL'] = $adminEmail

$bootstrapProcess = $null
$secretPointer = [IntPtr]::Zero
try {
    # The secret exists briefly in process memory, never in argv, the parent environment, or a file.
    $secretPointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecret)
    $bootstrapStart.Environment['ARCHIVE_BOOTSTRAP_SUPABASE_SECRET_KEY'] =
        [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
    $bootstrapProcess = [System.Diagnostics.Process]::Start($bootstrapStart)
    $bootstrapProcess.WaitForExit()
    if ($bootstrapProcess.ExitCode -ne 0) {
        throw 'Bootstrap did not succeed. Review the sanitized message above; do not share the secret.'
    }
} finally {
    [void]$bootstrapStart.Environment.Remove('ARCHIVE_BOOTSTRAP_SUPABASE_SECRET_KEY')
    if ($secretPointer -ne [IntPtr]::Zero) {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    }
    if ($bootstrapProcess) { $bootstrapProcess.Dispose() }
    $adminSecret.Dispose()
}
