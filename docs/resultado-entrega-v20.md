# Entrega consolidada — 19/10/2026

O arquivo [publicacao.csv](../publicacao.csv) corresponde à derivação `pro-judge-v20-359-repair-1-final`: 359 decisões, 284 publicar, 66 revisar e nove fora. Snapshot público de reprodução em [reproducao/](../reproducao/README.md). O resultado anterior v19 continua em [publicacao-v19.csv](../reproducao/publicacao-v19.csv).

## Modelos, entradas e origem

Classificador `gemini-3.5-flash-lite`, raciocínio high; juiz `gemini-3.1-pro-preview`, raciocínio medium; Vertex AI global com ADC, sem RAG, ferramentas ou referência nas entradas. Uma questão por chamada, uma inferência por vez, até cinco tentativas totais por etapa em cada ciclo autorizado.

A v20-r2 produziu 354 decisões e deixou cinco pendências. Um ciclo novo autorizado recuperou Q0017, Q0083 e Q0319; a política explícita `judge-confirms-outside-v1` resolveu Q0154 e Q0298 na finalização, usando o primeiro parecer elegível na ordem dos retornos. As 354 decisões anteriores permaneceram idênticas. [Explicação e limitações da variante](recuperacao-v20.md).

Houve participação humana no desenho, escolha dos modelos, prompts, critérios, orçamento e autorização da variante. Os destinos finais não foram editados manualmente no CSV: foram gerados por regras versionadas a partir de propostas e pareceres preservados. O ajuste é retrospectivo e dirigido aos itens problemáticos, não uma repetição cega.

## Métricas com a referência própria v2

| Medida | Numerador / denominador | Resultado |
| --- | ---: | ---: |
| Concordância por ramo entre publicadas | 243/284 | 85,6% |
| Concordância exata entre publicadas | 213/284 | 75,0% |
| Cobertura de publicação | 284/359 | 79,1% |
| Concordância das exclusões | 2/9 | 22,2% |

Ramo aceita tema exato, ancestral ou descendente; irmãos divergem. As duas exclusões geradas pela variante divergem da referência. A referência também pode conter erros: estes números são concordância exploratória, sem revisão jurídica humana independente de todos os itens. A meta de 95% nas publicadas não foi alcançada. A confiança do CSV é declarada pelo classificador e não calibrada.

## Custos

O custo conhecido estimado da v20-r2 foi US$34,65528266; a recuperação acrescentou US$0,62331420. Total: **US$35,27859686**, cerca de **US$0,098269 por decisão concluída**. Inclui classificador, juiz, respostas rejeitadas pela validação e retentativas; não inclui o custo dos outros experimentos históricos ou da construção do RAG.

Além desse total, permanecem US$16,4604848 em reservas da primeira tentativa interrompida sem resposta HTTP: são consumo desconhecido, não cobrança confirmada. Assim, o controle local mantém US$51,73908166 conhecidos ou reservados, de US$75 autorizados, com US$23,26091834 disponíveis. O teto autorizado não é gasto realizado e estes valores não comprovam aplicação de crédito promocional ou fatura Google.

Foram reconciliados, com backup e evidência dos logs, 28 HTTP 429 confirmados. A [política oficial de preços](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing) informa cobrança de entrada/saída somente para respostas 200. As falhas sem resposta continuam reservadas. Relatórios anteriores mostram a contabilidade conservadora existente na data de suas paradas.

Contagem: 767 envios na v20-r2 e 21 na recuperação, totalizando 788; a interrupção inicial acrescenta 80 inícios locais sem resposta HTTP, preservados separadamente. Não há inferência nova na aplicação final da variante ou na reprodução do CSV.

## Tempos e sua base de cálculo

| Medida | Minutos | Escopo |
| --- | ---: | --- |
| Processamento ativo | 178,4 | Soma das durações das quatro invocações v20-r2/recuperação; inclui espera interna, validação e salvamento. |
| Intervalo transcorrido | 198,2 | De 00h52min48s até 04h10min59s de 19/10, America/Fortaleza; inclui pausas entre as retomadas. |
| Soma das durações de respostas de API | 150,3 | Campo durationMs das respostas recebidas nesses dois experimentos. |

O tempo ativo é 163,6 minutos da v20-r2 mais 14,8 minutos da recuperação. Não inclui a interrupção inicial de rede nem o trabalho humano e a finalização offline posteriores. O `report.json` nativo de cada diretório descreve só sua última invocação; os relatórios anteriores foram arquivados em `run-segments/first-financial-stop/` e somados, sem confundir chamadas cumulativas com duração parcial.

## Fontes e reprodução

Fontes locais originais: manifestos, checkpoints, requisições e relatórios de `output/individual-v20/pro-judge-v20-359-r2/`, `.../pro-judge-v20-359-repair-1/` e sua derivação `...-final/`; finanças em `output/individual-v20/pro-judge-v20-359/`. Esses caminhos são auditoria local e não integram um checkout sem `output/`.

O pacote sanitizado versionado contém o necessário para revalidar decisões, avaliar e gerar o mesmo CSV: `npm ci` e `npm run delivery:reproduce`. A reprodução não reconstrói requisições de rede nem exige credenciais. A descrição detalhada dos [pacotes públicos](../reproducao/README.md) delimita seu escopo.

`previsao.txt` permanece pendente. O [relatório preliminar de 18/10 e o memo](../relatorio/README.md) são históricos; o fechamento do relatório final deve identificar esta condição, suas limitações, as decisões de projeto e a exposição aos resultados anteriores.
