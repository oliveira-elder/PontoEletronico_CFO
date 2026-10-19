# Certificado e-CNPJ A1 (ICP-Brasil)

Esta pasta é montada somente-leitura no backend (`/app/deploy/icp`). Nada daqui vai para o git,
exceto este arquivo.

## O que colocar

| Arquivo     | Conteúdo                                                               |
| ----------- | ---------------------------------------------------------------------- |
| `ecnpj.pfx` | Certificado e-CNPJ A1 do CFO (arquivo .pfx / .p12 com a chave privada) |
| `senha.txt` | Somente a senha do certificado, em uma linha, sem espaços extras       |

Permissões sugeridas no servidor: `chmod 600 ecnpj.pfx senha.txt`.

## Depois de colocar os arquivos

```
docker compose up -d backend
```

## O que passa a funcionar

- AFD e AEJ saem com o `.p7s` (CAdES destacado, política AD-RB v2.3 da ICP-Brasil).
- Os PDFs do Espelho de Ponto recebem o selo institucional (PAdES).
- Configurações → Institucional mostra a validade e o titular do certificado.

## Outros nomes ou caminhos

Defina `ICP_A1_PFX_PATH` e `ICP_A1_PFX_PASSPHRASE_FILE` no `.env` da raiz (caminhos dentro do container).
