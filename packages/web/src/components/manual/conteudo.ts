import type { Capitulo } from "./tipos";

/** Conteúdo do Manual do Usuário. Linguagem simples; nenhum dado real. */
export const CAPITULOS: Capitulo[] = [
  {
    id: "primeiros-passos",
    titulo: "A. Primeiros passos",
    perfil: "todos",
    descricao: "Entrar, conhecer o menu e aceitar os Termos de Uso.",
    tarefas: [
      {
        id: "entrar",
        roteiro: "entrar",
        titulo: "Entrar e sair do sistema",
        perfil: "todos",
        resumo: "O acesso é feito com o mesmo usuário e senha da rede do CFO (login único).",
        antes: [
          "Use o endereço ponto.cfo.org.br no computador do CFO ou na VPN.",
          "Tenha o seu usuário e a senha institucional."
        ],
        passos: [
          "Abra o endereço do sistema no navegador. Você será levado à tela de login do CFO.",
          "Digite o seu usuário e a senha e confirme.",
          "Na primeira vez, leia e aceite os Termos de Uso.",
          "Para sair, use “Sair” no menu lateral. Em computador compartilhado, sempre saia ao terminar."
        ],
        resultado: "A página Início abre com o seu nome e o relógio do servidor.",
        problemas: [
          {
            problema: "Aparece “conta desativada”.",
            solucao: "Procure o RH: o seu cadastro está inativo."
          },
          {
            problema: "Aparece “sem matrícula”.",
            solucao: "O RH precisa cadastrar a sua matrícula antes do primeiro acesso."
          },
          {
            problema: "Aparece “cedido a outro órgão”.",
            solucao: "Durante a cessão o acesso fica suspenso; fale com o RH."
          }
        ],
        palavras: "login senha sso acesso sair logout"
      },
      {
        id: "menu",
        roteiro: "menu",
        titulo: "Conhecer o menu e a página Início",
        perfil: "todos",
        resumo:
          "O menu lateral leva às telas do sistema; ele fica recolhido e abre quando você passa o mouse.",
        passos: [
          "Passe o mouse sobre a barra vinho à esquerda: ela se abre e mostra o nome de cada tela.",
          "Início mostra a saudação, o seu estado do dia e os atalhos “Validar documento” e “Bater Ponto”.",
          "Registrar Ponto, Histórico, Folhas assinadas e Solicitações são as telas do dia a dia; o Manual do usuário é este guia.",
          "No topo, à direita: o sino (avisos), o seu nome, o botão de livro (ajuda: abre o manual na tela em que você está) e o escudo (Termos de uso).",
          "Aprovações, Gestão, Auditoria e Configurações só aparecem para quem tem esse acesso."
        ],
        ver: ["Notificações"],
        rota: "/ponto"
      },
      {
        id: "termos",
        roteiro: "termos",
        titulo: "Aceitar os Termos de Uso",
        perfil: "todos",
        resumo:
          "Sempre que o CFO publica uma versão nova dos termos, você precisa aceitar para continuar usando o sistema.",
        passos: [
          "Quando a janela dos Termos aparecer, role o texto até o fim.",
          "Clique em “Aceitar”. O seu aceite fica registrado com data, hora e dispositivo.",
          "Você pode rever o texto e o histórico dos seus aceites em Termos de Uso."
        ],
        problemas: [
          {
            problema: "O sistema não deixa abrir outras telas.",
            solucao: "Aceite os termos pendentes. O registro de ponto nunca é bloqueado."
          }
        ],
        rota: "/ponto/termos-uso"
      },
      {
        id: "notificacoes",
        roteiro: "notificacoes",
        titulo: "Ler as notificações",
        perfil: "todos",
        resumo:
          "O sino avisa o que precisa da sua atenção: solicitações decididas, folha para assinar, vencimentos.",
        passos: [
          "Clique no sino no topo da tela.",
          "Clique em uma notificação para ir direto à tela relacionada.",
          "Use a página Notificações para ver o histórico e marcar como lidas."
        ],
        rota: "/ponto/notificacoes"
      }
    ]
  },
  {
    id: "meu-ponto",
    titulo: "B. Meu ponto",
    perfil: "todos",
    descricao: "Registrar a jornada, ver comprovantes e entender as horas.",
    tarefas: [
      {
        id: "registrar",
        titulo: "Registrar o ponto",
        perfil: "todos",
        roteiro: "registrar-entrada",
        resumo: "Registre cada marcação no momento em que ela acontece. O horário é o do servidor.",
        antes: [
          "No modo celular ou em casa, ative o GPS e permita a localização no navegador.",
          "Se o seu registro exige foto, permita a câmera."
        ],
        passos: [
          "No menu, abra Registrar Ponto (ou use “Bater Ponto” na página Início).",
          "Confira o relógio, o seu estado (por exemplo “Aguardando início” ou “Trabalhando”) e o painel “Verificações desta sessão”.",
          "O texto “Próximo registro” diz qual é a ação da vez. Clique no botão grande correspondente: “Iniciar Jornada”, “Início do Almoço”, “Fim do Almoço” ou “Encerrar Jornada”.",
          "O botão de pausa (⏸) interrompe o expediente e, depois, “Reiniciar Jornada” retoma.",
          "Na tela “Registro Confirmado!” veja o horário gravado e clique em “Visualizar comprovante”."
        ],
        resultado: "O registro aparece no Histórico e o comprovante assinado fica disponível.",
        problemas: [
          {
            problema: "“Fora do perímetro permitido”.",
            solucao:
              "Você está longe da sede. Aproxime-se, ou use o modo correto (casa/viagem) se for o seu caso."
          },
          {
            problema: "“Sequência inválida”.",
            solucao: "O sistema mostra a próxima ação esperada; registre essa ação."
          },
          {
            problema: "Não consigo iniciar a jornada.",
            solucao:
              "Há descanso mínimo de 11 h desde a última saída, feriado ou afastamento no dia. A mensagem na tela explica o motivo."
          },
          {
            problema: "“Registro de ponto temporariamente indisponível”.",
            solucao:
              "É uma proteção do sistema (relógio ou integridade). Avise a TI; depois o RH pode tratar pela correção de ponto."
          }
        ],
        ver: ["Comprovantes", "Esqueci de registrar"],
        palavras:
          "bater ponto entrada saída almoço intervalo pausa gps foto iniciar encerrar jornada",
        rota: "/ponto/registrar"
      },
      {
        id: "intervalo",
        roteiro: "intervalo",
        titulo: "Almoço, pausas e encerramento",
        perfil: "todos",
        resumo: "Como registrar o intervalo e as pausas durante o dia.",
        passos: [
          "O almoço é registrado com “Início do Almoço” e “Fim do Almoço”, dentro da janela configurada (padrão 11:30 às 13:00). Na janela do almoço só aparece o início do intervalo.",
          "O intervalo vale, no mínimo, 60 minutos para o cálculo, mesmo que você volte antes.",
          "Para uma pausa curta, use o botão de pausa (“Interromper Expediente”) e depois “Reiniciar Jornada”.",
          "Encerre o dia com “Encerrar Jornada”. Se o almoço não foi registrado, o sistema deduz o mínimo e anota no histórico.",
          "Estagiários e jovens aprendizes têm carga corrida: não registram almoço, usam pausa e retomada."
        ],
        ver: ["Entender horas e saldo"]
      },
      {
        id: "comprovantes",
        roteiro: "comprovantes",
        titulo: "Comprovantes de registro",
        perfil: "todos",
        resumo:
          "Cada marcação gera um comprovante em PDF, assinado digitalmente, que você pode guardar.",
        passos: [
          "Logo após registrar, clique em “Visualizar comprovante”.",
          "Para ver os anteriores, use o botão “Comprovantes” no Histórico (ou “Comprovantes de ponto” em Folhas assinadas).",
          "No visualizador, use “Baixar PDF” para guardar. A tela mostra uma marca d'água com o seu nome.",
          "Para conferir um comprovante, use “Validar documento” na página Início."
        ],
        rota: "/ponto/comprovantes"
      },
      {
        id: "historico",
        roteiro: "historico",
        titulo: "Consultar o histórico do mês",
        perfil: "todos",
        resumo:
          "O Histórico de Frequência mostra, dia a dia, o que foi registrado e as horas calculadas.",
        passos: [
          "Abra Histórico. Use as setas (ou clique no nome do mês) para trocar de mês.",
          "Os selos no alto resumem o mês: dias OK, inconsistentes, faltas, horas trabalhadas e saldo do banco.",
          "A tabela traz Data, Dia, Entrada, Início e Fim do intervalo, Saída, Pausa, Horas, Saldo e Status de cada dia.",
          "Dias em destaque têm pendência (ex.: registro incompleto): peça a correção em Solicitações.",
          "No alto da página: “Banco de Horas”, “Comprovantes” e “Exportar PDF”."
        ],
        rota: "/ponto/historico"
      },
      {
        id: "horas",
        roteiro: "horas",
        titulo: "Entender horas e saldo",
        perfil: "todos",
        resumo: "Como o sistema calcula as horas trabalhadas e o saldo do banco.",
        passos: [
          "O sistema soma os trechos entre as batidas e desconta o intervalo de almoço.",
          "O almoço conta, no mínimo, 60 minutos; voltar antes não aumenta as horas.",
          "Entrada e saída dentro da tolerância (padrão 5 minutos) contam como no horário.",
          "Feriados, abonos, atestados e férias são neutros: não geram falta nem saldo negativo.",
          "Sábado, domingo e feriado trabalhados valem mais no banco, conforme as regras do CFO."
        ],
        ver: ["Banco de horas"]
      },
      {
        id: "esqueci",
        roteiro: "esqueci",
        titulo: "Esqueci de registrar",
        perfil: "todos",
        resumo: "Use a Correção de Ponto para acertar o que faltou em dias anteriores.",
        passos: [
          "Abra Solicitações e clique em “+ Nova solicitação”.",
          "Escolha “Correção de Ponto”, informe a data de referência e os horários corretos (Entrada, Início Intervalo, Fim Intervalo, Saída).",
          "Em “Explique o motivo da correção…”, escreva o que aconteceu e clique em “Enviar Solicitação”.",
          "O seu chefe aprova ou rejeita; a aprovação já aplica a correção.",
          "A correção só vale para dias anteriores e antes de você assinar a folha do mês."
        ],
        problemas: [
          {
            problema: "Não consigo corrigir o mês.",
            solucao:
              "Se você já assinou a folha daquele mês, a correção não é mais possível; fale com o RH."
          }
        ],
        rota: "/ponto/solicitacoes"
      }
    ]
  },
  {
    id: "solicitacoes",
    titulo: "C. Minhas solicitações",
    perfil: "todos",
    descricao: "Abono, atestado, licença, férias, hora extra e envio de documentos.",
    tarefas: [
      {
        id: "abono",
        titulo: "Pedir abono",
        perfil: "todos",
        roteiro: "pedir-abono",
        resumo:
          "Justifica uma ausência ou atraso sem desconto. Pode usar tempo do banco liberado pelo RH ou a cota do acordo coletivo.",
        antes: [
          "Veja em Banco de Horas se há tempo liberado pelo RH: ele aparece no pedido em um quadro verde."
        ],
        passos: [
          "Em Solicitações, clique em “+ Nova solicitação” e escolha “Abono”.",
          "Leia o quadro “Como funciona o abono”.",
          "Em “Período 1”, informe a Data inicial (e a Data final, se forem vários dias). Hora 00:00 a 23:59 é o dia inteiro; para abono parcial mude as horas ou use os atalhos Matutino/Vespertino.",
          "Para outros dias, use “+ Adicionar período” (tudo na mesma solicitação).",
          "Anexe um documento, se quiser (opcional), e preencha a “Descrição / Justificativa” (obrigatória).",
          "Clique em “Enviar Solicitação” e acompanhe a situação na lista."
        ],
        problemas: [
          {
            problema: "“Abono livre desativado”.",
            solucao:
              "Hoje o abono só vale com tempo liberado pelo RH (ou pela cota do acordo coletivo). Procure o RH."
          }
        ],
        palavras: "justificar ausência atraso banco de horas cota período"
      },
      {
        id: "atestado",
        titulo: "Enviar um atestado médico",
        perfil: "todos",
        roteiro: "enviar-atestado",
        resumo: "Envie o atestado pelo sistema. O chefe dá ciência e o RH confirma.",
        passos: [
          "Em Solicitações, clique em “+ Nova solicitação” e escolha “Atestado Médico”.",
          "Informe a Data Inicial (e a Data Final, se houver). Para poucas horas, use “Matutino” ou “Vespertino” e ajuste o horário.",
          "Em “Documento do atestado”, use “Upload (imagem ou PDF)”.",
          "Preencha o “CID” com 1 letra seguida de 2 números (ex.: Z13). Se o documento trouxer 3 números (Z136 ou Z13.6), informe só Z13: é a mesma categoria e o sistema registra como Z13 (informação de saúde protegida: só o RH vê).",
          "Preencha a “Descrição / Justificativa” e clique em “Enviar Solicitação”.",
          "O RH pode pedir o documento de retorno da consulta (homologação); a solicitação fica como “Aguardando seu documento”."
        ],
        resultado: "Aprovado, o atestado vira afastamento e o dia deixa de gerar falta.",
        ver: ["licença"],
        palavras: "cid médico consulta afastamento upload"
      },
      {
        id: "licenca",
        roteiro: "licenca",
        titulo: "Pedir uma licença",
        perfil: "todos",
        resumo:
          "Casamento, luto, doação de sangue, maternidade/paternidade e outras, conforme as regras do CFO.",
        passos: [
          "Em Solicitações, clique em “+ Nova solicitação” e escolha “Licença e Outros”.",
          "Selecione o tipo de licença: o sistema mostra a orientação, o limite de dias e se exige documento.",
          "Informe o período, anexe o documento exigido e envie.",
          "Acompanhe: chefe → RH."
        ]
      },
      {
        id: "day-off",
        roteiro: "day-off",
        titulo: "Day Off de Aniversário",
        perfil: "todos",
        resumo: "Você tem direito a um dia de folga no seu mês de aniversário.",
        antes: [
          "A sua data de nascimento precisa estar cadastrada; se não estiver, o formulário avisa e o RH deve cadastrá-la."
        ],
        passos: [
          "Em Solicitações, clique em “+ Nova solicitação” e escolha “Day Off de Aniversário”.",
          "O formulário mostra o seu mês de aniversário: escolha qualquer dia útil desse mês.",
          "Descreva como pretende usufruir e clique em “Enviar Solicitação”."
        ]
      },
      {
        id: "ferias",
        roteiro: "ferias",
        titulo: "Marcar férias e assinar os documentos",
        perfil: "todos",
        resumo:
          "Marque os períodos no calendário; depois do OK, assine o Aviso e o Recibo no sistema.",
        passos: [
          "Em Solicitações, escolha Férias e marque os períodos no calendário.",
          "O sistema confere as regras (antecedência, tamanho dos períodos, venda de dias, vedações).",
          "Depois da aprovação do chefe, o RH envia o Aviso e o Recibo de Férias.",
          "Abra a solicitação, leia e assine cada documento. Se houver erro, rejeite com a justificativa.",
          "O RH conclui a aprovação e as férias entram no seu calendário."
        ],
        problemas: [
          {
            problema: "O calendário não deixa marcar.",
            solucao: "Alguma regra não foi cumprida; a mensagem explica qual."
          }
        ],
        palavras: "recibo aviso saldo período venda"
      },
      {
        id: "hora-extra",
        roteiro: "hora-extra",
        titulo: "Hora extra",
        perfil: "todos",
        resumo: "Passou da jornada? A hora extra precisa de aprovação.",
        passos: [
          "Se ultrapassar o limite configurado, o sistema cria a solicitação automaticamente ao registrar a saída.",
          "Você também pode pedir por Solicitações > Hora extra.",
          "Chefe e RH aprovam; o tempo vai para o banco de horas.",
          "Estagiários e jovens aprendizes não fazem hora extra."
        ]
      },
      {
        id: "documento-rh",
        roteiro: "documento-rh",
        titulo: "Enviar um documento ao RH",
        perfil: "todos",
        resumo: "Envie comprovantes e outros documentos direto ao RH.",
        passos: [
          "Em Solicitações, escolha “Envio de documento ao RH”.",
          "Descreva o documento (mínimo 3 caracteres) e anexe o arquivo.",
          "Envie. O pedido vai direto ao RH."
        ]
      },
      {
        id: "acompanhar",
        roteiro: "acompanhar",
        titulo: "Acompanhar e entender a situação",
        perfil: "todos",
        resumo: "O que significa cada situação da solicitação.",
        passos: [
          "Pendente: aguardando o seu chefe.",
          "Aguardando RH: o chefe aprovou; o RH vai analisar.",
          "Aguardando documento: o RH pediu algum arquivo seu.",
          "Aprovada: aplicada. Rejeitada: veja a observação de quem decidiu."
        ]
      }
    ]
  },
  {
    id: "banco-folhas",
    titulo: "D. Banco de horas e folhas",
    perfil: "todos",
    descricao: "Saldo, ciclos, assinatura do Espelho e validação de documentos.",
    tarefas: [
      {
        id: "banco",
        roteiro: "banco",
        titulo: "Ver o banco de horas",
        perfil: "todos",
        resumo: "O saldo é contado por ciclo e zera nas datas de fechamento definidas pelo RH.",
        passos: [
          "Abra Banco de horas.",
          "Veja o saldo atual, o extrato dia a dia e a data da próxima zeragem.",
          "Tempo liberado pelo RH aparece à parte, com validade; use-o em um abono antes de vencer.",
          "Ao fim do ciclo, assine o relatório do ciclo, se solicitado."
        ],
        rota: "/ponto/banco-horas"
      },
      {
        id: "espelho",
        titulo: "Assinar o Espelho de Ponto",
        perfil: "todos",
        roteiro: "assinar-espelho",
        resumo:
          "Todo mês você confere e assina a folha do mês anterior; depois o seu chefe assina.",
        antes: [
          "O mês precisa ter terminado.",
          "Regularize dias inconsistentes e solicitações pendentes: com pendência o botão fica bloqueado e a tela lista o que falta."
        ],
        passos: [
          "Abra Histórico e vá ao mês que terminou (setas ao lado do nome do mês).",
          "Quando a folha estiver liberada, aparece “Quadro pronto para assinatura”. A mesma assinatura também está na página Banco de Horas.",
          "Revise a tabela e clique em “Assinar Quadro”.",
          "No resumo, confira dias trabalhados, total de horas e saldos. Atenção: depois de assinar não é possível pedir correção do mês.",
          "Confirme em “Assinar Quadro”. A assinatura registra data, rede e dispositivo.",
          "O chefe assina em seguida e o PDF final é selado com certificado digital; ele passa a aparecer em Folhas assinadas."
        ],
        problemas: [
          {
            problema: "“Assinatura bloqueada — há inconsistências nesta folha”.",
            solucao:
              "Corrija os dias destacados em Solicitações › Correção de Ponto (ou Atestado médico) e aguarde as solicitações do mês serem concluídas."
          }
        ],
        rota: "/ponto/folhas-assinadas"
      },
      {
        id: "validar",
        titulo: "Validar a autenticidade de um documento",
        perfil: "todos",
        roteiro: "validar-documento",
        resumo: "Confira se um PDF foi emitido pelo sistema; a página não exige login.",
        passos: [
          "Na página Início, clique em “Validar documento” (abre em uma nova aba).",
          "Opção 1: envie o PDF (ou a foto da página) clicando na área tracejada ou arrastando o arquivo. O arquivo não sai do seu computador.",
          "Opção 2: digite o código de verificação impresso no documento e clique em “Verificar”.",
          "“DOCUMENTO VÁLIDO — arquivo original, íntegro” confirma o documento. “ARQUIVO INVÁLIDO” significa que ele não confere: não o aceite.",
          "Só o código confirma que o registro existe; para garantir que o arquivo não foi alterado, envie também o PDF."
        ]
      }
    ]
  },
  {
    id: "requisicoes",
    titulo: "E. Requisições e saúde",
    perfil: "todos",
    descricao: "Responder o RH e manter seus dados atualizados.",
    tarefas: [
      {
        id: "requisicoes-rh",
        roteiro: "requisicoes-rh",
        titulo: "Responder requisições do RH",
        perfil: "todos",
        resumo: "O RH pode pedir documentos, exames, assinaturas ou atualização de dados.",
        passos: [
          "Abra Minhas requisições.",
          "Leia o pedido e o prazo.",
          "Anexe o arquivo ou responda e envie."
        ],
        rota: "/ponto/minhas-requisicoes"
      },
      {
        id: "exame",
        roteiro: "exame",
        titulo: "Enviar o exame ocupacional",
        perfil: "todos",
        resumo: "O exame periódico tem validade; o sistema avisa antes de vencer.",
        passos: [
          "Quando receber o aviso, realize o exame.",
          "Em Minhas requisições ou Saúde ocupacional, anexe o arquivo.",
          "O RH confirma ou devolve com o motivo; se devolver, envie novamente."
        ]
      },
      {
        id: "dados",
        roteiro: "dados",
        titulo: "Atualizar endereço, dependentes e formação",
        perfil: "todos",
        resumo: "Quando o RH solicitar, atualize os seus dados cadastrais.",
        passos: [
          "Abra Minhas requisições e escolha o requerimento.",
          "Confira e atualize os dados.",
          "Envie. O endereço residencial também é usado para validar o registro em casa."
        ]
      }
    ]
  },
  {
    id: "chefes",
    titulo: "F. Para chefes",
    perfil: "gestor",
    descricao: "Aprovar a equipe e assinar as folhas.",
    tarefas: [
      {
        id: "aprovar",
        titulo: "Aprovar ou rejeitar solicitações",
        perfil: "gestor",
        roteiro: "aprovar-solicitacao",
        resumo: "Você decide os pedidos da sua equipe; em atestados, o seu botão é “Ter Ciência”.",
        passos: [
          "Abra Aprovações. Na etapa “Chefe de Área” ficam os pedidos aguardando a sua decisão; os números no alto mostram o resumo.",
          "Leia o pedido: quem pediu, tipo, datas, justificativa e anexos.",
          "Clique em “Aprovar” ou “Rejeitar”. Ao rejeitar o motivo é obrigatório.",
          "Em atestados o botão é “Ter Ciência”: a sua assinatura digital é aplicada no documento, que segue ao RH.",
          "Correção de ponto aprovada por você já é aplicada. Você não decide a própria solicitação.",
          "Use a etapa “Assinaturas de Quadro” para assinar as folhas da equipe e a aba Histórico para rever o que já decidiu."
        ],
        rota: "/ponto/aprovacoes"
      },
      {
        id: "assinar-equipe",
        titulo: "Assinar o Espelho da equipe",
        perfil: "gestor",
        resumo: "Depois do funcionário, você assina a folha.",
        passos: [
          "Em Aprovações, abra as folhas aguardando a sua assinatura.",
          "Confira e assine, ou devolva ao funcionário com o motivo.",
          "Concluída a assinatura, o PDF é selado."
        ]
      }
    ]
  },
  {
    id: "rh",
    titulo: "G. Para o RH",
    perfil: "rh",
    descricao: "Gestão de pessoas, aprovações, banco de horas e arquivos fiscais.",
    tarefas: [
      {
        id: "gestao-funcionarios",
        titulo: "Cadastrar e manter funcionários",
        perfil: "rh",
        resumo: "Dados, matrícula, categoria, lotação, jornada e chefia ficam na Gestão.",
        passos: [
          "Abra Gestão e clique em novo ou edite um funcionário.",
          "Preencha matrícula, CPF, categoria, gerência, jornada e chefia.",
          "Históricos de lotação, categoria e cessão registram as mudanças ao longo do tempo.",
          "Sem matrícula o funcionário não acessa o sistema."
        ],
        rota: "/ponto/gestao"
      },
      {
        id: "aprovar-rh",
        titulo: "Decidir solicitações na etapa do RH",
        perfil: "rh",
        resumo: "Depois do chefe, o RH confere documentos e aprova.",
        passos: [
          "Abra Auditoria > Solicitações.",
          "Atestado com homologação: aguarde o retorno da consulta.",
          "Férias: envie o Aviso e o Recibo e aguarde a assinatura do funcionário.",
          "Aprove ou rejeite com observação. Você não decide a própria solicitação."
        ],
        rota: "/ponto/auditoria"
      },
      {
        id: "liberar-banco",
        titulo: "Liberar tempo do banco de horas",
        perfil: "rh",
        roteiro: "liberar-banco",
        resumo: "Converte saldo do banco em crédito para abono, com validade.",
        passos: [
          "Abra Auditoria › Funcionários, escolha o funcionário e a aba “Banco de Horas”.",
          "No painel “Tempo do banco liberado pelo RH”, clique em “＋ Liberar tempo para abono”.",
          "Informe o tempo (ou “Liberar tudo”), até quando vale e a justificativa (obrigatória, mínimo de 10 caracteres).",
          "Confirme em “Confirmar liberação”. O saldo é debitado e o funcionário é avisado.",
          "É possível revogar o que ainda não foi usado, também com justificativa."
        ]
      },
      {
        id: "fechamento",
        titulo: "Fechamento do mês e assinaturas",
        perfil: "rh",
        resumo: "Acompanhe quem já assinou o Espelho e feche os períodos.",
        passos: [
          "Em Auditoria, veja a prévia de elegibilidade do mês.",
          "Acompanhe as assinaturas pendentes do funcionário e do chefe.",
          "Feche e aprove os períodos (não o seu próprio)."
        ]
      },
      {
        id: "afd-aej",
        titulo: "Gerar AFD, AEJ e Atestado Técnico",
        perfil: "rh",
        roteiro: "gerar-afd",
        resumo: "Arquivos exigidos pela fiscalização, assinados com certificado digital.",
        passos: [
          "Abra Auditoria e clique em “⬇ Arquivos fiscais (AFD / AEJ)”.",
          "Escolha AFD ou AEJ e informe o período.",
          "Em “Funcionários”, use “Todos (AFD oficial do REP)” para a fiscalização; os demais geram só extratos.",
          "Leia os bloqueios (vermelho) e avisos (amarelo) da pré-validação e clique em “Gerar e baixar … (ZIP)”.",
          "O Atestado Técnico e Termo de Responsabilidade é baixado em Configurações › REP-P, para assinatura do responsável."
        ],
        rota: "/ponto/configuracoes"
      },
      {
        id: "saude-ocupacional",
        titulo: "Saúde ocupacional e requisições",
        perfil: "rh",
        resumo: "Solicite exames, requisições e documentos aos funcionários.",
        passos: [
          "Em Requisições RH, crie a requisição para um ou vários funcionários.",
          "Em Saúde ocupacional, acompanhe vencidos e a vencer.",
          "Confirme ou devolva os arquivos recebidos."
        ],
        rota: "/ponto/requisicoes-rh"
      },
      {
        id: "perfis-rh",
        titulo: "Perfis do RH",
        perfil: "rh",
        resumo: "Defina o que cada pessoa do RH pode ver e fazer.",
        passos: [
          "Abra Perfis do RH.",
          "Escolha a pessoa e marque as abas e funções liberadas.",
          "Uma função só funciona com a aba correspondente liberada."
        ],
        rota: "/ponto/perfis-rh"
      }
    ]
  },
  {
    id: "superadmin",
    titulo: "H. Para o Super Admin",
    perfil: "superadmin",
    descricao: "Administração do sistema.",
    tarefas: [
      {
        id: "start",
        titulo: "Start, usuários e super-admins",
        perfil: "superadmin",
        resumo: "Gerencie usuários, grupos e quem é Super Admin.",
        passos: [
          "Abra Start / Super Admin.",
          "Conceda ou revogue Super Admin (a ação é registrada e notificada).",
          "Acompanhe o Start do sistema (data de início de produção)."
        ],
        rota: "/ponto/sistema"
      },
      {
        id: "logs",
        titulo: "Logs, backup e documentação técnica",
        perfil: "superadmin",
        resumo: "Auditoria das requisições, desempenho, backup e a documentação técnica completa.",
        passos: [
          "Abra Logs.",
          "Use as abas Dashboard, Logs, Desempenho, Ingestão, Backup, API Servidora e Documentação.",
          "Para investigar uma reclamação, busque pelo X-Trace-Id ou pelo usuário."
        ],
        rota: "/ponto/logs"
      },
      {
        id: "rep-p-inpi",
        titulo: "REP-P, INPI e certificado",
        perfil: "superadmin",
        resumo: "Conclua o registro no INPI, instale o certificado e inicie a operação.",
        passos: [
          "Em Configurações > REP-P, informe o nº do INPI e o certificado de registro.",
          "Confira a validade do certificado A1.",
          "Quando não houver pendências, inicie a operação do REP-P."
        ]
      },
      {
        id: "termos-admin",
        titulo: "Publicar os Termos de Uso",
        perfil: "superadmin",
        resumo: "Crie versões, publique e acompanhe quem aceitou.",
        passos: [
          "Abra Configurações > Termos de Uso e crie um rascunho.",
          "Edite e publique com o resumo das alterações.",
          "Acompanhe os aceites e quem ainda não aceitou."
        ]
      }
    ]
  },
  {
    id: "apoio",
    titulo: "I. Apoio",
    perfil: "todos",
    descricao: "Perguntas frequentes e contatos.",
    tarefas: [
      {
        id: "faq",
        titulo: "Perguntas frequentes",
        perfil: "todos",
        resumo: "Respostas rápidas.",
        passos: [
          "O horário do ponto está errado? O sistema usa a hora do servidor, sincronizada com a Hora Legal Brasileira; o relógio do seu computador não importa.",
          "Posso registrar pelo celular? Sim, conforme o seu modo de trabalho; o GPS precisa estar ativo.",
          "Perdi o comprovante. Abra Meus comprovantes e baixe de novo.",
          "O sistema caiu na hora do ponto. Avise o RH; a correção de ponto resolve.",
          "Quem vê os meus dados? Somente quem tem permissão (seu chefe e o RH), conforme os Termos de Uso."
        ]
      },
      {
        id: "contatos",
        titulo: "Onde pedir ajuda",
        perfil: "todos",
        resumo:
          "Dúvidas de regras e cadastro: RH. Problemas técnicos (acesso, erro na tela): TI do CFO.",
        passos: [
          "Anote a mensagem exibida e o horário.",
          "Se puder, informe a tela em que estava.",
          "Procure o RH ou a TI (Desenvolvimento de TI, sala 203)."
        ]
      }
    ]
  }
];
