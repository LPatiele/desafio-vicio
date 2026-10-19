# Histórico de desafios, decisões e testes

**Documento de trabalho, fora da síntese de cinco páginas.** Corte: 18/10/2026, 21h40, Fortaleza. As relações abaixo reconstroem a sequência documentada; não atribuem intenção retrospectiva onde só há uma hipótese. “Ganho” e “perda” descrevem resultados observados contra uma referência própria, e não o gabarito dos especialistas.

## 1. Contrato do desafio e decisões de partida

O [enunciado](../case-ia-classificacao-de-topicos.pdf) pede uma decisão para cada uma das 359 questões, usando a árvore de 377 temas. A prioridade é precisão de pelo menos 95% entre publicadas; a cobertura deve crescer respeitando essa condição. Acerta o tema exato ou um ancestral/descendente; um irmão continua errado. O [dicionário dos anexos](../anexos/LEIA-ME.md) exige tema sugerido também em revisão. O relatório deve ter até cinco páginas e incluir diagnóstico, raciocínio, produção e memo ao professor de uma página. Por prudência, a síntese inclui o memo no limite total.

A hipótese inicial foi combinar um classificador com um juiz de outro modelo, deixando preparação, validação e decisão em código. O juiz examina tema central, evidência textual e distinção dos concorrentes. A proposta segue para publicação somente quando passa pelos critérios e vetos da condição. Tema alternativo do juiz não substitui silenciosamente a proposta. Raízes genéricas são encaminhadas à revisão. Falha técnica não vira `fora`.

O juiz vê a proposta, portanto sua avaliação não é cega. Modelos diferentes podem compartilhar erros. As três aprovações não equivalem a uma probabilidade calibrada de acerto.

Fontes: [diário](../docs/decisoes.md), [arquitetura e reprodução](../README.md), [prompts](../docs/prompts.md).

## 2. Sequência: problema → mudança → observação → teste seguinte

### 00. Tentativa anterior na pasta DesafioVicio: Gemma indisponível

**Complemento recuperado em 19/10/2026.** Antes dos experimentos desta pasta, houve o piloto v0 de 15/10/2026 em `DesafioVicio`. O classificador planejado era `google/gemma-4-31b-it:free`, com Nemotron 3 Super como juiz. O Gemma recebeu cinco tentativas de classificação e uma repetição posterior de Q0001; todas retornaram HTTP 429, atribuído nos registros à limitação do pool compartilhado Google AI Studio. Nenhuma classificação do Gemma foi recebida e a dupla não chegou a completar o fluxo.

Uma sondagem separada do Nemotron como classificador retornou JSON válido em 42,807 segundos. Isso verificou sua disponibilidade, sem validar o juiz ou a precisão. O executor anterior foi ajustado para interromper e preservar pendências diante de bloqueios de conta/serviço, em vez de continuar enviando todas as questões após o primeiro 429.

Portanto, o histórico ampliado inclui **quatro modelos com chamadas tentadas via OpenRouter**: Gemma 4 31B, Nemotron 3 Super, Dots 3 Note Preview e Nemotron 3.5 Super VL. Somente os três últimos produziram respostas de classificação/julgamento nos registros examinados. O inventário de 27 condições deste pacote permanece restrito à pasta `Desafio`, no corte original; não inclui os pilotos da pasta anterior.

Fontes: [resultado do piloto v0](../../DesafioVicio/docs/piloto-v0-resultados.md) e [manifesto da primeira execução](../../DesafioVicio/output/runs/2026-10-15T19-47-06-481Z-af82a8bb/manifesto.json).

### 01. HTML bruto e dados herdados

**Desafio.** Os textos carregam HTML, estilos, XML e comentários do Word; os assuntos de origem podem estar errados. Uma questão pode mencionar um crime e cobrar um recurso, de modo que palavras isoladas e rótulos herdados induzem erro.

