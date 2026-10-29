<#
  set-dev-secrets.ps1 - guarda os segredos de desenvolvimento do Worker
  CIFRADOS fora do OneDrive, e deixa o .dev.vars com valores de brinquedo.

  POR QUE ESTE SCRIPT EXISTE
  --------------------------
  `cloudflare/.dev.vars` guardava JWT_SECRET, PASSWORD_PEPPER e
  MASTER_BOOTSTRAP_PASSWORD em texto puro. O arquivo esta no .gitignore, entao
  nunca foi parar no repositorio - mas a pasta do projeto fica dentro do
  OneDrive, e texto puro dentro do OneDrive e texto puro sincronizado para a
  nuvem. Pendencia aberta em 2026-08-25 (Etapa 121).

  Mesmo cofre e mesma tecnica do set-online-credentials.ps1: DPAPI via
  Export-Clixml, com a chave derivada da sua conta do Windows nesta maquina.
  O arquivo resultante fica em %LOCALAPPDATA%, e inutil em outra maquina ou
  para outro usuario, e nunca contem os valores legiveis.

  A COPIA VEM PRIMEIRO, SEMPRE
  ----------------------------
  Um secret do Cloudflare NAO pode ser lido de volta depois de gravado. Se o
  .dev.vars for a unica copia do PASSWORD_PEPPER de producao e ele sumir,
  nenhuma senha de jogador pode mais ser verificada - o PBKDF2 mistura o
  pepper dentro de cada hash gravado no D1 (cloudflare/src/auth.js:35).
  Por isso `-Trocar` se recusa a rodar se o cofre ainda nao existir.

  USO
  ---
    .\tools\set-dev-secrets.ps1 -Guardar    # cifra o .dev.vars atual no cofre
    .\tools\set-dev-secrets.ps1 -Trocar     # troca o .dev.vars por brinquedos
    .\tools\set-dev-secrets.ps1 -Conferir   # lista o que esta no cofre (sem valores)
    .\tools\set-dev-secrets.ps1 -Restaurar  # devolve os valores reais ao .dev.vars
    .\tools\set-dev-secrets.ps1 -Apagar     # remove o cofre
#>
[CmdletBinding()]
param(
  [switch]$Guardar,
  [switch]$Trocar,
  [switch]$Conferir,
  [switch]$Restaurar,
  [switch]$Apagar
)

$ErrorActionPreference = "Stop"

$raiz     = Split-Path -Parent $PSScriptRoot
$devVars  = Join-Path $raiz "cloudflare\.dev.vars"
$pasta    = Join-Path $env:LOCALAPPDATA "armagedom"
$cofre    = Join-Path $pasta "dev-vars.xml"

# Valores de brinquedo para `wrangler dev --local`. Sao deliberadamente
# obvios: se um deles aparecer num log, num print ou numa resposta da API,
# da para ver de longe que nao e segredo de producao.
$brinquedos = [ordered]@{
  JWT_SECRET                = "dev-local-jwt-nao-e-segredo"
  PASSWORD_PEPPER           = "dev-local-pepper-nao-e-segredo"
  MASTER_BOOTSTRAP_PASSWORD = "mestre-local-123"
}

function Ler-DevVars {
  if (-not (Test-Path $devVars)) {
    throw "Nao achei $devVars"
  }
  $mapa = [ordered]@{}
  foreach ($linha in Get-Content $devVars) {
    if ($linha -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $mapa[$Matches[1]] = $Matches[2]
    }
  }
  return $mapa
}

function Gravar-DevVars {
  param([System.Collections.IDictionary]$Mapa, [string]$Cabecalho)

  $linhas = @()
  if ($Cabecalho) { $linhas += $Cabecalho.Split("`n") }
  foreach ($chave in $Mapa.Keys) { $linhas += "$chave=$($Mapa[$chave])" }
  Set-Content -Path $devVars -Value $linhas -Encoding utf8
}

if ($Apagar) {
  if (Test-Path $cofre) {
    Remove-Item $cofre -Force
    Write-Host "Cofre removido." -ForegroundColor Green
  } else {
    Write-Host "Nao havia cofre para remover." -ForegroundColor Yellow
  }
  exit 0
}

