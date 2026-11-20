[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ScriptArgs
)

$scriptPath = Join-Path $PSScriptRoot "bundle-context.ts"
& bun.cmd run $scriptPath @ScriptArgs
exit $LASTEXITCODE