**Decisão.** Preparar uma vez, preservando os anexos e conferindo hashes nas execuções seguintes; limpar também alternativas e separar comando, cenário e conhecimento cobrado. Os rótulos de origem não entram inicialmente nos agentes.

**Evidência.** Os diagnósticos salvos somam 519.795 caracteres antes e 366.621 depois: redução de 29,47%. Q0099 passa de 118.666 para 1.639. Isso mede redução de ruído textual, sem provar preservação semântica perfeita nem ganho de classificação. Não há avisos materiais registrados nas 359 questões preparadas; ausência de aviso não comprova ausência de defeito.

**Continuação.** Reutilizar a preparação para comparar modelos e prompts sem acrescentar a limpeza como variável. Fonte: [preparação](../output/prepared.json), [produção](../docs/preparacao-e-producao.md).

### 02. Primeiro lote de 30: timeout

`piloto-v1`, Nemotron classificador e Dots juiz: a primeira requisição atingiu cinco minutos; nenhuma proposta utilizável, nenhum juiz chamado, 30 pendentes. A resposta foi ampliar o timeout para quinze minutos e preparar justificativas concisas/prompts v2. Essa preparação não constitui resultado de qualidade da v2. Fonte: [diário](../docs/decisoes.md).

### 03. Prompts v3: explicitar a tarefa

As instruções passaram a separar o conhecimento determinante do cenário, a falsidade de uma alternativa do seu valor como evidência de assunto, e dúvida jurídica de dúvida temática. Também detalharam especificidade, concorrentes e os estados de `fora`. O formato e as regras determinísticas foram preservados. Era uma hipótese de melhoria a testar, não uma melhoria demonstrada pela revisão do texto. Fonte: [revisão dos prompts](../docs/prompts.md).

### 04. Lote de 20 com raciocínio: saída truncada

Em `piloto-20-v3`, a resposta consumiu 18.000 tokens de saída, 17.669 deles de raciocínio. Restaram 331 visíveis; o JSON ficou incompleto e nenhuma proposta foi aceita. Esforço `low` não foi suficiente para evitar o problema. A mudança seguinte pediu raciocínio desativado, mantendo lote de vinte e prompts v3. Fonte: [diário](../docs/decisoes.md).

### 05. Lote de 20 sem raciocínio: integração concluída, filtro permissivo

`piloto-20-v3-sem-raciocinio` concluiu vinte propostas, pareceres e decisões após recuperar quatro citações inválidas. Publicou vinte, com concordância por ramo de 13/20, ou 65%. O juiz aprovou também as sete divergências. Foram quatro chamadas no total e 214,455 segundos de durações somadas; custo informado zero. Ganho técnico: saídas válidas. Perda revelada: aprovação do juiz não sustentava a meta. A próxima hipótese foi reduzir lotes e aumentar raciocínio.

### 06. Dois lotes de dez com raciocínio: mais esforço, sem ganho agregado

`piloto-2x10-v3-raciocinio` concluiu vinte propostas e pareceres, com dezenove publicações e uma pendência de decisão em Q0020. Concordância do classificador: 13/20, igual ao teste anterior. As publicadas tiveram 13/19, ou 68,4%; o anterior também tinha 13/19 nesses mesmos IDs. O aumento aparente vem do denominador. Foram seis chamadas e 1.149,691 segundos somados, 5,36 vezes o teste anterior. Lote, raciocínio e teto de saída mudaram juntos; não há efeito isolado de raciocínio. Fonte: [comparação](../output/comparisons/piloto-20-v3-sem-raciocinio-piloto-2x10-v3-raciocinio-exploratorio.json).

### 07. Troca do juiz e inversão dos papéis em cinquenta questões

O Dots foi substituído por Nemotron 3.5 Super VL. Compararam-se dois arranjos nos mesmos cinquenta IDs, com prompts v3 e lotes de dez.

| Arranjo | Classificador por ramo | Publicadas concordantes | Cobertura | Chamadas totais |
| --- | ---: | ---: | ---: | ---: |
| N3 classifica / N3.5 julga | 35/50 | 30/39 = 76,9% | 78% | 14 |
| N3.5 classifica / N3 julga | 39/50 | 35/45 = 77,8% | 90% | 10 |

