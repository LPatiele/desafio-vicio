# Revisão dos prompts

> **Teste v9 — 18/10/2026:** classificador `classificador.v9-local.md` com consultas e juiz `juiz.v8-local.md` com recuperação automática. Controle novo com classificador v3. A cobertura subiu de 54% para 62%; a concordância por ramo das publicadas passou de 85,2% para 83,9%. [Resultados e limitações](../output/comparisons/rag-classificador-v9/analise.md). O padrão e os experimentos históricos permanecem documentados abaixo.

## Versões e seleção

- v1: contrato inicial dos dois papéis.
- v2: pedido de respostas concisas após o primeiro timeout; sem resultado real de classificação recebido.
- v3: explicita as fronteiras semânticas da tarefa e os critérios das rubricas. É a versão selecionada em `config/default.json`.

Os arquivos anteriores foram preservados. `classifierPrompt` e `judgePrompt` selecionam os arquivos em `src/agents/`; não é mais necessário alterar código para escolher uma versão. Os nomes aceitam apenas arquivos Markdown desse diretório. Use uma configuração copiada com os dois nomes v2 para voltar à versão anterior. É possível também alterar somente um dos papéis para isolar seu efeito. Cada configuração precisa de outro nome de experimento.

## Hipóteses da v3

| Problema potencial da versão anterior | Alteração | O que observar em teste real |
|---|---|---|
| Interpretar “não responder à prova” como dispensa de examinar a habilidade cobrada | Pede identificar o conhecimento que diferencia as respostas, sem entregar gabarito completo | Divergências entre tema do cenário e instituto perguntado |
| Confundir dúvida de resposta com dúvida de classificação | Separa controvérsia jurídica de obstáculo ao enquadramento | Revisões motivadas por ressalvas que não mudam o destino |
| Tratar uma frase falsa da questão como evidência inválida do assunto | Distingue assunto da proposição e sua veracidade | Pareceres de evidência que confundem alternativa errada com citação irrelevante |
| Julgar pelas palavras coincidentes ou por confiança declarada | Exige relação entre comando, evidência e escopo do tema | Aprovações sem distinção concreta de concorrentes |
| Usar nós amplos para disfarçar ausência de tema | Explicita especificidade e diferença entre pertencer a uma disciplina e ter destino temático adequado | Uso de raízes, nós genéricos e decisões fora |
| Não distinguir incerto de inadequado de forma consistente | Dá âncoras próprias para cada rubrica e cada estado | Justificativas coerentes com os estados escolhidos |
| Criar alertas por estilo ou por falta de pesquisa externa | Restringe alertas a obstáculos materiais para classificação | Cobertura perdida por observações sem efeito no tema |
| Campos contraditórios em pareceres de fora | Define tratamento para fora confirmado, contestado e para proposta dentro da árvore considerada inadequada | Validações rejeitadas e itens sem sugestão possível |

Essas são hipóteses de melhoria, não resultados medidos. Uma resposta simulada permite verificar o formato e o fluxo, mas não prova que um modelo seguirá as instruções nem melhora a precisão.

## Contrato preservado

Os campos dos JSONs e as regras determinísticas de decisão não mudaram. Evidências continuam sujeitas a busca literal e os temas continuam sujeitos a validação de IDs ativos. A exigência atual de ao menos um concorrente foi mantida; a v3 permite usar o pai para discutir especificidade quando não existir irmão plausível. Se a exigência incentivar concorrentes artificiais em testes, sua revisão exigirá mudar a validação explicitamente.

A confiança continua subjetiva. Para fora, o classificador usa zero por convenção de ausência de tema central, sem converter esse número em confiança na exclusão.

O juiz continua recebendo a proposta junto com a questão. A instrução de examinar primeiro o problema não cria uma avaliação cega. A política conservadora ainda pode encaminhar muitos itens à revisão; o efeito sobre cobertura deve ser observado sem afrouxar silenciosamente os critérios.

## Avaliação proposta

