# Auditoria de alinhamento com o desafio

Data: 18/10/2026. Escopo: releitura integral das três páginas do PDF, conferência visual, leitura do LEIA-ME e do modelo de entrega, análise integral da estrutura dos 359 registros e dos 377 temas, inspeção do pipeline e inventário dos experimentos existentes. Não foram feitas inferências, consultas jurídicas novas ou alterações de código/configuração.

## Parecer

O núcleo da solução permanece alinhado: classificar pelo conhecimento cobrado, usar a árvore fornecida, controlar a publicação e encaminhar incerteza para revisão. Houve, porém, um deslocamento de esforço para pesquisa jurídica, RAG, integrações e comparações repetidas nas primeiras 50 questões. Esses recursos são permitidos e podem ajudar, mas ainda não produziram a entrega completa nem evidência suficiente sobre a precisão no conjunto final.

A prioridade deve passar de ampliar mecanismos de consulta para concluir uma política de publicação verificável, as 359 decisões, a autoavaliação e a comunicação da entrega. O trabalho construído deve ser preservado como implementação e histórico experimental.

## O que o desafio efetivamente exige

Fontes: [PDF, páginas 1–3](../case-ia-classificacao-de-topicos.pdf), [dicionário e formato](../anexos/LEIA-ME.md), [modelo de CSV](../anexos/entrega_modelo.csv).

| Exigência | Situação encontrada | Avaliação |
| --- | --- | --- |
| Uma decisão para cada uma das 359 questões: publicar, revisar ou fora | Preparação cobre 359. A união dos 20 experimentos em `output/experiments/*/records.json` tem propostas, pareceres e decisões somente para Q0001–Q0050. Nenhum experimento conclui mais de 50 decisões. | Incompleto: 309 questões ainda sem classificação pelo pipeline. A referência própria de 359 registros não equivale à execução. |
| Pelo menos 95% de acerto nas publicadas; maximizar cobertura respeitando isso | Existem regras conservadoras e comparação com referência provisória. O piloto mais recente tem sete acertos por ramo em sete publicações, em dez itens já usados no desenvolvimento. | Sinal exploratório positivo; não demonstra o resultado nas 359 nem nos rótulos dos especialistas. |
| Aceitar tema exato, pai ou filho; rejeitar irmão | `relationship()` e `matchesBranch()` distinguem exato, ancestral, descendente, irmão e distinto. | Alinhado. Concordância por ramo é a métrica principal compatível com o case. |
| Usar os temas fornecidos, excluindo inativos | Os agentes recebem a árvore ativa; propostas e pareceres validam os IDs e o status. | Alinhado. Recomendações de mudança na árvore pertencem ao memo, sem trocar os IDs oficiais da entrega. |
| Tema sugerido obrigatório tanto em publicar quanto em revisar | Motor exige tema válido; conflito de fora sem sugestão permanece pendente. | Contrato respeitado, mas pendências precisam de tratamento explícito antes da entrega. |
| `publicacao.csv` no formato do anexo | Exportador implementado com as seis colunas corretas; bloqueia exportação com pendências. | Preparado, ainda sem artefato final. `tema_central_id` é o nome exigido pelo anexo. |
| `previsao.txt`, com precisão, cobertura, intervalos e explicação | Gerador existe quando se fornece previsão; não há entrega nem previsão final. | Incompleto. Confiança declarada pelo modelo não substitui autoavaliação. |
| Relatório de até cinco páginas: raciocínio, diagnóstico, produção e memo para professor de uma página | Há diário, análises e documentos técnicos distribuídos. Não foi encontrado relatório final consolidado nem memo específico concluído. | Material de base disponível; falta síntese dentro do limite. Leitura prudente: reservar uma das cinco páginas para o memo. |
| Cenário de 50 mil questões semanais, novas importações, custo por questão, qualidade contínua, revisão e reportes | Módulo de preparação e desenho parcial estão documentados. Não há solução de produção validada em escala. | O desafio pede um desenho explicado, não uma infraestrutura de produção concluída. Falta consolidar custos, controles e fluxo humano. |
| Código do início ao fim, prompts, regras, método de estimativa, modelos, custo, tempo e registro de decisões manuais | Pipeline, prompts versionados, manifestos, checkpoints, respostas e consumo estão disponíveis. README contém comandos, mas acumula instruções de versões distintas. | Boa rastreabilidade; falta caminho único de reprodução da entrega escolhida e identificação clara do histórico. |
| Repositório público com os artefatos e envio do link | Não há `.git` na raiz inspecionada; `output/delivery` não existe. Não foi verificada a existência de repositório remoto. | Publicação final não comprovada localmente. `.gitignore` exclui `output/`, onde o exportador grava a entrega. Os artefatos e os dados necessários ao RAG deverão ser incluídos explicitamente ou ter reconstrução documentada. Nenhuma publicação/envio foi realizado nesta auditoria. |