O invertido ganhou quatro propostas concordantes, seis publicações e estabilidade técnica. Entre as mesmas 37 publicações, foram 29/37 versus 30/37, diferença menor que a sugerida pelas médias não pareadas. Nenhum arranjo alcançou 95%. A inversão muda a combinação completa, sem isolar cada modelo. Fonte: [comparação dos papéis](../output/comparisons/piloto-5x10-v3-papeis.md).

### 08. Retorno aos prompts v2: concisão não garantiu validade

Os primeiros pilotos planejados encontraram cota insuficiente e recusas de autorização, sem inferências nessa etapa. Após ampliação da cota, os dois testes v2 de cinquenta ocorreram. N3/N3.5 concluiu 48 decisões: 38 publicadas, dez revisões e duas pendências; concordância 29/38 = 76,3%. N3.5/N3 concluiu 39: onze publicadas, 27 revisões, um `fora` e onze pendentes; concordância 9/11 = 81,8%.

A validade na primeira resposta caiu de 46/50 e 50/50 na v3 para 38/50 e 33/50 na v2. O segundo arranjo parece melhor na proporção publicada, mas publica muito menos e deixa onze sem decisão. Houve timeouts, evidências rejeitadas e truncamento; a recuperação final desses onze não recebeu autorização. Os dois prompts mudaram juntos. Continuação: voltar à v3 e testar envio individual. Fontes: [comparação](../output/comparisons/piloto-v2-v3.md), [erros e itens](../output/comparisons/piloto-v2-erros-e-itens.md).

### 09. Envio individual: tentativa de reduzir problemas do lote

`individual-v3-invertido-50` mantém N3.5/N3 e v3, mas envia uma questão e usa teto completo de 32.000 tokens por etapa. Implementa cinco envios totais persistentes por questão/etapa; preserva resultados válidos e retoma somente etapas ausentes. Consultas, erros e saída final passam a compartilhar o teto nas condições com ferramentas.

Resultado: 113 chamadas; cinquenta propostas, 49 pareceres/decisões; 38 publicações, oito revisões, três `fora`, Q0039 pendente. Concordância de propostas cai de 78% para 70%; publicada de 77,8% para 73,7%; cobertura de 90% para 76%. Nas mesmas 36 publicações, lotes acertaram 31 e individual 26. O individual mudou também contexto por chamada, saída e política de recuperação. Não demonstrou superioridade. Fonte: [relatório](../output/comparisons/individual-v3-vs-lotes.md).

### 10. Retrospectiva sem juiz: economia possível, risco adicional

Sem novas inferências, três políticas foram aplicadas às propostas históricas: original; sem juiz conservando vetos locais; aceitação de todas as propostas íntegras. Nos quatro pilotos de cinquenta, retirar somente o juiz liberaria 7, 2, 4 e 7 publicações, incluindo 2, 1, 1 e 3 divergentes por ramo. A análise soma 290 pares experimento–questão sobre cinquenta IDs, não 290 questões independentes.

A economia histórica potencial seria de 31 tentativas e 58,01 minutos somados de chamadas. Não é tempo de parede garantido. O resultado motivou a hipótese de juiz seletivo em produção, ainda não validada; não justifica remover o juiz indiscriminadamente. Fonte: [retrospectiva](../output/comparisons/sem-juiz-retrospectiva-20261016T235150Z/resultados/relatorio.md).

### 11. Controle de taxa: prevenção com diagnóstico

A investigação das 113 tentativas do individual encontrou máximo de três envios em sessenta segundos e nenhum HTTP 429: não havia evidência de que o limite de vinte RPM tivesse causado aquelas falhas. Ainda assim, foi criado controle compartilhado de janela móvel, margem de dezoito RPM e pausas por resposta do serviço. É ganho de robustez operacional; não há ganho temático medido. Fonte: [controle](../docs/controle-de-taxa.md).

