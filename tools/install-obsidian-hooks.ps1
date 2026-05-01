param(
  [string]$RepoRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
Set-Location -LiteralPath $RepoRoot

git config core.hooksPath .githooks
$hooksPath = git config --get core.hooksPath

if ($hooksPath -ne ".githooks") {
  throw "Nao foi possivel configurar core.hooksPath para .githooks"
}

Write-Host "Hooks do Obsidian configurados para este repositorio: $hooksPath"