O prazo informado no PDF é domingo, 18/10, coincidente com a data desta auditoria. Isso reforça a prioridade de fechamento; não autoriza publicar o repositório ou enviar mensagem automaticamente.

## Correção importante na interpretação das métricas

O próprio PDF, página 2, aceita o nó atribuído pela equipe ou um pai/filho dele. Outro subtema do mesmo tema é erro. Portanto:

- A métrica principal deve ser **acerto por ramo entre as publicadas**, estimado com as limitações da referência disponível.
- Coincidência exata é diagnóstico secundário de granularidade, não um requisito adicional de 95%.
- Compartilhar uma disciplina ou um ancestral não basta: nós irmãos continuam errados. A implementação atual não os aceita como acerto.
- Não há fundamento para substituir uma escolha específica sustentada por uma raiz genérica apenas para elevar concordância. O contexto do desafio denuncia justamente os tópicos que viraram lixeiras.

No [piloto Gemini mais recente](../output/comparisons/gemini-flash-v11/analise.md), as diferenças Q0001 (filho em vez de pai) e Q0007 (pai em vez de filho) são aceitas pela régua oficial em relação à referência própria. Os 71,4% exatos não constituem, por si, falha na meta do case. O número compatível com essa régua é 7/7, ou 100% por ramo, **contra a referência provisória**.

Esse 100% também não certifica 95% nas próximas questões: são apenas sete publicações, em itens expostos a ajustes anteriores. O intervalo Wilson de 95% é aproximadamente 64,6%–100%; a referência não é o gabarito da equipe. O PDF pede previsão com intervalo, mas não exige um método estatístico específico nem que o limite inferior do intervalo seja 95%.

Também é necessário fixar o denominador da cobertura: sete publicações em dez itens significam 70% **no piloto**. Na entrega completa, cobertura é `publicadas/359`. A proporção atual 7/359, aproximadamente 1,95%, descreve somente as publicações já existentes nessa configuração, sem estimar o resultado dos 349 itens restantes.

## Onde o foco se deslocou

### 1. Classificação temática e resolução jurídica passaram a se misturar

Pesquisar legislação pode resolver uma fronteira entre temas. Conferir a alternativa correta, a vigência de cada regra e cada afirmação de uma justificativa é um objetivo mais amplo. O case avalia se o aluno receberá a questão no tópico adequado, e explicita que saber Direito Penal de cor não é requisito.

Os prompts atuais já fazem essa distinção: [classificador v9](../src/agents/classificador.v9-local.md) não deve entregar gabarito ou resolução; [juiz v8](../src/agents/juiz.v8-local.md) só deve tratar controvérsia jurídica como obstáculo quando ela afetar o enquadramento. Essa orientação está alinhada e deve prevalecer na interpretação dos resultados.

Uma justificativa com erro jurídico precisa ser registrada e pode revelar fragilidade do agente. Entretanto, não transforma automaticamente um tema correto em tema errado para a métrica oficial. A conferência jurídica deve apoiar decisões temáticas e documentar riscos, sem se tornar um segundo produto obrigatório para todas as 359 questões.

### 2. O RAG virou dependência do recorte de teste

A base foi construída deliberadamente para cinquenta questões, conforme autorizado. Isso era adequado ao experimento, mas a configuração atual não é ampliável às 359 apenas mudando `--limit`.

Evidência concreta: [KnowledgeStore.gapsFor](../src/knowledge/store.ts:34) lança erro para IDs ausentes do escopo. A consulta local, somente de leitura, abriu `penal50-v3` e confirmou:

```text
{"base":"penal50-v3","escopo":50}
Questão fora do recorte da base: Q0051
```

Além disso, [decideRecord](../src/retrieval/decision.ts:9) transforma publicação em revisão quando a base não retorna trechos ou declara lacunas. No piloto, Q0002 coincide com a referência, mas vai para revisão por lacuna doutrinária. A política pode proteger precisão; também pode consumir tempo do professor por insuficiência da base, em vez de dúvida temática.

