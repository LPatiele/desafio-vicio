# Arquitetura, avaliação e entrega da execução sem RAG

A execução `model-only-v19-359` concluiu 359 propostas, 359 pareceres e 359 decisões. As seis etapas previstas estão implementadas. A integração que faltava era finalizar os artefatos da v19: o exportador histórico em `src/export.ts` carrega apenas `output/experiments/<nome>`, enquanto a v19 usa um diretório e um manifesto próprios. O novo módulo `delivery/` lê esse formato sem alterar os motores ou os resultados dos experimentos anteriores.

| Etapa | Implementação e verificação |
| --- | --- |
| Preparação | `src/data.ts`: `prepareData` limpa enunciado, comando e alternativas, salva `output/prepared.json` e mantém os anexos originais. `loadData` confere hashes sem repetir a preparação. O arquivo preparado mantém a taxonomia inteira para auditoria; `messagesFor` em `experiments/no-rag-v19/engine.ts` envia aos modelos somente temas ativos. |
| Classificador | `experiments/no-rag-v19/prompts/classificador.md`, `src/types.ts:ProposalSchema` e `NoRagEngine.stage`: tema central, extras, concorrentes, evidências, justificativa, incertezas, confiança e possibilidade de `fora`. |
| Validação | `src/utils.ts:parseBatch`, `src/validation.ts:validateProposal/validateVerdict` e `NoRagEngine.stage`: esquema, IDs esperados, duplicatas, status dos temas, citações literais e coerência dos campos. Erros deixam somente os itens afetados para retentativa. |
| Juiz | `experiments/no-rag-v19/prompts/juiz.md` e `src/types.ts:VerdictSchema`: `tema_central`, `evidencia_textual` e `distincao_de_concorrentes`, com `sustentado`, `incerto` ou `inadequado` e justificativa em cada rubrica. |
| Decisão | `src/validation.ts:decide`, chamado por `src/retrieval/decision.ts:decideRecord`: aplica regras explícitas para publicar, revisar ou fora. O nome histórico do arquivo não ativa recuperação: na v19, os recursos de contexto estão desabilitados. |
| Avaliação | `src/evaluation.ts`: referência versionada, relações hierárquicas, métricas e sensibilidade. A v19 já gera `report.json` ao terminar. `delivery/finalize.ts` acrescenta recortes com denominadores explícitos, divergências em CSV e auditoria do pipeline. |

## Gerar os artefatos

Para executar o pipeline e gerar automaticamente a entrega ao concluir as 359 questões:

```sh
npm run pipeline:v19 -- --run
```

O ponto de entrada `delivery/pipeline.ts` chama o executor congelado da v19 e, depois do término bem-sucedido, chama o exportador. Se o experimento já estiver completo, apenas valida e exporta os dados salvos, sem novas chamadas aos modelos. Uma execução parcial, interrompida, com pendências ou em `--dry-run` não produz CSV integral. Os diretórios e fingerprints históricos permanecem preservados.

Com os anexos, dados preparados e o experimento completo disponíveis:

```sh
npm run delivery:v19
```

Esse comando é offline: não carrega chaves, não abre o banco RAG e não chama APIs. As validações conferem o manifesto, o checkpoint autoritativo, sua cópia `records.json`, os textos preparados contra os originais e todas as requisições salvas. Propostas e pareceres são revalidados, e as decisões são recalculadas apenas para conferir igualdade com as regras, sem sobrescrever os registros.

O comando escreve `publicacao.csv` na raiz e um snapshot em `output/delivery/model-only-v19-359/`:

- `publicacao.csv`: uma linha por questão, na ordem dos anexos, com `id,decisao,tema_central_id,extras_ids,confianca,motivo`.
- `avaliacao.json`: métricas, recortes, sensibilidade e comparação por ID.
- `divergencias.csv`: diferenças exatas entre temas propostos/finais e referência. `divergencia_de_ramo` distingue erro de ramo de diferença de granularidade aceita pelo desafio.
- `pipeline-audit.json`: conferência das seis etapas, modelos e contagens.
- `exportacao.json`: hashes das fontes e dos arquivos produzidos, identidade da execução e origem da confiança.

O snapshot já gerado é preservado. Repetir a finalização aceita apenas arquivos idênticos e com a mesma proveniência; um CSV ausente na raiz é recriado. Fontes ou conteúdo diferentes exigem outro nome, por exemplo `npm run delivery:v19 -- --name entrega-v19-2`. Se já existir um CSV diferente na raiz, o programa interrompe para evitar sobrescrever outra entrega. Uma execução incompleta ou registro inconsistente bloqueia a exportação.

O contrato segue `anexos/LEIA-ME.md` e `entrega_modelo.csv`: CSV UTF-8 com vírgulas, aspas escapadas, extras separados por ponto e vírgula, tema obrigatório em publicar/revisar e vazio em fora. Motivo é obrigatório em revisar/fora. O CSV é serializado e relido para conferir colunas e contagem. Confiança é a estimativa subjetiva original do classificador, sem calibração. Para fora, a confiança do tema central é 0 por não existir tema, conforme a convenção documentada do exportador histórico.

## Métricas e seus denominadores

O critério do PDF aceita o tema exato ou um ancestral/descendente. Um irmão na árvore conta como erro. Extras não corrigem um tema central incorreto.

Na v19, a cobertura de publicação é **311/359 = 86,6%**. A concordância por ramo entre as publicadas é **265/311 = 85,2%**; a exata é **222/311 = 71,4%**. A meta de 95% não foi atingida em relação à referência provisória.

`overall.publishedAgreement` e `overall.exactPublishedAgreement` usam somente publicadas. `cohorts.allClassifierProposals` avalia todas as propostas antes do filtro. `cohorts.allFinalSuggestions` avalia todas as sugestões finais, incluindo as enviadas para revisão. Os recortes `published`, `review` e `outside` também apresentam seus próprios denominadores e numeradores. Nos recortes gerais, uma exclusão `fora` que coincide com a referência conta como destino correto; ela não aumenta a precisão das publicadas.

A referência própria v2 permanece separada das entradas dos modelos. Alterar a referência muda as métricas e divergências, sem mudar o CSV de decisões. Os resultados são exploratórios e medem concordância com uma referência que também pode conter erros. O intervalo de Wilson não elimina essas limitações.

## Outros itens exigidos pelo desafio

Esta implementação atende à avaliação e à geração do CSV solicitadas. O PDF também exige `previsao.txt`, relatório final de até cinco páginas e memo para o professor. `previsao.txt` não foi fabricado a partir das métricas já observadas: é necessário registrar uma autoavaliação explícita e sua metodologia, deixando clara a exposição aos resultados. A exportação não converte a concordância observada em previsão cega nem considera a confiança dos modelos uma garantia de 95%.

## Verificações de código

```sh
node --import tsx --test tests/delivery.test.ts tests/no-rag-v19.test.ts
node node_modules/typescript/bin/tsc --project delivery/tsconfig.json
```

Os testes conferem denominadores, hierarquia e irmãos, exclusão concordante, formato CSV, escaping, confiança, pendências, temas inativos, duplicatas, decisões alteradas e isolamento da referência. Os testes da v19 também verificam ausência de RAG, conservação dos itens válidos, retomada e teto de tentativas.
