/** Texto da versão 1 dos Termos de Uso (modelo para revisão do RH e do jurídico antes de publicar). */
export const TITULO_TERMO_PADRAO = "Termos de Uso do Sistema de Ponto Eletrônico do CFO";

export const TEXTO_TERMO_PADRAO = `# TERMOS DE USO DO SISTEMA DE PONTO ELETRÔNICO DO CONSELHO FEDERAL DE ODONTOLOGIA

## 1. Objeto
Estes Termos regem o uso do Sistema de Ponto Eletrônico do Conselho Federal de Odontologia (CFO), programa de registro eletrônico de ponto via programa (REP-P) e de tratamento do registro de ponto (PTRP), nos termos da Portaria MTP nº 671/2021 (arts. 72 a 96) e do art. 74 da CLT.

## 2. Aceite
O uso do sistema depende do aceite destes Termos. O aceite é pessoal, registrado com **nome, matrícula, data e hora (Brasília), endereço IP e navegador**, e vale para esta versão. Toda nova versão exige novo aceite. Enquanto o aceite estiver pendente, o **registro de ponto permanece disponível** e as demais funções ficam bloqueadas.

## 3. Acesso e credenciais
O acesso é individual e intransferível, pelo login institucional. É proibido emprestar a senha, registrar ponto por outra pessoa ou permitir que outra pessoa registre por você. O uso indevido pode caracterizar falta disciplinar e crime de falsidade.

## 4. Registro de ponto
- **Hora oficial:** cada marcação usa a hora do servidor, sincronizada com a Hora Legal Brasileira (Observatório Nacional), com variação máxima de 30 segundos. O relógio exibido na tela segue essa hora, não a do seu aparelho.
- **Livro imutável:** cada marcação recebe um NSR (Número Sequencial de Registro) e um código hash SHA-256 encadeado, gravados em livro que não pode ser alterado nem apagado.
- **Local da prestação:** conforme o modo de trabalho, a marcação pode registrar a localização (GPS), a foto e a rede/IP, apenas para confirmar o local da prestação do serviço.
- **Sem restrições:** o sistema não restringe horário de marcação, não marca ponto automaticamente e não exige autorização prévia para sobrejornada.
- **Comprovante:** após cada marcação é emitido o Comprovante de Registro de Ponto do Trabalhador (PDF assinado), disponível na hora; os comprovantes das últimas 48 horas, no mínimo, podem ser baixados a qualquer tempo.

## 5. Tratamento do ponto e correções
Esquecimentos e correções são feitos por solicitação (ajuste de ponto, abono, atestado, férias e outras), analisada pelo chefe e pelo RH. **A marcação original nunca é alterada:** a correção aparece como marcação incluída ou desconsiderada, com o motivo, no Espelho de Ponto e no Arquivo Eletrônico de Jornada (AEJ). As regras de cálculo (jornada, intervalo mínimo de almoço, tolerâncias, interjornada, banco de horas e multiplicadores) seguem as Configurações do RH e os acordos coletivos vigentes, aplicadas só no cálculo, sem alterar os horários registrados.

## 6. Assinaturas eletrônicas
O sistema registra as seguintes assinaturas:
- Espelho de Ponto mensal: assinatura do funcionário e do chefe;
- relatório do ciclo de banco de horas: assinatura do funcionário;
- atestado médico: ciência do chefe;
- documentos de férias (aviso e recibo): assinatura do funcionário;
- aceite destes Termos.

Cada assinatura grava nome, data e hora, endereço IP, rede de saída e navegador, e gera um **código de verificação (SHA-256)**. Os documentos levam nº de registro, QR Code selado, fundo de segurança e marca d'água, e podem receber o **selo ICP-Brasil (e-CNPJ do CFO)**. Os comprovantes de ponto e os arquivos AFD/AEJ são assinados com certificado ICP-Brasil. As assinaturas feitas no sistema são assinaturas eletrônicas válidas nos termos da MP nº 2.200-2/2001 (art. 10, § 2º) e da Lei nº 14.063/2020. Ao assinar, você reconhece a autoria e a integridade do documento (não repúdio).

## 7. Verificação de autenticidade
Qualquer documento assinado pode ser conferido em **ponto.cfo.org.br/verificar**, pelo código, pelo QR Code ou pelo envio do arquivo. Cópias convertidas ou editadas não são reconhecidas como originais.

## 8. Fiscalização
O sistema gera o Arquivo Fonte de Dados (AFD), o Arquivo Eletrônico de Jornada (AEJ) e o Espelho de Ponto para a Inspeção do Trabalho, conforme a Portaria MTP nº 671/2021.

## 9. Dados pessoais (LGPD)
O CFO trata nome, CPF, matrícula, cargo, lotação, marcações, localização, foto, endereço IP e dados do dispositivo para cumprir obrigação legal de controle de jornada (Lei nº 13.709/2018, art. 7º, II) e executar a relação de trabalho (art. 7º, V). Os registros são guardados pelo prazo legal (no mínimo 5 anos) e acessados apenas por você, sua chefia imediata e o RH. A verificação pública mostra só dados mínimos. Seus direitos de titular podem ser exercidos junto ao Encarregado de Dados do CFO.

## 10. Visualização protegida
Os documentos exibidos na tela levam marca d'água com o nome de quem visualiza, e a tela pode ser desfocada em tentativas de captura. A cópia ou a divulgação indevida é proibida.

## 11. Indisponibilidade
Interrupções do serviço ficam registradas. Se não conseguir registrar o ponto, informe o RH e regularize por solicitação de ajuste.

## 12. Alterações
Estes Termos podem ser atualizados. Cada versão fica guardada no histórico, e a nova versão só passa a valer para você após o novo aceite.

## 13. Contato
Dúvidas: Setor de Gestão de Pessoas (RH) do CFO.
`;