### 12. MCP LexML: caminho implementado, comparação bloqueada

O servidor originalmente indicado retornou 404. Foi integrado um servidor alternativo, com duas ferramentas restritas. O protocolo funcionou com ferramenta local; a busca real encontrou página de verificação do portal. O piloto de qualidade pareado não ocorreu. O provedor também recusou `tool_choice=none`; a continuação compatível usou `auto`, com bloqueio local de ferramentas na fase final. Esse beco sem saída mostrou que integração pronta não equivale a fonte acessível. Fonte: [integração](../docs/integracao-lexml-mcp.md).

### 13. API LexML direta: separar busca e inferência

A aplicação passou a consultar tema proposto e assunto de origem entre classificador e juiz. São hipóteses de busca, não rótulos confiáveis; só o juiz recebe esse rótulo legado. Os retornos esperados são metadados, sem garantir texto integral ou vigência. HTML HTTP 200 é falha de consulta, não resultado vazio.

O teste `contexto-api-v5-q0001` concluiu uma revisão, com tema 5524 e veto técnico por contexto indisponível/incompleto. Não há amostra que demonstre ganho de qualidade. A pesquisa ao vivo continuou sujeita à proteção do portal. Continuação: congelar fontes locais. Fonte: [modo direto](../docs/contexto-api-lexml.md) e [registro](../output/experiments/contexto-api-v5-q0001/records.json).

### 14. RAG local: contornar dependência de disponibilidade

Foram coletados textos de fontes documentais e indexados em SQLite FTS5/BM25. O juiz recebeu até seis trechos/16 mil caracteres. `local-penal50-v7` reaproveitou as propostas do individual e produziu cinquenta pareceres, 49 decisões, 28 publicações e vinte revisões; concordância publicada 24/28 = 85,7%, ante 28/38 = 73,7%; cobertura 56% ante 76%.

O ganho de 12 pontos na proporção veio com menos quatro publicações concordantes e menos seis divergentes. Prompt, documentos, rótulo original e veto por lacunas mudaram juntos. Uma simulação determinística atribuiu apenas ao veto +2,4 pontos de concordância e −4 pontos de cobertura; não identifica o efeito puro dos documentos. Fontes: [base local](../docs/base-local-rag.md), [conferência e impacto](../output/experiments/local-penal50-v7/analise-juridica-e-impacto.md).

### 15. Documentos podem induzir erro: segmentação e plano

A revisão encontrou cabeçalhos do artigo seguinte anexados ao anterior: CP 332 recebeu título do 333; CPP 573 recebeu título de recursos. Em Q0025, o juiz reproduziu associação errada ao passar a publicar. Isso sugere mecanismo plausível de erro, sem provar causalidade. Q0007 tinha plano de `mutatio libelli`, embora cobrasse tipos de ação penal.

A base `penal50-v3`, com 492 trechos, corrigiu esses pontos sem sobrescrever v2. Limitações residuais foram depois encontradas em CP 147/147-A e na hierarquia do CP 197. Hash prova integridade do arquivo, não qualidade de extração.

### 16. Referência própria v2: corrigir a avaliação com transparência

Após conferência legislativa/editorial dos cinquenta primeiros, a v2 foi congelada antes das rodadas seguintes. Mudou cinco temas e a alternativa de Q0028. Os demais 309 herdaram a v1, sem nova conferência integral. Não é gabarito oficial nem revisão humana independente; não entra nos prompts ou no corpus. Mudar a referência pode alterar métricas sem nenhuma melhora do modelo. Fonte: [referência v2](../referencias/analise-propria-v2/README.md).

### 17. Juiz escolhe consultas: controle v8

As propostas foram reaproveitadas e mantiveram-se modelos, prompts, banco e regras entre os dois braços. Os primeiros ensaios foram interrompidos por campo `index` em `tool_calls`; a mensagem interna foi normalizada e os definitivos usam `-r2`.

