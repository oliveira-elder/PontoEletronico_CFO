## Espelho e comprovante

- PDFs são gerados no **servidor**; o navegador só exibe.
- O visualizador do sistema exibe o documento em área protegida; os PDFs saem com **permissões restritas** (sem edição) e, quando selados, qualquer alteração invalida a assinatura PAdES.
- O **comprovante** (A6) tem número `CRP-NSR-hash`, hash completo em blocos legíveis para conferência por OCR, QR Code com selo HMAC e carimbo "Assinado digitalmente".
- Cada página do Espelho carrega selo (registro, página, total) que impede remontar páginas.

## Verificação sem exposição

A verificação por arquivo calcula o SHA-256 **no navegador**; o arquivo não precisa ser enviado. Para conferência de conteúdo, só o **texto extraído** (ou o texto do OCR) é enviado, limitado a 400 linhas de 600 caracteres.

## Uploads

| Item                | Controle                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Tamanho             | Corpo máximo de 15 MB (aplicação e nginx).                                                        |
| Imagens             | Normalizadas e redimensionadas (até 1600×2400, JPEG) quando a biblioteca `sharp` está disponível. |
| PDFs                | Gravados como recebidos, com nome gerado pelo servidor.                                           |
| Nomes               | Gerados pelo servidor; o nome enviado pelo usuário é guardado só como metadado de exibição.       |
| Exames ocupacionais | Diretório privado, entrega por rota autenticada.                                                  |
| Demais anexos       | Diretório `/uploads` (ver achado A1 em _Modelo de ameaças_).                                      |

## Marca d'água e desfoque

Documentos de visualização no sistema podem exibir marca d'água com o usuário e o horário, e as telas protegem o conteúdo (desfoque fora de foco) para reduzir captura casual. Essas proteções **dissuadem**, não impedem cópia por quem tem acesso legítimo.
