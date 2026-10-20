Rotinas agendadas com `@nestjs/schedule`, descobertas no código. Horários em cron; "Brasília" indica fuso explícito.

Além dos `@Cron`, há rotinas de **início e periódicas**: verificação da cadeia de hash do REP (subida e diária), medição NTP (a cada 5 minutos), "tique" do relógio do REP (a cada minuto, detecta saltos), carga inicial do livro (uma vez), sincronização de eventos de empresa/empregados antes de cada AFD.

Falha em uma rotina é registrada no log e não derruba a aplicação.