if ($Conferir) {
  if (-not (Test-Path $cofre)) {
    Write-Host "Nenhum segredo guardado." -ForegroundColor Yellow
    Write-Host "Rode: .\tools\set-dev-secrets.ps1 -Guardar"
    exit 1
  }
  $dados = Import-Clixml $cofre
  Write-Host "Cofre: $cofre" -ForegroundColor DarkGray
  Write-Host "Guardado em: $($dados.SalvoEm)" -ForegroundColor DarkGray
  foreach ($chave in $dados.Segredos.Keys) {
    Write-Host "  $chave  (cifrado, DPAPI)" -ForegroundColor DarkGray
  }
  Write-Host "Os valores nao sao exibidos - nem este script os le em texto." -ForegroundColor DarkGray
  exit 0
}

if ($Restaurar) {
  if (-not (Test-Path $cofre)) { throw "Nao existe cofre para restaurar." }
  $dados = Import-Clixml $cofre
  $mapa = [ordered]@{}
  foreach ($chave in $dados.Segredos.Keys) {
    $cred = New-Object System.Management.Automation.PSCredential($chave, $dados.Segredos[$chave])
    $mapa[$chave] = $cred.GetNetworkCredential().Password
  }
  Gravar-DevVars -Mapa $mapa
  Write-Host "Valores reais devolvidos a cloudflare/.dev.vars." -ForegroundColor Green
  Write-Host "ATENCAO: o arquivo voltou a ser texto puro dentro do OneDrive." -ForegroundColor Yellow
  Write-Host "Rode -Trocar de novo assim que terminar o que precisava." -ForegroundColor Yellow
  exit 0
}

if ($Trocar) {
  if (-not (Test-Path $cofre)) {
    Write-Host "Cofre inexistente - nao vou sobrescrever o .dev.vars." -ForegroundColor Red
    Write-Host "Um secret do Cloudflare nao pode ser lido de volta: este arquivo" -ForegroundColor Red
    Write-Host "pode ser a unica copia que resta. Rode -Guardar primeiro." -ForegroundColor Red
    exit 1
  }
  $cabecalho = @"
# Valores de BRINQUEDO, so para "wrangler dev --local".
# Os segredos reais de producao estao cifrados (DPAPI) em
#   %LOCALAPPDATA%\armagedom\dev-vars.xml
# Veja tools\set-dev-secrets.ps1 (-Conferir / -Restaurar).
#
# MASTER_BOOTSTRAP_PASSWORD abaixo precisa bater com a variavel de ambiente
# ARMAGEDON_LOCAL_MASTER_PASSWORD usada pelos testes locais.
"@
  Gravar-DevVars -Mapa $brinquedos -Cabecalho $cabecalho
  Write-Host "cloudflare/.dev.vars agora so tem valores de brinquedo." -ForegroundColor Green
  Write-Host "Senha do mestre local: $($brinquedos.MASTER_BOOTSTRAP_PASSWORD)" -ForegroundColor Cyan
  exit 0
}

# Padrao: -Guardar
$atual = Ler-DevVars
if ($atual.Count -eq 0) { throw "cloudflare/.dev.vars nao tem nenhuma chave." }

$seguros = [ordered]@{}
foreach ($chave in $atual.Keys) {
  $seguros[$chave] = ConvertTo-SecureString -String $atual[$chave] -AsPlainText -Force
}

New-Item -ItemType Directory -Force -Path $pasta | Out-Null
@{ Segredos = $seguros; SalvoEm = (Get-Date).ToString("s") } | Export-Clixml -Path $cofre -Force

Write-Host ""
Write-Host "Cifrado em: $cofre" -ForegroundColor Green
Write-Host "Fora do OneDrive, fora do repositorio, ilegivel em outra maquina." -ForegroundColor Green
foreach ($chave in $seguros.Keys) { Write-Host "  $chave" -ForegroundColor DarkGray }
Write-Host ""
Write-Host "Agora rode:  .\tools\set-dev-secrets.ps1 -Trocar" -ForegroundColor Cyan
