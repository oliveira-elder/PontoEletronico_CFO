## Subir ou atualizar

```bash
./scripts/docker-up.sh --build     # reconstrói e sobe: postgres → backend → web → nginx
docker compose up -d backend       # só o backend (após mudar o código)
docker compose restart web         # só o front-end
./scripts/docker-logs-backend.sh   # acompanhar o backend
```

## O que o backend faz na subida (`docker/backend-entrypoint.sh`)

1. Instala dependências **se o hash do `package-lock.json` mudou**.
2. `prisma generate`.
3. `prisma db push --accept-data-loss` (pode ser desligado com `DOCKER_SKIP_DB_PUSH=true`). Mudanças **aditivas** são seguras; remover colunas/tabelas apaga dados — revisar antes.
4. Seed inicial (uma vez, marcado por arquivo).
5. Atualiza o **cache do JWKS** do Keycloak; sem rede, usa o arquivo local.
6. `npm run build` e inicia `node dist/main.js`; se o build falhar, usa o `dist` anterior ou o modo watch.
7. Ao iniciar a aplicação: garante os gatilhos do livro do REP, o contador de NSR, registra a instância, confere o NSR exportado, verifica a cadeia de hash e dispara a primeira medição NTP.

## Checklist de virada para produção

1. Certificado **e-CNPJ A1** instalado em `deploy/icp` (fora do Git) e variáveis de caminho/senha configuradas; conferir validade no painel.
2. **Registro no INPI** concluído; número e certificado informados em _REP-P_.
3. Rede liberando **UDP 123** para o NTP.br; painel do relógio "sincronizado".
4. `DOC_SEAL_SECRET`, `JWT_SECRET` e chaves de integração **fortes e exclusivas**.
5. Backup agendado e **restauração testada**.
6. Termos de Uso publicados.
7. Iniciar a operação do REP-P (_Configurações → REP-P → Iniciar operação_).
8. Definir o **Start** do sistema (data de início de produção).

## Versionamento

A versão do sistema vem do `package.json`; a versão desta documentação está no topo da página e sobe automaticamente quando o código muda.
