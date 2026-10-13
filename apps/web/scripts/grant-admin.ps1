#requires -Version 7.0
[CmdletBinding()]
param(
    [switch]$Apply,
    [string]$SupabaseUrl = 'https://spffrdgttkhlwgosuvix.supabase.co'
)

$ErrorActionPreference = 'Stop'
# Compatibility entry point. The canonical CMS script retains hidden secret input.
$cmsBootstrap = Join-Path $PSScriptRoot '..\..\cms\scripts\grant-admin.ps1'
& $cmsBootstrap @PSBoundParameters
