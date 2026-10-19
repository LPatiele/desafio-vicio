# Relatório de execução

## Desafio de classificação de tópicos — Vício

## 01. Resumo executivo

**Problema, solução e principais resultados**

O desafio consiste em atribuir uma decisão a cada uma das 359 questões, maximizando a cobertura de publicação e respeitando uma precisão mínima de 95% na classificação temática das questões publicadas. Os destinos devem pertencer à árvore fornecida, composta por 377 temas. Para cada questão, as decisões possíveis são `publicar`, `revisar` ou `fora`, quando nenhum tema da árvore for adequado.

Para atender a esse objetivo, implementei uma solução com dois agentes, nos papéis de classificador e juiz. A proposta inicial foi utilizar modelos diferentes para cada papel, embora algumas condições também tenham usado o mesmo modelo em chamadas separadas.

Ao longo do projeto, realizei pelo menos 23 experimentos, avaliados com referências próprias. Os resultados consolidados até esta etapa não demonstraram o atendimento à meta de precisão. As hipóteses, decisões e limitações são apresentadas nas seções seguintes.

**Conclusão do desafio.** O desafio se encerra com um pipeline funcional e rastreável e uma execução com decisões para todas as 359 questões, mas sem comprovação da precisão mínima exigida. O último experimento apresentou um ganho pequeno de concordância, acompanhado de menor cobertura e maior custo. O trabalho deixa uma base documentada para revisão especializada e novos testes antes da adoção em produção.


## 02. Diagnóstico inicial

**Dados, riscos e dificuldades**

Iniciei a exploração do desafio consultando avaliações comparativas de modelos, como OAB-Bench, Magis-Bench e LegalScore. Os resultados consultados orientaram meu interesse pelos modelos Gemini, mas não substituem a avaliação no contexto específico deste projeto.

A intenção inicial, porém, era executar o desafio sem custos de inferência, utilizando modelos gratuitos disponíveis no OpenRouter. As primeiras etapas envolveram os seguintes modelos:

| Modelo | Como foi usado |
| --- | --- |
| **Nemotron 3 Super 120B A12B** — `nvidia/nemotron-3-super-120b-a12b:free` | Classificador e juiz, em diferentes combinações nos primeiros testes. |
| **Gemma 4 31B** — `google/gemma-4-31b-it:free` | Classificador planejado para o primeiro piloto. As tentativas não produziram classificações devido à indisponibilidade do serviço. |
| **Dots 3 Note Preview** — `dots-studio/dots-3-note-preview:free` | Classificador e juiz em pilotos distintos, antes da adoção da combinação Nemotron 3.5/Nemotron 3. |
| **Nemotron 3.5 Super VL** — `nvidia/nemotron-3.5-super-vl:free` | Testado nos dois papéis e, posteriormente, utilizado como classificador nos experimentos individuais e com recuperação de documentos. |

Como o gabarito oficial não estava disponível, elaborei uma referência provisória com apoio do modelo GPT-6.1-Sol, configurado com nível alto de esforço. O objetivo era criar uma base de comparação para investigar hipóteses e acompanhar mudanças na arquitetura. A escolha de um modelo de alta capacidade, entretanto, não garante que a referência esteja correta nem elimina vieses de avaliação.

A primeira versão foi produzida a partir do `Prompt1.md`. Posteriormente, a referência passou a contar com procedimentos de consolidação e revisão, documentados em `consolidar-referencia.mjs` e `scripts/referencia-v2.py`. Essa referência foi utilizada exclusivamente na avaliação posterior, sem ser fornecida aos agentes como resposta esperada. Por não ter validação humana independente, os percentuais apresentados representam concordância com uma referência provisória.

## 03. Arquitetura e metodologia

**Classificador, juiz e motor de decisão**

O fluxo foi organizado nas seguintes etapas:

**Preparação dos dados → Classificador → Validação da proposta → Juiz → Validação do parecer → Motor de decisão → Geração do arquivo de resultados → Avaliação.**

Na preparação, o objetivo foi remover HTML e outros resíduos de formatação dos enunciados e das alternativas, preservar os arquivos originais e selecionar apenas os temas ativos para envio aos agentes.

O classificador propõe o tema central, os assuntos adicionais, os temas concorrentes, as evidências e uma justificativa. Também pode indicar que não encontrou um tema adequado na árvore.

A validação da proposta confere o formato da resposta, os IDs, o status dos temas, os trechos citados e a correspondência com as questões enviadas. Em seguida, o juiz avalia criticamente a proposta de acordo com as rubricas abaixo.

