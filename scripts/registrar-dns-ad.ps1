#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Cria/atualiza o registro A ponto.cfo.local no DNS do Active Directory (uma vez na rede).

.EXAMPLE
  .\registrar-dns-ad.ps1 -IPv4Address 192.168.161.50
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string] $ZoneName = "cfo.local",

  [Parameter(Mandatory = $false)]
  [string] $RecordName = "ponto",

  [Parameter(Mandatory = $true)]
  [string] $IPv4Address
)

$ErrorActionPreference = "Stop"
$Fqdn = "$RecordName.$ZoneName"

Import-Module DnsServer -ErrorAction Stop

if (-not (Get-DnsServerZone -Name $ZoneName -ErrorAction SilentlyContinue)) {
  throw "Zona DNS '$ZoneName' não encontrada neste controlador. Execute no DC correto ou crie a zona."
}

$existing = Get-DnsServerResourceRecord -ZoneName $ZoneName -Name $RecordName -RRType A -ErrorAction SilentlyContinue
if ($existing) {
  Remove-DnsServerResourceRecord -ZoneName $ZoneName -Name $RecordName -RRType A -RecordData $existing.RecordData -Force
  Write-Host "Registro A antigo removido: $Fqdn"
}

Add-DnsServerResourceRecordA -ZoneName $ZoneName -Name $RecordName -IPv4Address $IPv4Address -CreatePtr
Write-Host "OK: $Fqdn → $IPv4Address"
Write-Host "Aguarde alguns segundos e teste em um PC cliente: nslookup $Fqdn"