Recomendação: preservar o RAG e avaliar seu uso para fronteiras em que ele muda o enquadramento. Antes da execução completa, remover a dependência obrigatória dos cinquenta IDs ou construir cobertura documental adequada. Uma consulta ausente precisa ser tratada como limite de conhecimento e não como falha irrecuperável de escopo. Qualquer mudança exige nova configuração/experimento e medição do efeito na publicação.

### 3. A experimentação ficou concentrada em um conjunto conhecido

Todos os resultados encontrados estão contidos nas primeiras cinquenta questões; a configuração Gemini mais recente concluiu dez. Repetir esses itens é útil para depurar transporte e comparar comportamento pareado. Usá-los repetidamente para escolher prompts, modelos, documentos e políticas deixa a estimativa otimista para itens novos.

A [referência v2](../referencias/analise-propria-v2/README.md) reconhece que esses cinquenta itens foram expostos e que os outros 309 herdam a análise v1. Não receber rótulos oficiais é parte do desafio. Criar referência própria é permitido como método de autoavaliação, mas concordar com ela não equivale a concordar com os especialistas.

O código separa referência de avaliação e contexto de inferência, um ponto positivo. A seleção e a curadoria documental também foram orientadas pelos itens conhecidos; separar arquivos não elimina a adaptação experimental a esse recorte. Não há evidência aqui de injeção dos rótulos de referência nos prompts.

Recomendação: congelar a configuração antes de avaliar itens adicionais, selecionar uma amostra distribuída no restante do conjunto e registrar suas exposições. Uma divisão aleatória criada agora não torna os primeiros cinquenta inéditos, nem torna a referência independente. Declarar essas limitações na previsão e no relatório.

### 4. A rastreabilidade cresceu mais que a síntese de entrega

O histórico registra falhas de MCP/API, tentativas, alterações e comparações; isso atende ao pedido de mostrar os becos sem saída. Entretanto, o PDF diz expressamente que infraestrutura sofisticada, modelo caro e volume de páginas não são critérios de mérito. Mais uma integração ou troca de modelo precisa justificar ganho de precisão/cobertura frente a custo e prazo.

Recomendação: arquivar o histórico como apoio e dar destaque ao protocolo escolhido, resultados, limitações, diagnóstico dos dados e ação esperada do professor. O README final precisa apontar um caminho principal que gere os arquivos entregues; versões históricas devem ficar claramente identificadas.

## O que os anexos mostram e deve ganhar espaço no diagnóstico

Fontes: [questões](../anexos/questoes.jsonl), [árvore](../anexos/temas.csv). Contagens feitas sobre os arquivos completos, sem inferir tema correto a partir da origem.

- **377 temas, 375 ativos e dois inativos**, distribuídos em quatro raízes, 111 nós de nível 1 e 262 de nível 2. Não foram encontrados pais ausentes. Os inativos são 5078 e 5234.
- Há oito títulos repetidos em lugares diferentes. Por exemplo, Lei Maria da Penha aparece como 4704 na legislação especial e 6724 em Penal; Lei de Execução Penal como 4703 na legislação especial e 6734 em Processo Penal; Ação Penal como 5063 em Penal e 5466 em Processo Penal. Sem regra editorial explícita, o mesmo conteúdo pode sugerir ramos diferentes, o que tem consequência na régua oficial.
- Existem títulos genéricos e descrições com contagens herdadas da origem. Essas contagens não demonstram o escopo correto de um tema nem sua adequação à questão. O professor deve ajudar a definir fronteiras e exemplos de inclusão/exclusão, especialmente nesses nós.
- As 359 questões possuem IDs únicos e alternativas em objeto: 255 com cinco alternativas, 46 com quatro e 58 com duas. Duas alternativas não significam material incompleto.
- Há 94 comandos literalmente vazios nos dados crus e 101 vazios depois da limpeza de marcação/espaços. Muitas questões continuam identificáveis pelo enunciado e pelas alternativas. Comando vazio, isoladamente, não deve implicar revisão.
- A limpeza alterou o texto de 160 enunciados; nenhum ficou vazio e nenhum item recebeu aviso material da preparação atual. Isso é diagnóstico estrutural, não comprovação de preservação semântica perfeita.
- Dezoito questões não têm assunto de origem. Há nomes de disciplinas heterogêneos e origens fora das quatro disciplinas da árvore. O próprio LEIA-ME informa que esses rótulos podem estar errados; eles são pistas, não gabarito nem justificativa suficiente para `fora`.
- Exemplo direto de ruído: Q0051 vem em “Concurso de Crimes”, mas o comando e as alternativas perguntam pela aplicação da lei brasileira a fatos fora do território nacional. A origem pode enviesar uma recuperação se não for confrontada com o texto.
- Questões com várias assertivas, como Q0001 e Q0037, exigem distinguir o assunto do conjunto de uma menção isolada. Esse é um problema de classificação e de desenho da árvore que merece mais destaque que corrigir toda a prova.

