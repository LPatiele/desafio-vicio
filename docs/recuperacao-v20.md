# Recuperação e variante de confirmação de fora

Em 19/10/2026, a recuperação das cinco pendências gerou um CSV com 359 decisões: 284 publicar, 66 revisar e nove fora. O resultado está em `publicacao.csv`, com snapshot em `output/delivery/pro-judge-v20-359-repair-1-final/`. O CSV anterior foi preservado em `output/delivery/root-history/`; o original da v19 permanece no seu diretório de entrega.

## O que foi reprocessado

`experiments/individual-v20/repair.ts` abriu um novo ciclo autorizado para Q0017, Q0083, Q0154, Q0298 e Q0319. Reclassificou os quatro itens com incompatibilidades, usando somente críticas anteriores dos modelos como feedback; a Q0319 reutilizou sua proposta válida. Foram 21 chamadas nas duas invocações da recuperação, com custo conhecido estimado de US$0,6233142. Os 354 registros anteriormente concluídos foram conferidos por igualdade e preservados. Tentativas antigas permanecem no experimento original e no manifesto da recuperação; cada etapa teve até cinco novas tentativas no ciclo autorizado.

## Regra judge-confirms-outside-v1

Implementação: `delivery/confirmed-outside.ts`, função `decideConfirmedOutside`. Primeiro aplica a regra original. Se ela não consegue decidir, a variante aceita fora somente quando:

1. A proposta já é fora, com tema nulo, e contém incerteza declarada pelo classificador.
2. Proposta, evidências literais, concorrentes ativos e parecer passam pelas validações originais.
3. As três rubricas são sustentado: tema central, evidência textual e distinção de concorrentes.
4. O juiz confirma fora_sustentado=true, sem tema alternativo ou extras.
5. Não há alertas do juiz nem avisos de problemas no texto da questão.
6. RAG, pesquisa e recuperação permanecem desabilitados nesta condição.

O resultado é fora, com tema vazio, extras vazios e motivo que registra a distinção de escopo feita pelo juiz. A incerteza declarada não é apagada. A variante não altera regras de publicação e não admite revisar sem tema, pois o anexo exige um tema sugerido em revisar.

Em termos simples: o classificador pode indicar uma dúvida de escopo, e o juiz pode resolvê-la ao confirmar a exclusão com todos os critérios sustentados. No motor original, a dúvida do classificador continuava funcionando como veto, independentemente da conclusão do juiz.

## Aplicação e auditoria

A variante foi aplicada na finalização offline da recuperação, por `experiments/individual-v20/finish-recovery.ts`. Ela não foi ativada silenciosamente no executor congelado original. O exportador `delivery/finalize.ts` exige a opção explícita de política e um manifesto correspondente; a exportação padrão continua com a regra original.

O finalizador reaplicou as regras às respostas reais em ordem de recebimento. Aceitou o primeiro parecer elegível: Q0154 na primeira tentativa e Q0298 na terceira. As chamadas posteriores, inclusive os alertas, permanecem preservadas no log. Nenhuma chamada adicional foi feita nessa etapa. `decision-policy.json` vincula cada decisão ao ID da requisição, hash da resposta e hash da proposta recebida pelo juiz.

Os registros finais estão em `output/individual-v20/pro-judge-v20-359-repair-1-final/`. O experimento de inferência continua em `.../pro-judge-v20-359-repair-1/`, com suas duas pendências originais sob a política anterior. A derivação possui outro fingerprint e registra os hashes de ambos os códigos e da fonte original.

## Limitações observadas

As exclusões Q0154 e Q0298 divergem da referência provisória v2. A concordância final nas publicadas foi 243/284 = 85,6% por ramo e 213/284 = 75,0% exata, com cobertura de publicação 284/359 = 79,1%. Das nove fora, duas concordam com a referência. A meta de 95% não foi alcançada. A regra resolve um bloqueio operacional; confirmação pelo juiz não comprova correção jurídica. O ajuste é retrospectivo e dirigido às falhas, portanto deve ser distinguido de uma avaliação cega.

## Correção do controle financeiro

O controle mantinha reservas conservadoras para respostas 429 conhecidas. A [política oficial do Google](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing) informa cobrança de entrada e saída somente para respostas 200. `experiments/individual-v20/reconcile.ts` reconciliou 28 respostas 429 comprovadas, com custo zero por essa política, preservando IDs, tentativas, reserva original e backup/auditoria. Falhas de rede sem resposta não foram reconciliadas. Esse ajuste não é conferência de fatura ou confirmação de crédito promocional.

O teto permaneceu em US$75. Após a recuperação, o custo conhecido acumulado da v20 é US$35,27859686; incluindo US$16,4604848 ainda reservados para a interrupção inicial de rede, o controle totaliza US$51,73908166. Restam US$23,26091834 para reservas. Os relatórios das paradas anteriores descrevem a contabilidade conservadora vigente naqueles momentos.

## Verificações

Passaram 16 testes para recuperação, política, reconciliação e entrega, além da checagem TypeScript. O finalizador revalidou os 359 registros, conferiu os anexos e as requisições nativas, serializou o CSV e releu suas seis colunas e IDs. O relatório completo está em `output/comparisons/individual-v20-recovery/analysis.md`.