| Rubrica | O que verifica |
| --- | --- |
| **Tema central** | O tema escolhido representa o conhecimento cobrado pela questão, considerando enunciado, comando e alternativas? |
| **Evidência textual** | Os trechos apresentados sustentam esse enquadramento? Uma alternativa juridicamente falsa ainda pode revelar o assunto cobrado. |
| **Distinção de concorrentes** | A proposta explica por que o tema escolhido é mais adequado que os outros temas plausíveis, inclusive quanto à especificidade? |

Cada rubrica recebe uma avaliação — `sustentado`, `incerto` ou `inadequado` — acompanhada de justificativa. O retorno do juiz também passa por validação, incluindo a conferência do formato, do ID da questão, dos temas indicados, das contradições previstas nas regras e, quando aplicável, das fontes citadas. Essas verificações não garantem a correção da interpretação jurídica.

O motor de decisão aplica regras explícitas para publicar, encaminhar à revisão ou indicar `fora`. Para publicar, as três rubricas precisam estar sustentadas, além de cumprir as demais condições da política. Por fim, são gerados o arquivo de resultados e a avaliação da execução.

Em parte dos experimentos, os agentes receberam documentos de uma base local por meio de RAG, sigla para geração aumentada por recuperação. Nessa abordagem, a aplicação busca trechos relevantes e os oferece como contexto para a análise.

## 04. Experimentos realizados

**Hipóteses, decisões e limitações**

O quadro a seguir resume as principais decisões e os motivos que orientaram a sequência de testes.

| Experimento / etapa | Decisão tomada | Justificativa |
| --- | --- | --- |
| Gemma/Nemotron inicial | Testar o Nemotron após a indisponibilidade do Gemma. | Seis tentativas do Gemma retornaram HTTP 429, sem classificação. |
| Nemotron nos dois papéis | Executar classificador e juiz em chamadas separadas do mesmo modelo. | Verificar o fluxo com um modelo disponível, reconhecendo que as avaliações não eram independentes. |
| Dots/Nemotron inicial | Exigir JSON Schema e manter a validação local. | A resposta do Dots omitiu campos obrigatórios e utilizou nomes incorretos. |
| Primeiro lote de trinta | Ampliar o tempo limite de resposta e solicitar justificativas concisas. | A chamada terminou sem resposta utilizável após cinco minutos. |
| Lote de vinte | Testar a execução com raciocínio desativado. | O raciocínio consumiu quase todo o limite de saída e deixou o JSON incompleto. |
| Vinte questões sem raciocínio | Reduzir os lotes para dez e aumentar o esforço de raciocínio. | O fluxo foi concluído, mas publicou sete destinos divergentes entre vinte questões, segundo a referência histórica utilizada naquele teste. |
| Dois lotes de dez | Trocar o juiz Dots pelo Nemotron 3.5. | Mais raciocínio não melhorou o resultado agregado e aumentou o tempo de processamento. A troca permitiu investigar outra combinação de modelos. |
| Comparação dos papéis | Usar o Nemotron 3.5 como classificador e o Nemotron 3 como juiz nos testes seguintes. | A combinação invertida apresentou melhor conclusão técnica e maior concordância das propostas naquele recorte. |
| Comparação dos prompts v2/v3 | Retomar a v3 no teste individual. | A v2 apresentou mais rejeições e pendências, sem ganho consistente demonstrado. |
| Envio individual | Adotar tentativas com contagem persistente e recuperar somente a etapa ausente. | Evitar refazer respostas válidas e limitar o consumo por questão. O envio individual, porém, não superou os lotes em qualidade. |
| Pesquisa LexML | Construir uma base local congelada. | As tentativas de acesso por MCP e API direta encontraram bloqueios. A base local permitiria consultas reproduzíveis. |
| Primeiro RAG | Corrigir a segmentação dos documentos e o planejamento das buscas. | Foram encontrados cabeçalhos associados ao artigo errado e uma consulta inadequada para Q0007. |
| Juiz com ferramentas | Testar consultas no classificador, mantendo a recuperação automática para o juiz. | As ferramentas do juiz aumentaram a cobertura e o número de chamadas, mas reduziram a concordância entre as publicadas. |
| Classificador com ferramentas | Investigar outros modelos, preservando a arquitetura. | O ganho de cobertura foi limitado diante do consumo adicional, sem atingir 95% de concordância. |
| Gemini Flash | Ampliar a base para 359 questões e incorporar material doutrinário. | O piloto pequeno apresentou um sinal positivo, mas a base anterior estava restrita a cinquenta IDs e tinha lacunas documentais. |
| Limites e serialização | Distinguir bloqueios de frequência, cota diária e faturamento. | Pausas locais não resolviam limites diários nem saldo esgotado. |
| Lotes pagos | Comparar lotes de trinta, vinte e dez questões em condições separadas. | Investigar velocidade e custo diante do prazo, preservando o teste individual. |
| Vertex | Validar o novo canal de acesso em um piloto antes de ampliar a execução. | Era necessário confirmar o funcionamento das chamadas aos modelos após os bloqueios anteriores. |
| v19 sem RAG | Retirar as consultas e ferramentas dos dois agentes. | A consulta obrigatória por ID vinha causando muitas pendências. A v19 concluiu as 359 decisões, mas apresentou 85,2% de concordância entre as publicadas. |
| v20 com juiz Pro | Testar o juiz Pro e o envio individual, sem RAG. | Investigar outra combinação após a conclusão técnica da v19, ainda abaixo da meta. A r2 terminou com 354 decisões e cinco pendências, sem atingir a meta de 95% de concordância. |

