<#
  run-online-tests.ps1 - roda o smoke de PRODUCAO sem redigitar credenciais.

  POR QUE ESTE SCRIPT EXISTE
  --------------------------
  `npm run test:mesa:online` precisa de usuario e senha de mestre e de um
  jogador no ambiente. Sem eles o spec se pula sozinho - e foi assim que ele
  ficou parado de 2026-08-16 a 2026-08-25, nove dias, enquanto DOIS bugs que
  so apareciam em producao (Etapas 118 e 119) passavam batido por toda a
  suite local. O problema nunca foi a falta de teste; foi o atrito de montar
  quatro variaveis de ambiente a cada terminal novo.

  As credenciais ficam em `.env` na raiz, que e IGNORADO pelo git. Senha
  nenhuma entra no repositorio.

  USO
  ---
    .\tools\run-online-tests.ps1              # roda tudo, com a sonda de relay
    .\tools\run-online-tests.ps1 -SemSonda    # sem a sonda de realtime
    .\tools\run-online-tests.ps1 -Conferir    # so mostra o que carregou, nao roda

  Comece copiando `.env.example` para `.env` e preenchendo as senhas.
#>
[CmdletBinding()]
param(
  [switch]$SemSonda,
  [switch]$Conferir
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$arquivo = Join-Path $raiz ".env"

if (-not (Test-Path $arquivo)) {
  Write-Host "Falta o arquivo .env na raiz do projeto." -ForegroundColor Yellow
  Write-Host "Copie o modelo e preencha as senhas:" -ForegroundColor Yellow
  Write-Host "  Copy-Item .env.example .env"
  exit 1
}

$obrigatorias = @(
  "ARMAGEDON_MASTER_USERNAME",
  "ARMAGEDON_MASTER_PASSWORD",
  "ARMAGEDON_PLAYER_USERNAME",
  "ARMAGEDON_PLAYER_PASSWORD"
)

$carregadas = @()
foreach ($linha in Get-Content $arquivo) {
  $texto = $linha.Trim()
  if ($texto -eq "" -or $texto.StartsWith("#")) { continue }
  $corte = $texto.IndexOf("=")
  if ($corte -lt 1) { continue }
  $nome = $texto.Substring(0, $corte).Trim()
  $valor = $texto.Substring($corte + 1).Trim()
  # Aspas em volta do valor sao opcionais: senha com espaco funciona dos dois jeitos.
  if ($valor.Length -ge 2 -and (($valor.StartsWith('"') -and $valor.EndsWith('"')) -or
                                ($valor.StartsWith("'") -and $valor.EndsWith("'")))) {
    $valor = $valor.Substring(1, $valor.Length - 2)
  }
  if ($valor -eq "") { continue }
  Set-Item -Path "env:$nome" -Value $valor
  $carregadas += $nome
}

$faltando = $obrigatorias | Where-Object { $carregadas -notcontains $_ }
if ($faltando.Count -gt 0) {
  Write-Host "O .env nao tem (ou deixou vazio): $($faltando -join ', ')" -ForegroundColor Yellow
  Write-Host "Sem as quatro, o spec se pula sozinho e nao testa nada." -ForegroundColor Yellow
  exit 1
}

# A sonda manda uma mensagem pelo relay e um traco pelo canal de desenho, e
# confere que os dois chegam ao jogador - depois apaga o traco. E a parte que
# prova o TRANSITO em producao, nao so a conexao. Ligada por padrao.
if ($SemSonda) { $env:ARMAGEDON_ONLINE_RELAY_PROBE = "0" }
else           { $env:ARMAGEDON_ONLINE_RELAY_PROBE = "1" }

# Nunca imprimir valor de senha - so o nome do que foi carregado.
Write-Host "Credenciais carregadas do .env: $($carregadas -join ', ')" -ForegroundColor DarkGray
Write-Host "Sonda de relay: $(if ($SemSonda) { 'desligada' } else { 'ligada' })" -ForegroundColor DarkGray

if ($Conferir) {
  Write-Host "-Conferir: nada foi executado." -ForegroundColor DarkGray
  exit 0
}

Write-Host "Rodando contra PRODUCAO - faca isso fora de sessao de jogo." -ForegroundColor Cyan
Push-Location $raiz
try { & npm run test:mesa:online }
finally { Pop-Location }
