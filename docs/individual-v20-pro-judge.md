# v20: questão a questão com Gemini 3.1 Pro no juiz

> Documento da condição original e de suas paradas históricas. A recuperação posterior concluiu as 359 decisões com política explícita de confirmação de fora, e o CSV da raiz passou a ser o dessa derivação. Consulte o [resultado consolidado](resultado-entrega-v20.md) e o [README principal](../README.md). Os números de reservas e as referências ao CSV v19 na raiz abaixo descrevem o momento anterior à recuperação e à reconciliação dos 429; os snapshots originais permanecem preservados.

Condição separada, preservando a v19 e os experimentos com RAG. Configuração em `config/individual-v20-pro-judge.json`; executor em `experiments/individual-v20/cli.ts`.

| Papel | Modelo | Raciocínio |
| --- | --- | --- |
| Classificador | `gemini-3.5-flash-lite` | `high`, com o mesmo perfil e prompt da v19 |
| Juiz | `gemini-3.1-pro-preview` | `medium`, preservando o prompt e as rubricas da v19 |

Ambos usam Vertex AI/ADC, projeto e endpoint global já configurados. RAG, recuperação automática, ferramentas, rótulos originais e referência de avaliação estão ausentes das entradas dos modelos. Os prompts são carregados do snapshot congelado da v19 e seus hashes são conferidos. A referência própria v2 é carregada somente para o relatório posterior.

São 359 questões, uma por chamada, com classificador e juiz em sequência antes de passar à questão seguinte. Isso exige pelo menos 718 inferências. O limite é de cinco tentativas totais por questão e etapa, incluindo a primeira; retomadas preservam os contadores e as respostas válidas. As propostas começam vazias: resultados anteriores aparecem somente no cálculo offline aproximado do tamanho de entrada do juiz, sem serem copiados ao novo checkpoint ou enviados como propostas na execução real.

O modelo do juiz e o tamanho do lote mudam juntos. A comparação com a v19 não permite atribuir todo o efeito observado exclusivamente ao juiz.

## Comandos

Planejar e registrar `plan.json`, sem chamadas de rede:

```sh
npm run pipeline:v20 -- --dry-run
```

Consultar somente os metadados dos modelos, sem inferência:

```sh
npm run pipeline:v20 -- --preflight
```

Executar exige `--run` com `--budget-usd VALOR_AUTORIZADO`, substituindo o marcador pelo teto explicitamente aprovado. O teto é salvo em `authorization.json` na primeira execução. Nas retomadas, pode ser omitido; os gastos e as reservas permanecem no mesmo `spend.json`. Um teto diferente é rejeitado para evitar mudanças silenciosas de autorização. O comando sem autorização própria interrompe antes de qualquer chamada à API.

Não foi usado o saldo de US$ 30 dos experimentos anteriores: `output/paid-v17/paid-v17-359/authorization.json` autoriza apenas b30, b20 e b10 e registra `b1Included: false`. Esses arquivos e os gastos anteriores não são alterados.

## Custos e identidade

Preços Standard PayGo global conferidos em 19/10/2026 na [tabela oficial](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing). Para o juiz Pro, até 200 mil tokens de entrada: US$ 2 por milhão de tokens de entrada, US$ 0,20 por milhão em cache e US$ 12 por milhão de saída, incluindo raciocínio. Acima do limiar, os perfis registram US$ 4/0,40/18. O classificador mantém US$ 0,30/0,03/2,50. Os custos são brutos: não comprovam abatimento do Free Trial.

O planejamento das 359 questões estima cerca de US$ 39,29 sem cache e sem retentativas: usa a razão tokens/bytes observada na v19 para estimar entrada e supõe 2.000 tokens de saída+raciocínio por questão no novo juiz. Não é medição do consumo do Pro. Um cenário hipotético com 90% da entrada em cache cai para cerca de US$ 15,18; a presença desse cache não é garantida. Retentativas, raciocínio mais longo e respostas maiores podem elevar o gasto. O teto deve ser escolhido explicitamente.

O fingerprint inclui configurações, dados, prompts e hashes dos módulos de execução. Alterações exigem outro nome de suíte. A autorização financeira fica separada da identidade do modelo, mas não é aumentada automaticamente. Reservas são persistidas antes dos envios e chamadas desconhecidas continuam contabilizadas conservadoramente.

## Saídas

`output/individual-v20/pro-judge-v20-359-r2/` guarda manifesto, prompts, checkpoint, registros, requisições, eventos, relatório e estado incremental. Após 359 decisões válidas, a avaliação e o CSV são gerados automaticamente em `output/delivery/pro-judge-v20-359-r2/`. Uma cópia do CSV fica no diretório do novo experimento. O `publicacao.csv` da raiz, da v19, permanece preservado para comparação.

