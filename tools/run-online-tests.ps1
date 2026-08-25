<#
  run-online-tests.ps1 - roda o smoke de PRODUCAO sem senha em texto puro.

  POR QUE ESTE SCRIPT EXISTE
  --------------------------
  `npm run test:mesa:online` precisa de usuario e senha de mestre e de um
  jogador no ambiente. Sem eles o spec se pula sozinho - e foi assim que ele
  ficou parado de 2026-08-16 a 2026-08-25, nove dias, enquanto DOIS bugs que
  so apareciam em producao (Etapas 118 e 119) passavam batido por toda a suite
  local. O problema nunca foi a falta de teste; foi o atrito de montar quatro
  variaveis de ambiente a cada terminal novo.

  DE ONDE VEM A SENHA (nesta ordem)
  ---------------------------------
  1. COFRE CIFRADO (recomendado) - %LOCALAPPDATA%\armagedom\online-credentials.xml,
     cifrado com DPAPI pela sua conta do Windows. Fora do OneDrive, fora do
     repositorio, ilegivel em outra maquina.
     Cadastre com: .\tools\set-online-credentials.ps1
  2. Variaveis ja definidas no ambiente - o caminho de CI, onde os segredos vem
     do cofre do proprio servico (GitHub Secrets, por exemplo).
  3. Arquivo .env na raiz - TEXTO PURO, e a pasta do projeto fica dentro do
     OneDrive: essa copia sincroniza para a nuvem. Continua funcionando por
     compatibilidade, mas avisa em vermelho e deve ser migrado para o cofre.

  USO
  ---
    .\tools\run-online-tests.ps1              # roda tudo, com a sonda de relay
    .\tools\run-online-tests.ps1 -SemSonda    # sem a sonda de realtime
    .\tools\run-online-tests.ps1 -Conferir    # so mostra a origem, nao roda
#>
[CmdletBinding()]
param(
  [switch]$SemSonda,
  [switch]$Conferir
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$cofre = Join-Path (Join-Path $env:LOCALAPPDATA "armagedom") "online-credentials.xml"
$arquivoEnv = Join-Path $raiz ".env"

$obrigatorias = @(
  "ARMAGEDON_MASTER_USERNAME",
  "ARMAGEDON_MASTER_PASSWORD",
  "ARMAGEDON_PLAYER_USERNAME",
  "ARMAGEDON_PLAYER_PASSWORD"
)

$origem = $null

# --- 1. Cofre cifrado -------------------------------------------------------
if (Test-Path $cofre) {
  $dados = Import-Clixml $cofre
  # O SecureString so vira texto DENTRO deste processo, o tempo de repassar ao
  # Playwright. Nunca e escrito em disco nem impresso.
  $env:ARMAGEDON_MASTER_USERNAME = $dados.Master.UserName
  $env:ARMAGEDON_MASTER_PASSWORD = $dados.Master.GetNetworkCredential().Password
  $env:ARMAGEDON_PLAYER_USERNAME = $dados.Player.UserName
  $env:ARMAGEDON_PLAYER_PASSWORD = $dados.Player.GetNetworkCredential().Password
  $origem = "cofre cifrado (DPAPI) em $cofre"
}

# --- 2. Ambiente ja preenchido (CI) ----------------------------------------
if (-not $origem) {
  $faltando = $obrigatorias | Where-Object { -not (Get-Item "env:$_" -ErrorAction SilentlyContinue).Value }
  if ($faltando.Count -eq 0) { $origem = "variaveis de ambiente ja definidas" }
}

# --- 3. .env em texto puro (compatibilidade) -------------------------------
if (-not $origem -and (Test-Path $arquivoEnv)) {
  $carregadas = @()
  foreach ($linha in Get-Content $arquivoEnv) {
    $texto = $linha.Trim()
    if ($texto -eq "" -or $texto.StartsWith("#")) { continue }
    $corte = $texto.IndexOf("=")
    if ($corte -lt 1) { continue }
    $nome = $texto.Substring(0, $corte).Trim()
    $valor = $texto.Substring($corte + 1).Trim()
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
  $origem = ".env em TEXTO PURO na raiz do projeto"
}

if (-not $origem) {
  Write-Host "Nenhuma credencial encontrada." -ForegroundColor Yellow
  Write-Host "Cadastre uma vez, cifrado, com:" -ForegroundColor Yellow
  Write-Host "  .\tools\set-online-credentials.ps1"
  exit 1
}

# A sonda manda uma mensagem pelo relay e um traco pelo canal de desenho, e
# confere que os dois chegam ao jogador - depois apaga o traco. E a parte que
# prova o TRANSITO em producao, nao so a conexao. Ligada por padrao.
if ($SemSonda) { $env:ARMAGEDON_ONLINE_RELAY_PROBE = "0" }
else           { $env:ARMAGEDON_ONLINE_RELAY_PROBE = "1" }

# Nunca imprimir valor de senha - so a origem e o nome de usuario.
Write-Host "Credenciais: $origem" -ForegroundColor DarkGray
Write-Host "Mestre: $env:ARMAGEDON_MASTER_USERNAME  |  Jogador: $env:ARMAGEDON_PLAYER_USERNAME" -ForegroundColor DarkGray
Write-Host "Sonda de relay: $(if ($SemSonda) { 'desligada' } else { 'ligada' })" -ForegroundColor DarkGray

if ($origem -like ".env*") {
  Write-Host ""
  Write-Host "AVISO: suas senhas estao em texto puro no .env, dentro da pasta do" -ForegroundColor Red
  Write-Host "OneDrive - ou seja, sincronizadas para a nuvem. Migre para o cofre:" -ForegroundColor Red
  Write-Host "  .\tools\set-online-credentials.ps1   e depois   Remove-Item .env" -ForegroundColor Red
  Write-Host ""
}

if ($Conferir) {
  Write-Host "-Conferir: nada foi executado." -ForegroundColor DarkGray
  exit 0
}

Write-Host "Rodando contra PRODUCAO - faca isso fora de sessao de jogo." -ForegroundColor Cyan
Push-Location $raiz
try { & npm run test:mesa:online }
finally { Pop-Location }