No memo, pedir ao professor: critérios para títulos duplicados entre disciplinas; fronteiras dos tópicos amplos; tratamento de questões multitemáticas; e revisão prioritária das divergências que atravessam ramos. Recomendar mudanças sem alterar unilateralmente a árvore oficial usada no CSV.

## Pendências técnicas relacionadas à entrega

1. **Referência da confiança:** [calibrate](../src/evaluation.ts:159) chama `evaluate()` sem selecionar versão e usa v1 por padrão; [exportDelivery](../src/export.ts:20) também valida contra a referência padrão v1. As análises recentes usam v2. A referência e a métrica precisam ser explícitas e consistentes para não estimar confiança com uma versão e apresentar resultados de outra. O uso de acerto por ramo nessa estimativa está correto para o case.
2. **Calibração ainda não executada:** não existem `output/split.json` nem `calibration.json` nos experimentos inspecionados. O estimador agrupado atual não é uma calibração individual demonstrada. Confiança declarada 1,0 em itens depois rejeitados reforça que não se deve interpretá-la como certeza.
3. **Pendências de execução:** erro técnico não é decisão editorial. A entrega não admite linhas ausentes, mas também não justifica preencher `fora` ou sugerir raiz sem análise. Se for necessário decidir manualmente, o PDF permite, desde que cada decisão e seu motivo sejam registrados.
4. **Previsão obrigatória:** o exportador aceita gerar CSV sem `--forecast`. Isso é útil durante desenvolvimento; a checagem da entrega completa deve exigir os dois arquivos. O formato implementado do `previsao.txt` corresponde ao LEIA-ME. A cobertura do CSV concluído é uma fração conhecida e pode ter intervalo degenerado, com explicação; não precisa ser estimada a partir do piloto.
5. **Empacotamento:** a pasta de saída inteira está ignorada pelo Git. Além do CSV e da previsão, a reprodução do modo RAG depende do snapshot. Definir o que será versionado e como reconstruir o restante, preservando credenciais fora do repositório. Nada disso foi alterado nesta auditoria.

## Ordem recomendada para retomar o foco

1. Assumir a régua oficial por ramo como principal e manter coincidência exata e validade jurídica das justificativas como diagnósticos separados.
2. Congelar uma configuração candidata; corrigir o bloqueio de escopo do RAG e alinhar a referência usada para avaliação/confiança antes de ampliar a execução.
3. Avaliar itens adicionais distribuídos nas disciplinas e nos tipos de dificuldade, com protocolo congelado, mantendo o status exploratório e as limitações da referência. Usar o resultado para uma previsão honesta; não declarar 95% garantidos a partir das três rubricas ou de sete publicações.
4. Concluir uma decisão válida para cada questão e registrar eventuais intervenções humanas. Não montar um resultado escolhendo retrospectivamente o melhor tema de cada experimento contra a referência.
5. Gerar e validar os 359 IDs, temas ativos, campos obrigatórios, confiança, CSV e previsão. Aumentar cobertura somente com sustentação da precisão, em vez de considerar revisão máxima um objetivo em si.
6. Consolidar o relatório em até cinco páginas com o memo de uma página. Incluir desenho de produção para 50 mil/semana, custo aproximado por questão com hipóteses de cache/retentativas, tempo observado e limites de extrapolação; monitoramento amostral de publicadas; fila do professor; reportes dos alunos; e reprocessamento por mudança de questão/taxonomia.
7. Preparar repositório e instruções reproduzíveis. Publicação e envio são ações posteriores; não foram executados.

Não é necessário recomeçar a solução. A arquitetura, a preparação reutilizável, o histórico e os controles existentes são aproveitáveis. O ajuste é transformar esse trabalho experimental em decisões completas e em uma autoavaliação que corresponda ao critério real do desafio.
