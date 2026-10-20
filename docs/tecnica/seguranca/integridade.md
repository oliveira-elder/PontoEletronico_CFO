## Livro do REP imutável

- `MarcacaoRep` e `EventoRep` são **somente inclusão**: gatilhos do PostgreSQL rejeitam `UPDATE`, `DELETE` e `TRUNCATE` (Portaria 671, art. 74, IV; Anexo IX, item 7).
- O **NSR** vem de `ContadorNsr` por `UPDATE … RETURNING` na mesma transação da marcação: sem lacunas, sem repetição, mesmo com concorrência.
- **Hash SHA-256 encadeado**: cada marcação = SHA-256(NSR + tipo 7 + data/hora da marcação + CPF + data/hora da gravação + coletor + on/off-line + hash anterior). Qualquer alteração em qualquer linha quebra todas as seguintes.
- **Verificação**: refaz a cadeia na subida e uma vez por dia. Quebra → **bloqueia novas marcações** (503) e registra o NSR da primeira divergência.
- **Marcação original preservada**: correções não apagam nada; o AEJ indica o que foi desconsiderado ("D") e incluído ("I") com motivo. Marcações **reconstituídas** (carga inicial do histórico) são marcadas como tal e aparecem em avisos.

## Relógio

A hora gravada é **sempre a do servidor**. O servidor confere a Hora Legal Brasileira (NTP.br) a cada 5 minutos; desvio confirmado acima de 30 s bloqueia marcações. Saltos do relógio geram evento tipo 4 no livro.

## Instância única

A identidade da VM é registrada; uma **segunda instância** gravando no mesmo livro bloqueia marcações para impedir NSR duplicado.

## Assinaturas digitais

| Artefato                                                    | Mecanismo                                                                                                                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Espelho de Ponto concluído, comprovante, relatório do ciclo | **PAdES** com o e-CNPJ A1 (ICP-Brasil), aplicado a um PDF **congelado** (fingerprint dos dados; hash SHA-256 guardado).                                                     |
| AFD e AEJ                                                   | **CAdES destacado** (`.p7s`), SHA-256, política **AD-RB v2.3**, com atributos assinados (messageDigest, signingTime, signingCertificateV2, signaturePolicyId).              |
| Assinaturas do funcionário e do chefe                       | Registro com data, **IP real**, IP do gateway, _user agent_ e identificador do usuário; valem como assinatura eletrônica avançada nos termos da MP 2.200-2 e da Lei 14.063. |
| QR Codes e selos de página                                  | **HMAC** com segredo do servidor (`DOC_SEAL_SECRET`).                                                                                                                       |

O certificado e a senha ficam **fora do repositório**, em volume somente leitura. O painel mostra apenas validade e titular — nunca o conteúdo do certificado.

## Impressão digital de documentos

Todo PDF assinado entra em `DocumentoEmitido` (SHA-256). Versões substituídas deixam de ser servidas; só o hash permanece em `pdfHistorico`, o que mantém a verificação de cópias antigas.

## Alta disponibilidade

Banco único em uma VM: a disponibilidade e a guarda dos 5 anos dependem de infraestrutura e backup (itens 6, 8.1 e 13 do Anexo IX permanecem pendentes de infraestrutura).
