## Parâmetros (Configurações → Sistema)

| Parâmetro                     | Padrão                                    | Uso                                                                                                 |
| ----------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Jornada diária / semanal      | 480 min / 2.400 min                       | Jornada devida (histórico de jornadas por funcionário prevalece).                                   |
| Horário nominal               | 08:00–17:00                               | Base do arredondamento por tolerância.                                                              |
| Janela de ponto               | 06:00–23:59                               | Fora dela o registro é recusado.                                                                    |
| Tolerância de entrada / saída | 5 / 5 min                                 | Simétrica (±): dentro dela o cálculo usa o horário nominal. O horário **exibido** permanece o real. |
| Tolerância de hora extra      | 10 min                                    | Só excedente maior vira hora extra.                                                                 |
| Janela do almoço              | início entre 11:30 e 13:00                | Pausa/encerramento ficam bloqueados na janela.                                                      |
| Almoço mínimo / máximo        | 60 / 90 min                               | Mínimo obrigatório no cálculo.                                                                      |
| Interjornada                  | 660 min (11 h)                            | Bloqueia nova ENTRADA (CLT art. 66); 0 desliga.                                                     |
| Intervalos do art. 71         | > 6 h: almoço; > 4 h até o limite: 15 min | `intervaloLongoAcimaDeMin`, `intervaloCurtoAcimaDeMin`, `intervaloCurtoMinMin`.                     |
| Híbrido                       | 2 dias/semana                             | `hibridoMaxDiasSemana`.                                                                             |
| ACT                           | "ACT 2026-2028"                           | Rótulo exibido no Espelho (jornada reduzida pelo acordo).                                           |

## Cálculo das horas trabalhadas do dia

1. Soma os trechos entre as batidas (entrada→saída, descontando intervalos e pausas).
2. **Almoço mínimo**: o intervalo vale pelo menos `almocoMinMin`, contado do início registrado. Se o funcionário voltar antes, o horário registrado é preservado na tela, mas o cálculo só retoma o expediente em _início + mínimo_. Excesso até _mínimo + tolerância de entrada_ também conta como mínimo.
3. **Sem almoço registrado** (saída direta): o sistema completa Início/Fim de duração zero e **deduz o mínimo** no cálculo — com anotação "Intervalo não registrado — N min deduzidos".
4. **Tolerância**: entrada/saída próximas do horário nominal são "encaixadas" nele (±N min), só no cálculo.
5. **Atestado parcial**: créditos de deslocamento na ida e na volta (limitados pela tolerância configurada).
6. **Exemplo**: entrada 08:00, almoço 12:00–12:10, saída 17:00 → o almoço conta 60 min (mínimo); trabalhado = 9 h − 1 h = 8 h.

## Regras de fechamento do cálculo (uma só conta para Histórico, Banco, Auditoria e Folha)

- **Carga corrida** (estagiário, jovem aprendiz e turnos sem almoço): marcações de Início/Fim de intervalo **não descontam** nada; conta o tempo entre a entrada e a saída (pausas por Interromper/Reiniciar continuam descontando).
- **Dia incompleto** (almoço iniciado sem retorno e sem saída): conta só o trabalho comprovado, **até o início do almoço, sem desconto extra** do mínimo; o dia fica "Inconsistente" até a correção.
- **Antes do primeiro acesso:** as **horas** de batidas existentes contam normalmente; só a **falta** (dia sem registro) não é gerada.
- **Resumo gravado das folhas** (dias, horas e saldo do banco no fim do mês): atualizado pela rotina "Recalcular resumos" para as folhas **não concluídas**; folhas concluídas são documentos assinados e não são alteradas.

## Ciclo completo de batidas

Dia em casa (home office/híbrido) ou presencial, a partir da data configurada, só é "OK" com **Entrada → almoço fechado → Saída**, mais pares extras fechados e em ordem. Intervalos automáticos de duração zero não contam como batida real.

## Feriados e dias especiais

Feriados (nacionais, distritais, facultativos, manuais) vêm de `FeriadoConfig`, importados automaticamente em 1º de dezembro (ano seguinte) e 1º de janeiro. Feriado pode bloquear o ponto todo o dia ou **só antes/depois de um horário**. Abono do RH não é feriado. Feriado, afastamento, cessão e dia isento são **neutros**.
