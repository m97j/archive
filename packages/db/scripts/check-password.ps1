#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('session', 'direct', 'transaction')]
    [string]$Mode = 'session',
    [string]$CertificatePath
)

$ErrorActionPreference = 'Stop'
$nodeCommand = @(Get-Command node -CommandType Application -ErrorAction Stop)[0]
$checkScript = Join-Path $PSScriptRoot 'check-password.mjs'

# Resolve dependencies before requesting a credential. No connection is attempted here.
& $nodeCommand.Source $checkScript --check-dependency
if ($LASTEXITCODE -ne 0) { throw 'Dependency check failed. No password was requested.' }
$certificateFile = $null
if ($CertificatePath) {
    $certificateFile = (Resolve-Path -LiteralPath $CertificatePath -ErrorAction Stop).Path
    if (-not (Test-Path -LiteralPath $certificateFile -PathType Leaf)) {
        throw 'CertificatePath must point to a certificate file.'
    }
}

Write-Host "Project spffrdgttkhlwgosuvix; connection mode: $Mode"
Write-Host 'One attempt only. Read-only query; no database/account changes.'
Write-Host 'Enter the original DATABASE password, not a URL-encoded value or API key.'
$databaseSecret = Read-Host 'Database password (hidden)' -AsSecureString
$checkStart = New-Object System.Diagnostics.ProcessStartInfo
$checkStart.FileName = $nodeCommand.Source
# The single argument is a known file path, never a credential.
$checkStart.Arguments = '"' + $checkScript + '"'
$checkStart.UseShellExecute = $false
$checkStart.CreateNoWindow = $true
$checkStart.RedirectStandardInput = $true
$checkStart.RedirectStandardOutput = $true
$checkStart.RedirectStandardError = $true
$checkStart.EnvironmentVariables['ARCHIVE_DB_CHECK_MODE'] = $Mode.ToLowerInvariant()
if ($certificateFile) {
    $checkStart.EnvironmentVariables['ARCHIVE_DB_CHECK_CA_FILE'] = $certificateFile
} else {
    $checkStart.EnvironmentVariables.Remove('ARCHIVE_DB_CHECK_CA_FILE')
}

$checkProcess = $null
$secretPointer = [IntPtr]::Zero
$passwordText = $null
$inputJson = $null
$inputBytes = $null
try {
    # Plaintext exists briefly in process memory; it is not placed in argv/env/files.
    $secretPointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($databaseSecret)
    $passwordText = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
    $inputJson = ConvertTo-Json -InputObject @{ password = $passwordText } -Compress
    $checkProcess = [System.Diagnostics.Process]::Start($checkStart)
    # Read both pipes concurrently to avoid deadlocks and missing output in desktop PowerShell.
    $outputTask = $checkProcess.StandardOutput.ReadToEndAsync()
    $errorTask = $checkProcess.StandardError.ReadToEndAsync()
    # Write UTF-8 bytes directly; StandardInputEncoding is unavailable on some .NET Framework versions.
    $inputBytes = [System.Text.Encoding]::UTF8.GetBytes($inputJson)
    $checkProcess.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length)
    $checkProcess.StandardInput.BaseStream.Flush()
    $checkProcess.StandardInput.BaseStream.Close()
    [Array]::Clear($inputBytes, 0, $inputBytes.Length)
    $passwordText = $null
    $inputJson = $null
    if (-not $checkProcess.WaitForExit(35000)) {
        $checkProcess.Kill()
        throw 'TIMEOUT: check stopped. Password correctness is unknown.'
    }
    $childOutput = $outputTask.GetAwaiter().GetResult()
    $childError = $errorTask.GetAwaiter().GetResult()
    $statusShown = $false
    foreach ($line in (($childOutput + "`n" + $childError) -split '\r?\n')) {
        # Forward only our sanitized status lines, never raw driver errors or stack traces.
        if ($line -match '^(SUCCESS|AUTH_FAILED|INPUT_ERROR|DNS_ERROR|NETWORK_ERROR|TLS_ERROR|TIMEOUT|BLOCKED|CHECK_FAILED|DEPENDENCY_MISSING): ') {
            Write-Host $line
            $statusShown = $true
        }
    }
    if (-not $statusShown) {
        Write-Host 'CHECK_FAILED: no recognized status received; password correctness is unknown.'
    }
    if ($checkProcess.ExitCode -ne 0) {
        Write-Host 'Not confirmed. Read the sanitized status above; do not share the password.'
    }
} finally {
    $passwordText = $null
    $inputJson = $null
    if ($inputBytes) { [Array]::Clear($inputBytes, 0, $inputBytes.Length) }
    if ($secretPointer -ne [IntPtr]::Zero) {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    }
    if ($checkProcess) {
        if (-not $checkProcess.HasExited) { $checkProcess.Kill() }
        $checkProcess.Dispose()
    }
    $databaseSecret.Dispose()
}