Automático: 27 publicações, 23 concordantes, 54 chamadas do juiz; ferramentas: 36 publicações, 29 concordantes, 142 chamadas. Ganho: nove publicações líquidas, seis concordantes e três divergentes; cobertura +18 pontos. Perda: concordância de 85,2% para 80,6%, chamadas 2,63 vezes maiores. São 46 decisões comuns; Q0039 fica sem parecer em ambos. Fonte: [relatório v8](../output/comparisons/rag-consultas-v8/relatorio.md).

### 18. Classificador escolhe consultas: controle contemporâneo v9

Duas condições geraram propostas novas, com o mesmo juiz automático. Controle sem RAG no classificador: cinquenta decisões, 27 publicações, 23/27 concordantes, 101 envios. Com consultas: 49 decisões, 31 publicações, 26/31 concordantes, 175 envios.

Ganho: +8 pontos de cobertura e três publicações concordantes líquidas. Perda: concordância −1,3 ponto e +73,3% envios. O classificador passou de 37/50 para 38/50 por ramo; cinco propostas melhoraram e quatro pioraram. Em Q0012, o classificador encontrou a exceção da Lei 9.099, mas ela não chegou no pacote independente do juiz, que preferiu a regra geral. Em Q0025, justificativa de tráfico de influência acompanhou ID de corrupção ativa, e o juiz aprovou. Em Q0037, o prompt permitia quatro operações totais sem explicitar o teto de duas por resposta. Fonte: [análise v9](../output/comparisons/rag-classificador-v9/analise.md).

### 19. APIs diretas com modelos mais caros: bloqueio, sem resultado comparável

A v10 preparou Gemini 3.1 Pro e GPT-5.2, orçamento persistente e clientes diretos. O primeiro braço parou por HTTP 429 com cota zero. O juiz isolado fez duas chamadas sem parecer válido e parou por reserva insuficiente. Zero decisões finais nessas condições: não é possível atribuir ganho a modelos mais caros. Os US$ 4,23 por dez itens e US$ 19,85 por cinquenta eram simulações com tokens históricos, não gastos. Fontes: [modelos pagos](../docs/modelos-pagos.md), [comparação](../output/comparisons/modelos-pagos-v10/pagos-v10-gemini-openai-limite-10.md), inventário congelado.

### 20. Gemini Flash v11: sinal positivo em dez itens

Mantidos prompts v9/v8, base e política; trocados modelos/transporte para Gemini 3.1 Flash-Lite e 3.8 Flash. Dez decisões, sete publicações e três revisões. Contra a referência v2, 7/7 por ramo versus 6/7 no Nemotron v9, com mesma cobertura de 70%. Exato: 5/7 nas duas condições. Wilson 95% de 7/7: aproximadamente 64,6%–100%. Foram 36 envios e US$ 0,28828 equivalentes às tarifas salvas, sem comprovar cobrança.

Q0008 tinha confiança declarada 1,0 e foi rejeitada pelo juiz. A confiança subjetiva não é suficiente. O piloto motivou ampliar a base, sem comprovar 95% em novas questões. Fonte: [análise](../output/comparisons/gemini-flash-v11/analise.md).

### 21. Auditoria de foco: voltar às exigências de entrega

A releitura do enunciado identificou esforço excessivo em integrações e pesquisa, enquanto a classificação ficava nos cinquenta primeiros. Também corrigiu a leitura de 71,4% exatos como falha contra a meta: a régua principal aceita pai/filho. A auditoria é histórica; sua afirmação de que não havia mais de cinquenta decisões deixou de descrever o estado posterior. Fonte: [auditoria](../docs/auditoria-alinhamento-desafio.md).

### 22. Base para 359 e retirada do veto automático de lacuna

A v12 criou escopo integral, base `desafio359-v5` com 5.380 trechos e 39 lacunas declaradas. A ausência de documento deixou de vetar publicação automaticamente; o juiz deve avaliar se impede distinguir o tema. O restante dos vetos continua. A configuração foi preparada e validada localmente, sem resultado de inferência isolado que meça a retirada do veto. Assim, comparações posteriores também envolvem mudança de política. Fonte: [base ampliada](../docs/base359.md).