## 05. Avaliação dos experimentos

**Precisão, cobertura, comparações e resultados**

O detalhamento de todos os experimentos tornaria o relatório extenso e dificultaria o cumprimento do limite de cinco páginas. Por isso, os resultados por condição estão reunidos no arquivo complementar [Resultados das experimentações](tabela-resultados-experimentacoes.md), com links para as pastas, questões avaliadas, precisão, cobertura, custos e comparações.

O último experimento, `pro-judge-v20-359-r2`, utilizou o Gemini 3.1 Pro como juiz e processou uma questão por chamada. A v19 usava o Gemini 3.8 Flash como juiz, em lotes de dez. Ambas mantiveram o classificador Gemini 3.5 Flash-Lite, os mesmos prompts e a mesma taxonomia, sem RAG. Os resultados abaixo foram comparados com a referência provisória v2.

**Comparação v19 × v20-r2.**

| Indicador | v19 — experimento anterior | v20-r2 — último experimento | Ganho ou perda observada |
| --- | ---: | ---: | --- |
| Questões com decisão | 359/359 | 354/359 | Cinco questões permaneceram pendentes. |
| Publicadas | 311 | 282 | 29 publicações a menos. |
| Encaminhadas à revisão | 43 | 66 | 23 revisões a mais. |
| Classificadas como `fora` | 5 | 6 | Uma exclusão a mais. |
| Concordância por ramo entre publicadas | 85,2% | 85,8% | Ganho de 0,6 ponto percentual. |
| Concordância exata entre publicadas | 71,4% | 75,2% | Ganho de 3,8 pontos percentuais. |
| Cobertura de publicação | 86,6% | 78,6% | Redução de 8,1 pontos percentuais. |
| Custo conhecido estimado | US$ 4,74 | US$ 34,66 | Aproximadamente 7,3 vezes maior. |
| Custo conhecido por decisão concluída | US$ 0,0132 | US$ 0,0979 | Aproximadamente 7,4 vezes maior. |
| Tempo total decorrido | 38 min 49 s | 2 h 47 min 02 s | Aproximadamente 4,3 vezes maior. |
| Tempo médio por decisão concluída | 6,5 s | 28,3 s | Aproximadamente 4,4 vezes maior. |
| Chamadas aos modelos | 94 | 767 | Aproximadamente 8,2 vezes mais chamadas. |

As diferenças foram calculadas com os valores não arredondados. O tempo total inclui pausas e retomadas. O custo da v20-r2 inclui classificador, juiz e retentativas, mas ainda há dezenove chamadas sem custo confirmado, com reservas conservadoras de US$ 20,33. Essas reservas não equivalem a cobrança comprovada. A tentativa inicial interrompida está registrada separadamente e não integra os valores da r2 apresentados no quadro.

A v20-r2 produziu 359 propostas, mas somente 354 pareceres e decisões. Entre as 282 publicadas, houve 242 concordâncias por ramo. A comparação pareada mostra que, nas mesmas 262 questões publicadas pelas duas condições, a v20 teve 225 concordâncias e a v19, 224. Nove questões passaram de divergentes para concordantes e oito fizeram o caminho contrário, resultando em apenas uma concordância adicional nesse conjunto.

Assim, o último experimento apresentou ganhos pequenos de concordância, acompanhados de perdas de cobertura, conclusão técnica, custo e tempo. A meta de 95% não foi atingida em nenhuma das duas condições em relação à referência provisória. Como o modelo do juiz e o tamanho do lote mudaram juntos, não é possível atribuir as diferenças exclusivamente ao Pro. Os resultados não demonstram uma vantagem consistente que justifique sua adoção nessa configuração.

