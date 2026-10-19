# Base local e RAG simples

> **Atualização — 18/10/2026:** classificador com consultas escolhidas e juiz automático implementados e testados nas mesmas 50 questões, com controle novo. Controle: 27 publicações, 85,2% de concordância por ramo e 54% de cobertura; classificador com RAG: 31 publicações, 83,9% e 62%. A meta de 95% não foi atingida; Q0039 ficou sem parecer após cinco tentativas do juiz. [Análise e erros](../output/comparisons/rag-classificador-v9/analise.md), [citações](../output/comparisons/rag-classificador-v9/conferencia-juridica.md), [menções normativas](../output/comparisons/rag-classificador-v9/mencoes-normativas.md). As seções iniciais preservam o histórico da v2; o corpus usado nesta rodada é penal50-v3.

Foi implementada uma base **SQLite real**, com tabelas relacionais para fontes, questões do recorte, trechos e metadados. A busca usa **FTS5/BM25**. A versão documentada nesta seção histórica é `penal50-v2`, para Q0001–Q0050 do experimento `individual-v3-invertido-50`.

Na prática, o banco funciona como uma biblioteca local: a aplicação procura trechos pertinentes e acrescenta até seis fontes ao prompt do juiz. Não há embeddings, banco vetorial, novo agente ou chamadas de modelo para a recuperação.

## Por que SQLite