### 23. Livros de Criminologia: material novo e limitações preservadas

Dois livros acrescentaram 1.155 passagens ao total de 6.535, mantendo os 5.380 anteriores. A revisão das 38 lacunas doutrinárias encontrou dezoito com apoio localizado, treze parcial e sete insuficiente. Restam 21 lacunas incluindo Q0142. Candidatos de fontes planejadas caíram de 350 para 348 IDs: a adição mudou o ranking. Isso não mede precisão.

Novos prompts distinguem lei, precedente e doutrina, preservam autoria e localização e filtram doutrina antes do limite do ranking. Algumas figuras não foram extraídas; fragmentação, hifenização e edições antigas limitam consultas. Não se provou suficiência documental integral. Fonte: [importação](../docs/livros-criminologia.md).

### 24. Integral v13 com livros: mais publicações, menor concordância no recorte

O teste tentou onze questões, concluiu dez decisões, nove publicações e uma revisão; Q0011 aguardou juiz. Nos mesmos dez do piloto v11, passou de 7/7 para 8/9 concordantes por ramo; cobertura entre concluídas de 70% para 90%. Cobertura do case: 9/359 = 2,51%. A divergência é Q0009, disposições gerais patrimoniais versus furto; a referência foi preservada.

Houve ruído doutrinário em contextos sem pertinência. Nenhum dos dez pareceres citou doutrina. A execução parou por cota diária real de vinte chamadas do juiz, apesar de orçamento financeiro disponível. Foram quarenta chamadas e custo conhecido estimado US$ 0,3294; custo mais reservas US$ 0,7771. Base, prompts e veto mudaram, então não se atribui a variação aos livros. Fonte: [parcial v13](../output/comparisons/gemini-flash-v13-livros-359/analise.md).

### 25. Limites v14 e modelo v15: teto local não altera cota externa

A v14 acrescentou RPM, TPM e RPD persistentes por modelo/projeto e distinguiu dia do fornecedor de uma janela local. Era alteração operacional, sem novo resultado temático próprio. A v15 mudou o classificador para Gemini 3.5 Flash-Lite e ajustou espaçamento. Concluiu Q0001, obteve proposta de Q0002 e parou no juiz por RPD vinte; sete chamadas. Não houve violação observada de RPM nessa tentativa. Uma publicação concordante não permite avaliar a qualidade da versão. Fontes: [v14](../docs/limites-gemini-v14.md), [v15](../output/comparisons/gemini35-v15-livros-359/analise.md).

### 26. Serialização e projetos v16: progresso e bloqueios financeiros

A v16 acrescentou trava de inferência por fornecedor/projeto e tratamento persistente de 429, distinguindo erro transitório de cota diária. Os sete envios anteriores da v15 já tinham concorrência máxima um, portanto não se comprovou que paralelismo causara o bloqueio. A troca confirmada de projeto alterou o escopo dos contadores; transições e checkpoint foram preservados.

A primeira execução concluiu sete e parou por HTTP 402, saldo pré-pago esgotado. Retomadas posteriores avançaram. No retrato deste pacote: 180 decisões, 152 publicações, 26 revisões, dois `fora`, 179 pendentes; 130/152 = 85,5% por ramo, cobertura 152/359 = 42,3%. O último resumo registra nova parada financeira. Essa métrica integral foi reconstruída das decisões salvas; substitui qualquer narrativa baseada apenas no primeiro bloqueio de sete itens. Fontes: [histórico v16](../docs/gemini-v16-serializacao.md), [retrato](evidencias/retrato.json).

### 27. Lotes pagos v17: acelerar para o prazo

