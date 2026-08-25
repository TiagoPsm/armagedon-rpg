<#
  set-online-credentials.ps1 - guarda as credenciais do smoke de producao
  CIFRADAS, sem senha em texto puro em lugar nenhum.

  POR QUE ESTE SCRIPT EXISTE
  --------------------------
  A primeira versao (Etapa 120) lia as senhas de um `.env` na raiz. Resolveu o
  atrito, mas deixou duas copias em TEXTO PURO no disco - e a pasta do projeto
  fica dentro do OneDrive, entao esse texto puro era sincronizado para a nuvem.

  Aqui a senha e cifrada com DPAPI (Export-Clixml de um PSCredential): a chave
  e derivada da sua conta do Windows nesta maquina. O arquivo resultante:

    - fica em %LOCALAPPDATA%, FORA do OneDrive e FORA do repositorio;
    - e inutil se copiado para outra maquina ou aberto por outro usuario;
    - nunca contem a senha legivel, nem para voce.

  A digitacao e oculta (Get-Credential) e nao entra no historico do PowerShell.

  USO
  ---
    .\tools\set-online-credentials.ps1           # cadastra ou atualiza
    .\tools\set-online-credentials.ps1 -Conferir # so diz o que ja esta salvo
    .\tools\set-online-credentials.ps1 -Apagar   # remove o cofre

  Depois disso: npm run test:online
#>
[CmdletBinding()]
param(
  [switch]$Conferir,
  [switch]$Apagar
)

$ErrorActionPreference = "Stop"

$pasta = Join-Path $env:LOCALAPPDATA "armagedom"
$cofre = Join-Path $pasta "online-credentials.xml"

function Mostrar-Estado {
  if (-not (Test-Path $cofre)) {
    Write-Host "Nenhuma credencial salva." -ForegroundColor Yellow
    Write-Host "Rode: .\tools\set-online-credentials.ps1"
    return $false
  }
  $dados = Import-Clixml $cofre
  Write-Host "Cofre: $cofre" -ForegroundColor DarkGray
  Write-Host "  mestre:  $($dados.Master.UserName)" -ForegroundColor DarkGray
  Write-Host "  jogador: $($dados.Player.UserName)" -ForegroundColor DarkGray
  Write-Host "  (as senhas estao cifradas com DPAPI; nem este script as le em texto)" -ForegroundColor DarkGray
  return $true
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
  if (Mostrar-Estado) { exit 0 } else { exit 1 }
}

# Pergunta SEMPRE no console, nunca em caixa grafica.
#
# A primeira versao usava Get-Credential. No Windows 11 ele abre a
# "Solicitacao de credenciais do Windows" (CredUI) como janela separada - e
# essa janela apareceu no Alt+Tab do Tiago sem aceitar foco, deixando o script
# parado num pedido de senha que ninguem conseguia responder. Read-Host
# -AsSecureString pergunta na propria janela onde o comando foi digitado:
# digitacao oculta do mesmo jeito, sem janela nova para se perder.
function Pedir-Credencial {
  param([string]$Titulo, [string]$UsuarioPadrao)

  Write-Host ""
  Write-Host $Titulo -ForegroundColor Cyan
  $usuario = Read-Host "  usuario (Enter para '$UsuarioPadrao')"
  if ([string]::IsNullOrWhiteSpace($usuario)) { $usuario = $UsuarioPadrao }

  $senha = Read-Host "  senha (nao aparece na tela)" -AsSecureString
  if ($senha.Length -eq 0) {
    Write-Host "  Senha vazia - cancelado." -ForegroundColor Yellow
    exit 1
  }
  return New-Object System.Management.Automation.PSCredential($usuario, $senha)
}

Write-Host "Credenciais do smoke de PRODUCAO" -ForegroundColor Cyan
Write-Host "A senha nao aparece na tela nem no historico do PowerShell." -ForegroundColor DarkGray

$master = Pedir-Credencial -Titulo "1) Conta do MESTRE" -UsuarioPadrao "mestre"
$player = Pedir-Credencial -Titulo "2) Conta do JOGADOR de teste (descartavel, nunca a de um jogador real)" -UsuarioPadrao "teste"

New-Item -ItemType Directory -Force -Path $pasta | Out-Null

# Export-Clixml cifra o SecureString com DPAPI (usuario + maquina).
@{ Master = $master; Player = $player } | Export-Clixml -Path $cofre -Force

# Cinto e suspensorio: tentar restringir a ACL para so o dono ler o arquivo.
#
# E BEST-EFFORT de proposito. Reescrever a ACL pede o privilegio
# SeSecurityPrivilege, que uma sessao comum nao tem - e na primeira versao
# isso derrubava o script DEPOIS de gravar o cofre (ErrorActionPreference =
# Stop), deixando o usuario achando que nada tinha sido salvo. A protecao que
# importa e o DPAPI: o conteudo ja e ilegivel para outro usuario ou outra
# maquina, com ou sem esta ACL. O %LOCALAPPDATA% tambem ja e por usuario.
try {
  $acl = Get-Acl $cofre
  $acl.SetAccessRuleProtection($true, $false)
  $acl.Access | ForEach-Object { [void]$acl.RemoveAccessRule($_) }
  $regra = New-Object System.Security.AccessControl.FileSystemAccessRule(
    [System.Security.Principal.WindowsIdentity]::GetCurrent().Name,
    "FullControl", "Allow")
  $acl.AddAccessRule($regra)
  Set-Acl -Path $cofre -AclObject $acl -ErrorAction Stop
  $aclOk = $true
} catch {
  $aclOk = $false
}

Write-Host ""
Write-Host "Salvo e cifrado em: $cofre" -ForegroundColor Green
Write-Host "Fora do OneDrive, fora do repositorio, ilegivel em outra maquina." -ForegroundColor Green
if (-not $aclOk) {
  Write-Host "(A ACL extra nao pode ser aplicada nesta sessao - precisa de privilegio" -ForegroundColor DarkGray
  Write-Host " elevado. Nao faz falta: o conteudo ja e cifrado por DPAPI.)" -ForegroundColor DarkGray
}
Write-Host ""
Write-Host "Agora rode:  npm run test:online" -ForegroundColor Cyan

$envAntigo = Join-Path (Split-Path -Parent $PSScriptRoot) ".env"
if (Test-Path $envAntigo) {
  Write-Host ""
  Write-Host "ATENCAO: ainda existe um .env com senha em TEXTO PURO na raiz." -ForegroundColor Yellow
  Write-Host "Agora que o cofre existe, ele nao e mais necessario. Para apagar:" -ForegroundColor Yellow
  Write-Host "  Remove-Item .env"
}
