## Fórmula do dia

`saldo do dia = trabalhado − devido`, onde:

- **Dia útil normal**: devido = jornada vigente; trabalhado pelo cálculo da seção _Jornada_.
- **Falta** (dia útil com obrigação, sem registro nem afastamento): saldo negativo igual ao devido — desde que posterior ao **primeiro login** do funcionário e à data de início de produção.
- **Feriado, afastamento, cessão, isento**: 0 (neutro).
- **Sábado / domingo / feriado trabalhado**: horas × multiplicador (padrão **100% / 200% / 200%**).

## Ciclos

O ciclo vai do último marco (mais a tolerância de fechamento) até o próximo. O dia da virada **já pertence ao ciclo novo**. Na zeragem, o saldo é encerrado (relatório do ciclo assinado) e o banco recomeça.

## Limites e vigência

`bancoHorasLimiteMin` (120 min) limita o acúmulo; `bancoHorasVigenciaDias` (30) define a validade. Estagiário e jovem aprendiz não acumulam banco.

## Liberação do RH

- Mínimo de **15 min** por liberação, validade padrão de 180 dias.
- Debita o saldo do banco **na data da liberação** (linha no extrato) e cria um crédito que sobrevive à zeragem.
- O abono só **consome** o crédito (alocação por liberação, mais antigas primeiro); revogar devolve ao banco o que não foi usado.
- Status que seguram o crédito enquanto o abono está em andamento: `PENDENTE`, `AGUARDANDO_RH`, `APROVADA`.

## Regra de datas

Todas as datas civis são **Brasília** (`YYYY-MM-DD`); somar dias usa UTC para não sofrer com horário de verão. Marcos com dia inválido (31/02) são ajustados ao último dia do mês.