Foi criado executor separado, preservando o código do individual. A sequência autorizada foi b30 → b20 → b10, com teto total US$ 30 e b1 excluído; uma condição experimental por vez. Esses novos testes abandonam as pausas preventivas, mantêm reação a bloqueios e acrescentam roteamento de ferramenta por questão e teto de saída escalado. Não é comparação pura de lote.

O primeiro b30 recebeu HTTP 400 no esquema. Um diagnóstico sintético distinguiu o contrato com/sem `maxItems` externo; a correção removeu apenas esse limite no envio, mantendo validação local. Histórico, contadores e gasto foram preservados. Fonte: [v17](../docs/paid-v17-paralelo.md).

### 28. Resultado b30: processamento mais rápido, muitas pendências

Passagem por 359 IDs: 161 decisões, 131 publicações, trinta revisões e 198 pendentes; 112/131 = 85,5% por ramo; cobertura 36,5%. Todos os 198 tiveram ao menos uma proposta sem consulta válida para seu ID; em 71 também faltou resultado, em 43 houve falha de evidência/esquema, categorias sobrepostas.

Na janela de 29min35s comparada à v16 simultânea, b30 entregou 161 decisões contra 55: 2,93 vezes. Custo conhecido por decisão US$ 0,0136 versus US$ 0,0225, redução de 39,5%; com reserva desconhecida, b30 US$ 0,0153 e redução de 32,1%. Nas mesmas 66 publicações, v16 teve 60/66 e b30 54/66: perda de 9,09 pontos. Os totais globais de ambos perto de 85,5% escondem seleção diferente. Fonte: [análise pareada](../output/comparisons/v16-v17-b30/analysis.md).

### 29. B20 v17 e bloqueio da sequência

No retrato: 46 propostas, 27 pareceres/decisões; 22 publicadas, cinco revisões e 332 pendentes; concordância publicada 20/22 = 90,9%. O resumo registra HTTP 402. Não é resultado final comparável ao b30 completo, nem evidência de maior qualidade do lote vinte. Não há `records.json` de b10 nessa suíte no corte. Fonte: [registros](../output/paid-v17/paid-v17-359/b20/records.json), retrato congelado.

### 30. Vertex v18: mudar canal de acesso e continuar experimento

Foi preparado canal Google Cloud com autenticação própria, projeto/endpoint explícitos, preços e manifestos separados, reaproveitando o motor em lotes. Não importou checkpoints v16/v17 nem zerou suas tentativas. O orçamento autorizado continuou compartilhado; não significa novo saldo de US$ 30. Acesso a metadados não comprova abatimento de crédito; consultas administrativas encontraram APIs/permissões indisponíveis.

O piloto Vertex b10 concluiu dez decisões em cerca de 104 s: sete publicações, três revisões, 6/7 = 85,7% por ramo. A execução Vertex b20 integral tinha **122 decisões, 96 publicações, 26 revisões, 237 pendentes, 83/96 = 86,5% por ramo** às 21h40. Estava em evolução, sem relatório final. Mudança de canal não demonstra ganho de qualidade; a execução exige fechamento posterior. Fontes: [canal v18](../docs/vertex-v18.md), [piloto](../output/vertex-v18/vertex-v18-piloto-10/b10/report.json), [registros congelados](evidencias/registros-congelados.json).

## 3. Quais mudanças tiveram mais impacto observável

