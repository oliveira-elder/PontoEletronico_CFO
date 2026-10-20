Visão de **contexto** (C4 nível 1): quem usa o sistema e com quais sistemas externos ele conversa.

```mermaid
flowchart LR
  F[Funcionário] -->|navegador / celular| P((Sistema de Ponto<br/>Eletrônico CFO))
  G[Gestor / chefe] --> P
  R[RH e Gerente de RH] --> P
  S[Super Admin / TI] --> P
  A[Auditor / fiscalização] -.->|verificação pública<br/>e arquivos AFD/AEJ| P
  P <-->|OIDC / JWT| K[Keycloak<br/>SSO institucional]
  P -->|API de ramais| E[Ramais / Active Directory]
  P -->|chamados, SSO| GL[GLPI]
  P -->|e-mail SMTP| M[Servidor de e-mail]
  P -->|UDP 123| N[NTP.br<br/>Hora Legal Brasileira]
  P -->|feriados, webhook| X[Sistemas externos<br/>API pública]
  MON[MonitorSistema] -->|polling de backup| P
  P -->|eventos de auditoria| MON
```

## Responsabilidades

| Elemento       | Papel                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| Keycloak       | Autentica o usuário e emite o token; o sistema só **valida** tokens, nunca guarda senhas. |
| Ramais/AD      | Origem do cadastro de pessoas e da hierarquia (gestores).                                 |
| GLPI           | Abertura/vínculo de chamados e SSO.                                                       |
| NTP.br         | Referência de hora para garantir variação máxima de 30 s (Anexo IX, item 2).              |
| MonitorSistema | Agenda e recebe os backups; recebe eventos de auditoria.                                  |
| Fiscalização   | Recebe AFD/AEJ/Atestado e pode conferir documentos na página pública de verificação.      |