## 06. Escalabilidade e evolução

**Próximos passos e hipóteses não exploradas**

Como os resultados consolidados até esta etapa ainda não demonstram o atendimento à meta, não considero a solução validada para uso em escala. Com mais tempo e recursos, priorizaria a investigação das hipóteses que possam melhorar a qualidade antes de ampliar a operação.

**Resiliência e tratamento de pendências.** Também é necessário desenvolver estratégias de maior resiliência para os casos que permanecem sem decisão, como o roteamento para outro modelo após o esgotamento das tentativas previstas. Essas alternativas precisam preservar o histórico, os limites de custo e as validações, além de ser avaliadas quanto ao impacto na qualidade. Como a prioridade dos experimentos foi alcançar 95% de precisão entre as questões publicadas, a recuperação de pendências e outros aspectos de implementação receberam menor aprofundamento e permanecem como pontos de evolução.

Uma alternativa seria testar o Gemini 3.1 Pro como classificador, motivada pelos resultados das avaliações comparativas consultadas, em conjunto com uma base de recuperação mais robusta. Também consideraria explorar uma base vetorial, como o Weaviate, e avaliar se a recuperação por similaridade oferece contexto mais relevante que a busca utilizada nos experimentos. Essas possibilidades são hipóteses para novos testes, não ganhos já demonstrados.

Para continuar com modelos menores, investigaria outras formas de ampliar o contexto documental. A integração ao LexML permaneceu limitada por dificuldades de acesso; por isso, seria necessário avaliar outras fontes e formas de consulta. Outra possibilidade seria explorar o ajuste de um modelo ao domínio jurídico, considerando alternativas como o Jurema 7B e verificando sua adequação à tarefa antes de qualquer adoção.



## 07. Memorando para o professor

**Assunto: critérios para publicar questões no tópico certo**

Professor(a),

Uma revisão especializada da árvore de temas seria importante para melhorar a classificação. Há categorias com nomes muito próximos que merecem ser examinadas para identificar sobreposições e avaliar uma possível unificação. A ausência de descrições, ou o uso de descrições genéricas, também dificulta a distinção entre alguns temas.

Uma dificuldade recorrente é que o assunto mencionado no enunciado nem sempre corresponde ao conhecimento necessário para responder à questão. Um item pode descrever um furto e cobrar o recurso contra uma decisão judicial. Outro pode reunir várias etapas do júri e não caber integralmente em um único subtema. Precisamos de critérios editoriais consistentes para esses casos.

Sugiro começar pelas seguintes decisões sobre a árvore:

- Definir o que cada tema amplo inclui e exclui e quando ele deve prevalecer sobre um subtema. O tema geral não deve receber questões apenas porque a máquina não conseguiu escolher um destino específico.
- Registrar exemplos que ajudem a distinguir temas irmãos. Furto e disposições gerais dos crimes patrimoniais apareceram como uma divergência concreta nos testes.
- Distinguir o tema central dos assuntos adicionais em questões que abrangem vários institutos. Pertencer à mesma disciplina não torna dois destinos equivalentes.
- Tratar os assuntos herdados da importação como pistas, sem presumir que estejam corretos. Também é necessário separar a ausência de um tema adequado da dúvida entre temas existentes.

A base documental utilizada para apoiar a classificação também tem limitações. Foram incorporados legislação, precedentes e dois livros de Criminologia, mas ainda existem lacunas. Um trecho recuperado pode ser irrelevante, e uma fonte autêntica pode ser interpretada de forma inadequada. A consulta pode facilitar a análise, mas não substitui sua decisão sobre o enquadramento editorial.

Para concluir a avaliação, preciso de sua revisão de uma amostra sorteada das questões publicadas e de casos encaminhados à revisão ou classificados como `fora`, com a indicação do destino esperado e do motivo. Também peço critérios de desempate para questões com vários assuntos e prioridades de revisão para os temas que concentram itens em excesso. Essa análise deve contemplar tanto as respostas da IA quanto possíveis equívocos na referência provisória utilizada nos testes.

No fluxo futuro, recomendo que a fila de revisão apresente a questão, o tema sugerido, o principal tema concorrente, o trecho que motivou a escolha e a dúvida identificada. As correções do professor e os relatos dos alunos devem alimentar um conjunto de exemplos revisados. Isso pode reduzir o trabalho repetitivo e ajudar a detectar quando um tópico volta a acumular questões inadequadas.

O próximo passo é transformar as ambiguidades observadas em regras editoriais verificáveis e medir os resultados com revisão especializada. O sistema já registra as etapas e os fundamentos das decisões para apoiar esse trabalho.