| Mudança | Ganho observado | Perda / ressalva | Força da conclusão |
| --- | --- | --- | --- |
| Desativar raciocínio no lote inicial | De zero para vinte decisões válidas | Só 65% por ramo, juiz deixou passar sete divergências | Forte para integração naquele ensaio; não prova política ideal |
| Inverter N3/N3.5 na v3 | +8 pontos nas propostas, +12 de cobertura, 14→10 chamadas | Só +0,9 ponto na concordância agregada publicada | Comparação da combinação completa nos mesmos cinquenta |
| Envio individual | Recuperação por etapa e rastreabilidade | −14 pontos de cobertura, −4,1 na concordância publicada | Não isolou lote; não superou histórico |
| RAG v7 + prompt + política | +12 pontos na concordância publicada | −20 de cobertura; menos quatro publicações concordantes | Ganho do pacote; efeito puro do RAG não identificado |
| Juiz com ferramentas v8 | +18 pontos de cobertura | −4,6 de concordância e 2,63 vezes chamadas | Controle mais próximo, com propostas preservadas |
| Classificador com ferramentas v9 | +8 pontos de cobertura | −1,3 de concordância e +73,3% envios | Controle contemporâneo; efeito da estratégia completa |
| Gemini Flash v11 | 6/7→7/7 por ramo, cobertura mantida | Só sete publicações e itens já expostos | Sinal exploratório pequeno |
| Base integral + livros + política | Permitiu sair do escopo de cinquenta; +18 lacunas doutrinárias com apoio | Ruído/ranking; 21 lacunas; impacto temático não isolado | Forte para alcance documental, fraco para precisão |
| Lote b30 v17 | 2,93 vezes decisões/janela, custo unitário conhecido −39,5% | 198 pendentes; −9,09 pontos nas 66 publicações comuns | Descritivo: pausas, teto, contrato e execução simultânea diferem |
| Canais/projetos/cotas | Retomadas com estado preservado | Bloqueios diários e financeiros persistiram | Robustez, sem causalidade temática |

## 4. Diagnóstico para o professor e para produção

Há três problemas distintos: conteúdo cobrado, fronteira editorial entre temas e capacidade técnica de produzir um registro. Exemplos: Q0003 menciona furto mas cobra recurso; Q0001/Q0023/Q0028 reúnem fases do júri; Q0009 cruza furto e escusas; Q0025 pode ter argumento correto com ID errado; Q0012 exige exceção que a busca automática omitiu. Fonte disponível, fonte citada e fonte bem interpretada são verificações diferentes.

Na árvore existem 375 temas ativos e dois inativos; quatro raízes, 111 nós de nível um e 262 de nível dois. Os títulos/descrições não oferecem, em todos os casos, critérios editoriais suficientes para escolher entre um tema geral e o específico. A referência própria também contém escolhas editoriais discutíveis. O memo deve pedir regras de inclusão/exclusão e desempate, sem alterar os IDs oficiais na entrega.

O uso semanal em cinquenta mil questões permanece proposta: importação incremental, detecção de duplicatas/imagens, taxonomia versionada, busca de candidatos, classificador e juiz seletivo quando validado, revisão humana e monitoramento. Embeddings e classificador treinado não foram testados. Não há ensaio de carga, custo total de produção ou precisão independente validada.

## 5. O que falta para fechar

1. Atualizar o corte após as execuções e registrar a condição escolhida sem selecionar apenas resultados favoráveis.
2. Ter 359 decisões válidas na condição final. Tratar pendências explicitamente, sem confundir erro técnico com `fora` ou copiar referência para entrega.
3. Auditar uma amostra com especialista, incluindo publicadas, revisões e `fora`, com sorteio e critérios definidos antes da avaliação.
4. Separar concordância publicada por ramo, granularidade exata, cobertura sobre 359, taxa de conclusão técnica e tempo de revisão humana.
5. Gerar e conferir CSV; registrar previsão de precisão e intervalo com limitações; cobertura do CSV é uma fração observada exata.
6. Conciliar custo informado, estimativa tarifária e reservas desconhecidas; não somar ledgers compartilhados como se fossem gastos independentes.
7. Ajustar o README para um caminho único de reprodução e verificar artefatos necessários fora do diretório ignorado `output/`.
8. Rever a síntese e o memo; com mais tempo, reservar avaliação prospectiva, comparar o juiz seletivo e ajustar recuperação/segmentação antes de novas rodadas amplas.

Este levantamento cobre as mudanças e condições documentadas nos arquivos disponíveis, incluindo ensaios interrompidos e preparações sem inferência. Não há trilha Git local para assegurar a enumeração de cada edição de código. O [inventário](inventario-experimentos.md) e os hashes permitem conferir o material efetivamente usado.
