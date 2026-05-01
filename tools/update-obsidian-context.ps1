param(
  [string]$RepoRoot = "",
  [switch]$Open
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$VaultDir = Join-Path $RepoRoot "docs\obsidian"
$SnapshotPath = Join-Path $VaultDir "10-SNAPSHOT-AUTOMATICO.md"

if (-not (Test-Path -LiteralPath $VaultDir)) {
  New-Item -ItemType Directory -Path $VaultDir | Out-Null
}

Set-Location -LiteralPath $RepoRoot

function Invoke-Git {
  param([string[]]$Arguments)

  $result = & git @Arguments 2>$null
  if ($LASTEXITCODE -ne 0) {
    return @()
  }

  return @($result)
}

function To-CodeBlock {
  param([string[]]$Lines)

  if ($null -eq $Lines -or $Lines.Count -eq 0) {
    return @("``````text", "(nenhum)", "``````")
  }

  return @("``````text") + $Lines + @("``````")
}

function To-RelativePath {
  param([string]$Path)

  $relative = Resolve-Path -LiteralPath $Path -Relative
  return $relative -replace "^\.[\\/]", ""
}

$generatedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
$branch = (Invoke-Git @("branch", "--show-current") | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($branch)) {
  $branch = "(sem branch detectada)"
}

$lastCommit = (Invoke-Git @("log", "-1", "--format=%h %ad %s", "--date=short") | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($lastCommit)) {
  $lastCommit = "(sem commit detectado)"
}

$status = Invoke-Git @("status", "--short")
$trackedChanges = Invoke-Git @("diff", "--name-only")
$stagedChanges = Invoke-Git @("diff", "--cached", "--name-only")

$topLevel = Get-ChildItem -LiteralPath $RepoRoot -Force |
  Where-Object { $_.Name -ne ".git" } |
  Sort-Object @{ Expression = "PSIsContainer"; Descending = $true }, Name |
  ForEach-Object {
    if ($_.PSIsContainer) {
      "[dir]  $($_.Name)"
    } else {
      "[file] $($_.Name)"
    }
  }

$largestFiles = Get-ChildItem -LiteralPath $RepoRoot -Recurse -File -Force |
  Where-Object { $_.FullName -notmatch "\\.git\\" } |
  Sort-Object Length -Descending |
  Select-Object -First 12 |
  ForEach-Object {
    $relative = To-RelativePath $_.FullName
    "{0,8:N2} MB  {1}" -f ($_.Length / 1MB), $relative
  }

$htmlFiles = Get-ChildItem -LiteralPath $RepoRoot -Filter "*.html" -File |
  Sort-Object Name |
  ForEach-Object { $_.Name }

$jsCount = (Get-ChildItem -LiteralPath (Join-Path $RepoRoot "js") -Filter "*.js" -File -ErrorAction SilentlyContinue | Measure-Object).Count
$cssCount = (Get-ChildItem -LiteralPath (Join-Path $RepoRoot "css") -Filter "*.css" -File -ErrorAction SilentlyContinue | Measure-Object).Count
$obsidianNotes = Get-ChildItem -LiteralPath $VaultDir -Filter "*.md" -File |
  Sort-Object Name |
  ForEach-Object { "[[$($_.BaseName)]]" }

$lines = @(
  "# Snapshot Automatico",
  "",
  "> Gerado por ``tools/update-obsidian-context.ps1`` em $generatedAt.",
  "> Nao edite esta nota manualmente; rode o script novamente para atualizar.",
  "",
  "## Leitura Recomendada",
  "",
  "1. [[00-INICIO]]",
  "2. [[01-CONTEXTO-ATUAL]]",
  "3. [[03-DECISOES]]",
  "4. Nota da area em trabalho: [[06-FICHA]], [[07-MESA]], [[08-REGRAS]] ou [[05-DEPLOY]]",
  "",
  "## Git",
  "",
  "- Branch: ``$branch``",
  "- Ultimo commit: ``$lastCommit``",
  "",
  "### Alteracoes Locais",
  ""
) + (To-CodeBlock $status) + @(
  "",
  "### Arquivos Modificados Sem Stage",
  ""
) + (To-CodeBlock $trackedChanges) + @(
  "",
  "### Arquivos Em Stage",
  ""
) + (To-CodeBlock $stagedChanges) + @(
  "",
  "## Paginas Principais",
  ""
) + ($htmlFiles | ForEach-Object { "- ``$_``" }) + @(
  "",
  "## Contagem Rapida",
  "",
  "- JavaScript em ``js/``: $jsCount arquivo(s)",
  "- CSS em ``css/``: $cssCount arquivo(s)",
  "- Notas Obsidian: $($obsidianNotes.Count) arquivo(s)",
  "",
  "## Notas Do Vault",
  ""
) + ($obsidianNotes | ForEach-Object { "- $_" }) + @(
  "",
  "## Estrutura De Raiz",
  ""
) + (To-CodeBlock $topLevel) + @(
  "",
  "## Maiores Arquivos Locais",
  "",
  "Use esta lista para evitar publicar arquivos pesados sem necessidade.",
  ""
) + (To-CodeBlock $largestFiles) + @(
  "",
  "## Comando De Atualizacao",
  "",
  "``````powershell",
  ".\tools\update-obsidian-context.ps1",
  "``````"
)

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($SnapshotPath, (($lines -join "`n") + "`n"), $utf8NoBom)
Write-Host "Snapshot atualizado: $SnapshotPath"

if ($Open) {
  Invoke-Item -LiteralPath $SnapshotPath
}
