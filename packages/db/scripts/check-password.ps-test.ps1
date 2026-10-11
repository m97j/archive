#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$wrapperPath = Join-Path $PSScriptRoot 'check-password.ps1'
$fixturePath = Join-Path $PSScriptRoot 'fixtures/check-password-output.mjs'
$savedFixtureMode = $env:ARCHIVE_DB_TEST_OUTPUT

# Replace only the input prompt and child file resolution, leaving real process/pipe handling intact.
function Read-Host {
    param([string]$Prompt, [switch]$AsSecureString)
    return (ConvertTo-SecureString 'synthetic-test-password' -AsPlainText -Force)
}
function Join-Path {
    param([string]$Path, [string]$ChildPath)
    if ($ChildPath -eq 'check-password.mjs') { return $fixturePath }
    return (Microsoft.PowerShell.Management\Join-Path -Path $Path -ChildPath $ChildPath)
}

try {
    foreach ($case in @(
        @{ Mode = 'success'; Expected = 'SUCCESS:' },
        @{ Mode = 'auth-failure'; Expected = 'AUTH_FAILED:' },
        @{ Mode = 'tls-failure'; Expected = 'TLS_ERROR:' },
        @{ Mode = 'unexpected'; Expected = 'CHECK_FAILED: no recognized status received' }
    )) {
        $env:ARCHIVE_DB_TEST_OUTPUT = $case.Mode
        $transcript = (& $wrapperPath *>&1 | Out-String)
        if (-not $transcript.Contains($case.Expected)) {
            throw "FAIL: expected status not visible for $($case.Mode)."
        }
        if ($transcript.Contains('synthetic-test-password') -or $transcript.Contains('Unexpected raw diagnostic')) {
            throw 'FAIL: raw output or synthetic credential leaked.'
        }
        if ($case.Mode -eq 'success' -and $transcript.Contains('Not confirmed')) {
            throw 'FAIL: success was marked unconfirmed.'
        }
        if ($case.Mode -ne 'success' -and -not $transcript.Contains('Not confirmed')) {
            throw 'FAIL: unsuccessful exit was not reported.'
        }
        Write-Output "PASS: $($case.Mode) output forwarded/sanitized."
    }
} finally {
    $env:ARCHIVE_DB_TEST_OUTPUT = $savedFixtureMode
}