1. Comparar v2 e v3 nos mesmos IDs e modelos, com lotes de até 30 e orçamento explícito. Não executar chamadas como parte desta edição dos prompts.
2. Registrar concordância e cobertura, falhas de formato, evidências rejeitadas, revisões por rubrica, uso de raízes e destinos fora.
3. Inspecionar divergências sem presumir que toda discordância com a referência seja erro do modelo.
4. Se os resultados orientarem novas alterações, registrar esses IDs como usados em desenvolvimento. Um resultado exploratório não vira teste independente.

Esta revisão usou os prompts, formatos, validações, documentação do projeto e o contrato já conhecido da taxonomia. Não consultou rótulos adicionais da referência nem incorporou exemplos rotulados de questões do case.

## Juiz com base local: v6 e v7

A v6 adapta o juiz à base SQLite versionada: trata fontes como dados, informa limitações de versão e exige IDs das fontes utilizadas. A v7 preserva o contrato e as três rubricas, mas distingue evidência textual da questão de apoio jurídico externo; exige filtrar relevância antes de usar os trechos e explicar como a fonte ajuda a distinguir temas. Não exige citações irrelevantes nem aprovação por quantidade de documentos.

`config/individual-v7-local.json` seleciona o classificador v3 e o juiz v7, com propostas do Nemotron 3.5 VL e julgamento pelo Nemotron 3 Super (esforço médio), contexto de até seis trechos/16 mil caracteres de `penal50-v2`. O teste `local-penal50-v7` reutiliza somente as 50 propostas de `individual-v3-invertido-50`, não seus pareceres, erros ou decisões. São previstas 50 chamadas ao juiz e no máximo 250 com cinco tentativas totais por questão.

A comparação com o histórico mede conjuntamente prompt, contexto recuperado, exposição do rótulo original e veto de publicação por lacuna. Não isola o efeito causal da RAG. As questões e fontes deste recorte são de desenvolvimento; a referência própria continua exclusiva da autoavaliação posterior.

## Juiz v8: busca automática ou consultas ao SQLite

`juiz.v8-local.md` substitui a afirmação de ausência de ferramentas por instruções condicionais. Com ferramentas, o juiz escolhe termos jurídicos, verifica concorrentes quando necessário e pode consultar artigos ou ler um resultado. Sem ferramentas, avalia os documentos já recuperados. As rubricas e o tratamento de citações são comuns às duas condições. O prompt não recebe respostas nem rótulos da referência v2. No modo de ferramentas, o contrato JSON do parecer já está presente na primeira mensagem e é reforçado pelo transporte na etapa final.

Configurações: `individual-v8-auto.json` e `individual-v8-judge-tools.json`. A primeira busca é obrigatória; as subsequentes dependem do juiz e do orçamento. Até cinco chamadas totais incluem ferramentas e falhas. IDs válidos demonstram entrega do documento, não validade da inferência jurídica.

## Classificador v9 com consultas locais

`classificador.v9-local.md` mantém o conteúdo temático do classificador v3 e acrescenta instruções para consulta escolhida ao SQLite antes da proposta. O classificador considera concorrentes e exceções, pode buscar texto, consultar artigo ou ler um documento recuperado, e continua usando apenas trechos da questão em `evidencias`. A proposta final menciona diploma/artigo quando necessário; IDs S- e respostas das ferramentas ficam em seu histórico próprio, sem serem transmitidos como fontes verificadas pelo juiz.

O juiz continua com `juiz.v8-local.md`, recebendo a recuperação automática. A referência de avaliação e o rótulo original não são oferecidos ao classificador. O controle v9 usa `classificador.v3.md` sem ferramentas e o mesmo juiz v8, com propostas recém-geradas nas duas condições. A comparação mede a estratégia completa, incluindo novas rodadas de inferência e contexto, não apenas o efeito isolado de ler documentos.

**Limite observado no teste v9:** além de duas rodadas e quatro operações no total, o cliente aceita no máximo duas operações por resposta. A Q0037 solicitou três de uma vez e foi recusada antes da execução; o envio seguinte finalizou a proposta. O prompt v9 não explicita esse teto por resposta. O caso está registrado no relatório; a correção do texto deve ser versionada para outro experimento.
