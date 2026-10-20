## Dados pessoais tratados

| Categoria        | Exemplos                                                         | Finalidade                                                 |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Identificação    | nome, matrícula, CPF, e-mail, foto de perfil                     | Identificar o trabalhador no ponto e nos arquivos fiscais. |
| Vínculo          | cargo, gerência, categoria, jornada, datas                       | Gestão de pessoal e cálculo de jornada.                    |
| Ponto            | marcações, localização (GPS), foto da marcação, IP e dispositivo | Registro de jornada e comprovação.                         |
| Saúde (sensível) | atestados, CID, exames ocupacionais                              | Abonos, afastamentos e saúde ocupacional.                  |
| Família/endereço | dependentes, endereço residencial                                | Benefícios e validação de home office.                     |

**Base legal**: cumprimento de obrigação legal e execução de contrato/vínculo (Portaria MTP 671/2021, CLT), com tratamento de dados de saúde para tutela da saúde e obrigação legal. _(Parecer jurídico e DPO devem confirmar.)_

## Minimização e exposição

- **Verificação pública** mostra apenas o mínimo (nome mascarado, datas, hash).
- **Exames ocupacionais** ficam em **área privada** (`UPLOAD_PRIVATE_DIR`), servidos por rota autenticada e autorizada. **Atenção:** atestados, documentos enviados ao RH, fotos de ponto, anexos de requisições e PDFs finais ficam em `/uploads/**`, hoje servido como arquivo estático **sem autenticação** (ver _Modelo de ameaças_, achado A1).
- **CID** só é visível a quem precisa (RH e o próprio funcionário).
- **Geolocalização** é coletada **no momento do registro** e para validar o perímetro; não há rastreamento contínuo.
- **Fotos**: opcionais por modo de registro; a primeira vira foto de perfil.
- **Logs**: a trilha de auditoria **não grava** senhas, tokens, segredos nem a foto em base64 (chaves sensíveis são redigidas).
- **Segredos e certificados**: fora do repositório e fora das respostas da API.

## Direitos do titular e transparência

- **Termos de Uso e Política de Privacidade** versionados, com aceite individual registrado.
- O trabalhador acessa seus comprovantes, histórico, folhas assinadas e aceites.

## Retenção

Marcações e eventos do livro do REP são **guardados no mínimo 5 anos** e não podem ser apagados. Demais dados seguem a política do CFO; não há expurgo automático hoje.

## Incidentes

Acesso indevido é rastreável pelo `AuditLog` (usuário, IP, rota, tempo) e pelo `X-Trace-Id`. O procedimento de resposta está no _Runbook_.