O relatório compara temas com a referência provisória. A confiança exportada continua sendo declarada pelo classificador, sem calibração. Uma execução completa não garante a meta de 95%. O código não cria `previsao.txt` retroativamente a partir das métricas observadas.

## Verificações

```sh
node --import tsx --test tests/individual-v20.test.ts tests/no-rag-v19.test.ts tests/delivery.test.ts tests/vertex-v18.test.ts
node node_modules/typescript/bin/tsc --project experiments/individual-v20/tsconfig.json
```

As verificações cobrem preservação do classificador, preço do juiz, ausência de RAG e ferramentas, sequência de chamadas por ID, checkpoints novos, bloqueio sem orçamento, conservação dos gastos anteriores, formato do CSV e transporte Vertex autenticado.

Em 19/10/2026, o preflight autenticado retornou os metadados dos dois modelos no endpoint global, incluindo `publishers/google/models/gemini-3.1-pro-preview`. Registro: `output/individual-v20/pro-judge-v20-359/preflight.json`. Isso confirma a consulta de metadados, sem provar sucesso de inferência ou aplicação do crédito.

A usuária autorizou US$ 45 para esta condição. A primeira tentativa foi iniciada dentro do ambiente com rede bloqueada: 80 inícios registrados, 79 falhas de rede concluídas e nenhuma resposta HTTP; o último envio ficou reservado após SIGTERM. Não houve proposta ou parecer. Foram preservados checkpoint, contadores e gastos desconhecidos em `pro-judge-v20-359`, com o motivo em `operator-stop.json` e o código original em `source-snapshot/`. A nova suíte `pro-judge-v20-359-r2` começa com registros novos, sem zerar os contadores da tentativa interrompida.

Todas as tentativas v20 compartilham o mesmo `authorization.json` e `spend.json` em `pro-judge-v20-359/`. O teto inicial foi US$ 45; após a parada financeira, a usuária autorizou mais US$ 30, elevando **o teto total para US$ 75**. A autorização anterior foi preservada em `authorization-before-increase-75.json`. As reservas desconhecidas da interrupção, US$ 16,4604848, permanecem contabilizadas conservadoramente; não são cobrança confirmada. A r2 não recebe um orçamento separado. Uma trava compartilhada impede duas execuções v20 simultâneas.

O executor passou a conferir conectividade/autenticação antes de consumir tentativas dos itens. Uma falha ambígua de rede durante inferência encerra a execução no primeiro envio, preservando sua reserva, para não esgotar os outros itens offline. Passaram 22 testes e a checagem TypeScript após essa correção. A execução r2 foi iniciada com rede explicitamente autorizada.

A primeira parada financeira da r2 ocorreu com 180 decisões e foi arquivada em `run-segments/first-financial-stop/`; a retomada preserva respostas e tentativas. O aumento financeiro não altera o limite de cinco tentativas por etapa. O manifesto descreve a autorização inicial; a autorização vigente é a do arquivo financeiro compartilhado.

A passagem completa terminou em 19/10/2026 às 03:39:51 (America/Fortaleza): 359 propostas, 354 pareceres/decisões, 282 publicações, 66 revisões, seis fora e cinco pendências com tentativas esgotadas (Q0017, Q0083, Q0154, Q0298 e Q0319). Foram 767 chamadas na r2, em 163,6 minutos ativos, com 19 HTTP 429 e nenhuma falha de rede. O consumo conhecido estimado foi US$34,655283; reservas desconhecidas da r2 e da tentativa inicial somam US$36,792911. O controle terminou em US$71,448193 de US$75, com US$3,551807 restantes; reservas não são cobranças confirmadas. Concordância nas publicadas: 85,8% por ramo e 75,2% exata; cobertura de publicação 78,6%. O CSV v20 continua bloqueado pelas cinco pendências; o CSV v19 da raiz foi conferido por SHA-256 contra sua cópia de entrega e permanece idêntico.

Monitoramento sem chamadas de API: `node scripts/status-individual-v20.mjs`. Após o encerramento, executar `node --import tsx scripts/compare-individual-v20.ts --limit 359` e `node --import tsx scripts/resumed-report-individual-v20.ts`. O segundo soma as durações e chamadas de todas as invocações, conferindo os relatórios arquivados contra os eventos; o relatório nativo contém a duração somente da última invocação. A análise da primeira parada permanece em `output/comparisons/individual-v20-first-financial-stop/`; a análise após retomada tem diretório próprio.