- O banco é um arquivo local, sem servidor, conta externa ou serviço adicional.
- FTS5 oferece busca textual e ordenação BM25 por relevância ([documentação oficial](https://www.sqlite.org/fts5.html)). O ranking não é probabilidade de acerto.
- Transações e restrições mantêm as relações entre fontes e documentos; os textos continuam exportáveis em JSONL.
- Uma cópia congelada do arquivo, acompanhada de manifesto e hashes, permite repetir experimentos com o mesmo conteúdo.
- O Node instalado já oferece `node:sqlite`; foi verificada a disponibilidade de FTS5. O projeto passa a exigir Node >=22.13, sem nova dependência de banco.

O critério para considerar um servidor como PostgreSQL seria a necessidade de múltiplos processos/servidores gravando simultaneamente, coordenação centralizada e operação multiusuário. O número de questões semanais, sozinho, não determina essa migração. Para este corpus e o fluxo sequencial, SQLite é a escolha inicial. A [orientação oficial de uso do SQLite](https://www.sqlite.org/whentouse.html) discute essa distinção.

## Conteúdo efetivamente incorporado

O arquivo é [corpus.sqlite](../output/knowledge/snapshots/penal50-v2/corpus.sqlite). Há **491 trechos**, sendo **361 normativos e 130 capturas de precedentes**, com proveniência preservada. Capturas do mesmo precedente em pesquisas diferentes permanecem identificáveis no armazenamento; a busca remove duplicatas de localizador/texto ao formar os candidatos.

As 13 normas selecionadas são Código Penal, CPP, Constituição, LEP, Lei de Drogas, Maria da Penha, crimes ambientais, lavagem de dinheiro, Juizados Especiais, ECA, abuso de autoridade, antiterrorismo e crimes contra a ordem econômica. Para os códigos, o índice contém os artigos selecionados para o recorte; as capturas brutas completas ficam preservadas. Também foram feitas 27 consultas de precedentes ao BNP/CNJ, com até cinco resultados por consulta.

O plano documental está em [knowledge/plans/penal50-v2.json](../knowledge/plans/penal50-v2.json). Sua curadoria usa questão e rótulo original, sem ler a classificação de referência própria. Ele não contém respostas esperadas e não transforma a presença de um documento em aprovação do tema.

As primeiras consultas ao Normas.leg.br entregaram JSON para as 13 normas, mas somente Constituição e lei de abuso trouxeram árvore de dispositivos. Os outros textos foram obtidos na Câmara dos Deputados. O Planalto encerrou as conexões; as falhas ficaram registradas. A lei antiterrorismo usa a publicação original identificada como tal, pois a URL de compilação retornou 404.

## Versionamento

Cada versão é uma pasta com:

```text
output/knowledge/snapshots/penal50-v2/
  corpus.sqlite       banco consultado somente para leitura
  manifest.json       versão, hashes, origem, recorte e contagens
  plan.json           seleção documental congelada
  chunks.jsonl        exportação dos trechos indexados
  raw/                corpos das respostas oficiais
```

O manifesto registra hashes do banco, dos trechos, do plano, dos arquivos brutos e do importador. O carregador confere esses hashes; alterações são rejeitadas. `knowledge:build` recusa sobrescrever uma versão existente. Um experimento com RAG também registra a identidade do manifesto e do banco no seu fingerprint.

`penal50-v1` foi preservada. Na conferência, a fonte da Câmara trazia literalmente **“Art. l97”**, com letra `l`, no Código Penal. A v2 normaliza esse rótulo para o localizador `art197`, mantém o texto original e marca a normalização no metadado. A v2 reutilizou as mesmas capturas, sem consultas adicionais.

**Versão do corpus não equivale a vigência jurídica automaticamente validada.** Nas árvores JSON, o importador seleciona textos pelas datas e intervalos fornecidos. Nos HTMLs compilados, preserva a captura e remove redações visualmente riscadas; não reconstrói automaticamente o texto vigente em uma data histórica. Essa limitação acompanha o contexto entregue ao juiz. A data de corte configurada é 16/10/2026; a coleta ocorreu em 17/10/2026.

## Fluxo implementado

```text
questão → classificador v3 → proposta validada
                                ↓
                     busca no SQLite congelado
                                ↓
                   juiz v6 com os trechos e fontes
                                ↓
                      validação → decisão
```

O classificador continua com os mesmos dados preparados. Somente o juiz recebe `contexto_externo`, incluindo assunto original como hipótese, versão da base, consultas, trechos, fontes e lacunas.

A busca combina quatro entradas: texto da questão/alternativas, título do tema proposto, assunto original e títulos dos concorrentes. Os termos são higienizados e enviados como parâmetros SQL; operadores introduzidos pelo texto não viram SQL. Os resultados são intercalados e deduplicados, com máximo de seis documentos e orçamento de 16 mil caracteres no contexto. Cada trecho entregue tem limite próprio e sinalização de truncamento.

O juiz cita IDs `S-xxxxxxxxxxxx` nas justificativas quando utiliza as fontes. O código rejeita IDs nesse formato que não tenham sido fornecidos. Essa verificação confirma a presença da fonte; a pertinência do trecho e a coerência jurídica continuam sendo julgamentos semânticos.

O contexto exato fica salvo em `records.json`, no campo `knowledge`. Retomadas conferem entrada, proposta, consultas, base e citações, e não repetem etapas válidas. A recuperação dessa configuração não faz chamadas HTTP.

`src/validation.ts::decide` permanece inalterada. A política adicional de `decideRecord` leva eventual publicação para revisão quando não há trechos ou há lacunas declaradas. O juiz ainda pode produzir parecer; nenhuma falha de busca cria `fora` automaticamente.

## Conferência das 50 questões

A busca retornou candidatos para **50 de 50**, com **quatro questões contendo lacunas declaradas**:

- **Q0002, Q0024 e Q0031:** falta fonte doutrinária de criminologia. Leis e precedentes não substituem o material teórico cobrado.
- **Q0007:** a consulta planejada ao BNP sobre `mutatio libelli` retornou zero registros. Os dispositivos do CPP foram incorporados; a lacuna indica ausência do complemento planejado, sem afirmar insuficiência jurídica definitiva.

O resultado completo está no [relatório de recuperação](../output/knowledge/checks/penal50-v2.md), com [JSON dos contextos](../output/knowledge/checks/penal50-v2.json) e [resumo](../output/knowledge/checks/summary.json).

Não foi realizada validação humana de suficiência por questão, nem novo experimento de qualidade com os modelos. Os resultados podem conter candidatos irrelevantes, especialmente em buscas genéricas. Recuperar algum texto não comprova cobertura, adequação temática ou precisão de 95%.

## Comandos

```bash
# Conferir hashes e recuperar contexto para as 50 propostas salvas; sem modelos/rede.
npm run knowledge:check

# Consultar a base diretamente; sem modelos/rede.
npm run knowledge:search -- --query "desaforamento Tribunal do Júri"

# Conferir o orçamento para um experimento futuro usando as propostas existentes.
npm run run -- --config config/individual-v6-local.json --experiment local-penal50-v2 --limit 50 --proposals-from individual-v3-invertido-50 --dry-run

# Execução real do juiz com RAG: 50 chamadas nominais, sujeitas às retentativas.
npm run run -- --config config/individual-v6-local.json --experiment local-penal50-v2 --limit 50 --proposals-from individual-v3-invertido-50 --max-calls 250
```

O último comando está documentado para a próxima execução; ele não foi executado nesta implementação. A configuração mantém classificador 3.5 Super VL e juiz 3 Super; o juiz usa `juiz.v6-local.md`. O padrão v3 e as configurações históricas seguem disponíveis.

Para nova coleta, criar outro plano/ID e usar `knowledge:fetch`, seguido de `node --import tsx src/knowledge/cli.ts fetch-html camara --plan <plano>`, se necessário, e `knowledge:build -- --plan <plano>`. Downloads são uma etapa separada; não acontecem nos testes do juiz. Há pausa local de três segundos entre requisições da coleta; essa pausa não representa uma cota oficial dos serviços.

## Validação técnica

TypeScript aprovado e **64 testes aprovados**. Os testes incluem SQLite real, busca FTS5/BM25, banco somente para leitura, integridade de snapshots, versões temporais em JSON, limpeza de HTML, proveniência, deduplicação, citações e fluxo até o parecer com cliente de modelo simulado.

O dry-run confirmou o carregamento da base e o recorte de 50 questões. Nenhuma chamada OpenRouter foi feita nesta implementação. A coleta fez 63 requisições HTTP, além de uma leitura de diagnóstico da conexão do Planalto; as falhas e os corpos oficiais utilizados estão preservados.

## Teste real do juiz — 17/10/2026

O experimento `local-penal50-v7` reutilizou as 50 propostas de `individual-v3-invertido-50` e executou apenas o juiz Nemotron 3 Super com esforço médio, prompt v7 e snapshot `penal50-v2`. Foram 52 chamadas e 50 pareceres válidos: 28 publicações, 20 revisões, um fora e uma pendência (Q0017: fora não confirmado sem alternativa). Dois erros técnicos foram recuperados na segunda tentativa: HTTP 502 em Q0027 e resposta interrompida em Q0029.

A concordância por ramo entre publicadas foi de 24/28 (85,7%), ante 28/38 (73,7%) no histórico; a concordância exata foi de 17/28 (60,7%). A cobertura dos 50 caiu de 76% para 56%. A comparação pareada usa 48 IDs, pois as pendências diferem. A meta de 95% não foi atingida. Não é um teste isolado de RAG: também mudaram prompt, exposição do rótulo original e veto por lacunas.

Todos os 50 contextos foram entregues, mas apenas sete pareceres citaram fontes. A inspeção encontrou trechos irrelevantes, rejeições indevidas de evidência textual por falta de fonte externa e uma inconsistência no plano da Q0007 (mutatio libelli em vez de tipos de ação penal), que gerou veto de publicação. A base congelada foi preservada; essas falhas não foram corrigidas no meio do experimento.

[Relatório completo, erros e pareceres por questão](../output/experiments/local-penal50-v7/relatorio-rag.md). O arquivo `records.json` ao lado contém propostas, contextos, pareceres, decisões e tentativas.

Para reproduzir a comparação e gerar o relatório sem novas chamadas de modelo:

```sh
node --import tsx src/index.ts compare --left individual-v3-invertido-50 --right local-penal50-v7 --limit 50
python3 scripts/relatorio-rag-local.py local-penal50-v7
```

## Conferência jurídica e decomposição do resultado

A análise posterior verificou os nove IDs citados e classificou seis usos como adequados, dois como parciais e um como inadequado. Foram examinados também quatorze pareceres com menções normativas sem ID específico para o dispositivo e dois casos complementares. A autenticidade dos IDs não equivale à correção jurídica do parecer.

Foi encontrado um defeito no segmentador HTML: cabeçalhos dos dispositivos seguintes foram anexados ao artigo anterior. Isso aparece no art. 573 do CPP com o título de recursos e no art. 332 do CP com o cabeçalho de corrupção ativa do art. 333. Na Q0025, o juiz reproduziu a associação errada e passou a publicar um item antes em revisão. É evidência de um mecanismo plausível de erro, sem provar causalidade do contexto. O snapshot atual foi preservado; corrigir exige uma nova versão.

A condição com RAG elevou a concordância em 12,0 p.p. e reduziu a cobertura em 20 p.p.; as publicações concordantes caíram de 28 para 24 e as divergentes de dez para quatro. Uma simulação determinística, sobre os mesmos pareceres, isolou o veto por lacunas: +2,4 p.p. de concordância e −4 p.p. de cobertura. O efeito isolado dos documentos não é identificável sem controle de prompt, rótulo original e política de decisão.

[Conferência completa com fontes primárias e análise de impacto](../output/experiments/local-penal50-v7/analise-juridica-e-impacto.md). Os arquivos `conferencia-juridica.json` e `impacto-rag.json` registram os detalhes e hashes. A análise não realizou novas chamadas de modelo nem alterou a referência.

## Referência v2 e consultas escolhidas pelo juiz (v8)

A referência de avaliação [analise-propria-v2](../referencias/analise-propria-v2/README.md) foi congelada antes dos novos testes. Tem 359 registros; a revisão legislativa/editorial nova cobre Q0001–Q0050, com 22 verificações documentais oficiais. Os demais 309 herdam a análise v1, com essa limitação registrada. Foram alterados cinco temas e a alternativa da Q0028 (CPP 409: cinco dias). O histórico v1 foi preservado. Os rótulos e respostas da v2 nunca entram no contexto dos modelos.

A base `penal50-v3` reaproveita as capturas oficiais íntegras, com 492 trechos. O segmentador remove os cabeçalhos que pertencem ao artigo seguinte e inclui a rubrica própria no título. O art. 332 do CP deixa de receber “Corrupção ativa” do art. 333; o art. 573 do CPP deixa de incorporar o título de recursos. Foi corrigido também o escopo da Q0007 (tipos de ação penal), retirando a dependência de uma consulta vazia sobre mutatio libelli e incluindo CP 140/145 e CPP 24/38. Essas mudanças vieram do conteúdo jurídico das questões; nenhum gabarito é documento recuperável.

`knowledge.mode` seleciona `automatic` (comportamento anterior) ou `judge_tools`. No segundo modo, `contexto_externo` começa sem documentos, contendo apenas proveniência, lacunas e rótulo original. O juiz escolhe argumentos das funções:

- `buscar_referencias`: consulta FTS5/BM25, até três candidatos por operação;
- `consultar_dispositivo`: diploma e artigo, por exemplo `cp` e `332`;
- `ler_referencia`: até 4000 caracteres de um ID já recuperado.

Em linguagem simples: antes o programa escolhia os textos; agora o juiz pede o que quer conferir e recebe a resposta do banco. O banco continua somente para leitura, sem SQL livre ou acesso à referência própria.

O ciclo está em [agent-judge.ts](../src/knowledge/agent-judge.ts); os contratos, execução e reprodução das consultas em [tools.ts](../src/knowledge/tools.ts). O máximo é de duas rodadas e quatro operações, com até seis documentos e 16000 caracteres acumulados de resultados. A primeira chamada pede uma busca; a rodada seguinte pode pedir outro dispositivo, leitura ou já concluir. Ao atingir limites, o transporte exige parecer final. Cada envio OpenRouter, inclusive seleção de ferramentas e erro, conta nas cinco tentativas totais por questão/etapa. Há reserva persistente antes de enviar; retomar não renova o limite.

`records.json` registra `knowledgeAgent.messages`, `rounds` e `operations` (argumentos, IDs e resultados), além de `knowledge` com a união dos documentos entregues. A retomada reproduz as operações no snapshot e confere os resultados salvos; não refaz chamadas válidas ao modelo. Uma consulta local pendente é determinística e não consome rede. IDs citados no parecer precisam ter sido entregues; isso verifica proveniência, sem garantir pertinência jurídica. A política conservadora de decisão permanece: alternativa sugerida pelo juiz, critérios não sustentados ou lacunas materiais impedem publicação automática.

Os testes v8 usam o mesmo prompt [juiz.v8-local.md](../src/agents/juiz.v8-local.md), modelos, propostas importadas, snapshot e regras, mudando apenas `knowledge.mode` e os limites próprios das ferramentas. O classificador 3.5 VL não é chamado novamente; seus resultados históricos são reaproveitados. A condição automática exige ao menos 50 envios do juiz, e a condição com ferramentas ao menos 100, podendo chegar a 250 por condição. Essa comparação mede a estratégia de recuperação; a comparação com v7 também envolve correções no corpus e no prompt e não isola o efeito desses fatores.

```sh
node --import tsx src/index.ts run --config config/individual-v8-auto.json --experiment local-penal50-v8-auto-r2 --limit 50 --proposals-from individual-v3-invertido-50
node --import tsx src/index.ts run --config config/individual-v8-judge-tools.json --experiment local-penal50-v8-tools-r2 --limit 50 --proposals-from individual-v3-invertido-50
node --import tsx src/index.ts compare --left local-penal50-v8-auto-r2 --right local-penal50-v8-tools-r2 --limit 50 --reference analise-propria-v2
```

`--reference analise-propria-v2` afeta apenas avaliação/comparação e gera outro arquivo, sem sobrescrever os relatórios v1. A opção não é argumento de construção do contexto. São **69 testes automatizados aprovados**, incluindo fluxo até parecer com ferramentas, retomada sem repetir consulta, esgotamento das cinco chamadas, rejeição de argumentos/SQL/IDs não entregues, adulteração de checkpoint, segmentação HTML e integridade da referência v2.

Os primeiros ensaios v8 foram interrompidos após o provedor acrescentar `index` em `tool_calls`, campo que o checkpoint estrito rejeitava. A mensagem interna agora seleciona somente id, type e function.name/arguments; detalhes de raciocínio são preservados. O caso real foi acrescentado ao teste do ciclo. Os ensaios originais foram preservados com `interrupcao.json`; as condições definitivas usam sufixo `-r2` e o mesmo código corrigido.

## Classificador com consultas e juiz automático — v9

`config/individual-v9-classifier-tools.json` configura `knowledge.classifierMode="tools"` e mantém `knowledge.mode="automatic"` para o juiz. As 50 propostas são novas: importar propostas de outro experimento é recusado nessa condição. `config/individual-v9-control.json` gera também propostas novas, sem contexto no classificador, com o mesmo juiz automático, para servir de controle contemporâneo.

Em termos simples, o classificador pede os textos que quer conferir antes de escolher o tema. O juiz continua recebendo os documentos selecionados pelas quatro consultas automáticas já existentes. A consulta automática usa a questão, o tema proposto, o rótulo original e os concorrentes; propostas diferentes podem, portanto, gerar resultados automáticos diferentes, embora o algoritmo seja o mesmo.

O classificador não recebe o rótulo original nem a referência própria. Seu contexto começa somente com identidade da base, lacunas e lista vazia de fontes. `classifierKnowledge` e `classifierKnowledgeAgent` guardam documentos, consultas, resultados e mensagens dessa etapa. `knowledge` permanece o contexto do juiz; o juiz automático não recebe as mensagens de ferramentas do classificador. A proposta final pode mencionar diploma/artigo, mas os IDs técnicos S- ficam no histórico do classificador, para não confundir a proveniência de fontes que o juiz recebeu por sua própria recuperação.

O núcleo em `src/knowledge/agent-judge.ts` agora atende aos dois papéis, com contadores e estados separados. Há até duas rodadas, quatro operações, seis documentos e 16000 caracteres por agente que usa ferramentas. O limite de cinco envios por etapa inclui consultas, falhas e saída final; retomar não renova esse limite. O juiz automático preserva as rubricas do prompt v8 e a política conservadora de decisão. O classificador usa `classificador.v9-local.md`, que mantém as regras v3 e acrescenta as instruções de consulta e de separação de evidência textual/documento jurídico.

O teste novo tem 150 envios mínimos (classificador: consulta e proposta; juiz: parecer) e teto de 500. O controle tem 100 mínimos e teto de 250. As execuções usam um limitador global, permanecem uma questão por etapa e preservam os experimentos anteriores. As quotas anunciadas são verificadas antes de começar; downloads de fontes não fazem parte do pipeline.

```sh
node --import tsx src/index.ts run --config config/individual-v9-classifier-tools.json --experiment local-penal50-v9-classifier-tools --limit 50
node --import tsx src/index.ts run --config config/individual-v9-control.json --experiment local-penal50-v9-control --limit 50
node --import tsx src/index.ts compare --left local-penal50-v9-control --right local-penal50-v9-classifier-tools --limit 50 --reference analise-propria-v2
```

TypeScript e 72 testes passaram antes de iniciar as execuções. Os testes novos conferem contexto e tentativa separados por agente, rótulo original ausente no classificador, juiz automático sem mensagens de ferramentas do classificador, retomada sem repetir consulta, esgotamento persistente de cinco tentativas e recusa de importar propostas nessa condição.

**Limite observado no teste v9:** além de duas rodadas e quatro operações no total, o cliente aceita no máximo duas operações por resposta. A Q0037 solicitou três de uma vez e foi recusada antes da execução; o envio seguinte finalizou a proposta. O prompt v9 não explicita esse teto por resposta. O caso está registrado no relatório; a correção do texto deve ser versionada para outro experimento.
