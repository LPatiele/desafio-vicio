# Classificação de tópicos jurídicos

**Arquivos da entrega:** [publicacao.csv](publicacao.csv) · [previsao.txt — pendente](previsao.txt) · [relatorio.md](relatorio/relatorio.md)

Pipeline em TypeScript para classificar as **359 questões** do desafio usando somente a taxonomia ativa dos anexos. O classificador propõe um destino; o juiz avalia a proposta; validação, decisão, avaliação e exportação são executadas por código. A meta do case é pelo menos **95% de precisão entre as publicadas**, aceitando tema exato ou ancestral/descendente. Um tema irmão conta como divergência.

**Entrega consolidada em 19/10/2026:** [publicacao.csv](publicacao.csv), originada de `pro-judge-v20-359-repair-1-final`, com **359 decisões: 284 publicar, 66 revisar, nove fora e nenhuma pendência**. A recuperação preservou as 354 decisões já concluídas na v20 e tratou somente cinco IDs. A variante `judge-confirms-outside-v1` resolveu Q0154 e Q0298 na finalização, com pareceres reais já recebidos e trilha de auditoria.

| Medida | Resultado da entrega |
| --- | ---: |
| Concordância por ramo entre publicadas | **243/284 = 85,6%** |
| Concordância exata entre publicadas | **213/284 = 75,0%** |
| Cobertura de publicação | **284/359 = 79,1%** |
| Decisões fora concordantes com a referência | **2/9 = 22,2%** |
| Custo conhecido estimado, incluindo retentativas e recuperação | **US$35,28**, cerca de **US$0,0983 por decisão concluída** |
| Processamento ativo / intervalo entre início e último encerramento de inferência | **178,4 min / 198,2 min** |

A **meta de 95% não foi atingida**. Esses percentuais medem concordância com a **referência própria provisória v2**, que também pode conter erros; não constituem validação jurídica independente. As duas exclusões produzidas pela variante divergem dessa referência. Concluir o CSV resolve a entrega técnica, mas não demonstra a qualidade desejada.

Leia o [relatório](relatorio/relatorio.md), o [resultado consolidado, custos e tempos](docs/resultado-entrega-v20.md), o [tratamento das cinco pendências e a variante](docs/recuperacao-v20.md) e as [decisões por experimento](relatorio/decisoes-por-experimento.md). O [material de apoio](relatorio/README.md) preserva também o PDF preliminar de 18/10. **A previsão continua pendente**: `previsao.txt` registra essa situação; uma previsão posterior à observação dos resultados precisa declarar essa exposição.

## Modelos e fluxo da condição entregue

| Papel | Modelo / identificador | Configuração |
| --- | --- | --- |
| Classificador | Gemini 3.5 Flash-Lite — `gemini-3.5-flash-lite` | Raciocínio `high` |
| Juiz | Gemini 3.1 Pro Preview — `gemini-3.1-pro-preview` | Raciocínio `medium` |
| Acesso | Vertex AI / Agent Platform, SDK `@google/genai` 2.30.0, ADC/OAuth | Endpoint `global`; uma inferência por vez |
| Entradas dos modelos | Questão limpa, taxonomia ativa e, para o juiz, proposta | Sem RAG, MCP, ferramentas ou referência de avaliação |
| Prompts-base | [Classificador v3](reproducao/prompts/classificador.v3.md) e [juiz v3](reproducao/prompts/juiz.v3.md) | Preservados dos snapshots; recuperação dirigida documentada |

As quatro reclassificações da recuperação receberam críticas anteriores dos próprios modelos como feedback; não receberam o rótulo esperado da referência. Por isso, o resultado final é uma **derivação com recuperação dirigida e ajuste retrospectivo de política**, distinguida da v20 original.

```text
Novas entradas ou alteração da limpeza:
anexos → preparar → output/prepared.json

Inferência:
carregar e conferir hashes → classificador → validar proposta
                          → juiz → validar parecer → decidir → salvar checkpoint

Depois da inferência:
avaliar com referência v2 → validar todas as decisões → gerar publicacao.csv
```

| Etapa | Implementação e responsabilidade |
| --- | --- |
| Preparação | [src/data.ts](src/data.ts): limpar HTML de enunciado, comando e alternativas; preservar anexos e diagnosticar problemas. Preparar uma vez; repetir quando entradas ou limpeza mudarem. |
| Classificador | [Motor sem RAG](experiments/no-rag-v19/engine.ts): tema central, extras, concorrentes, evidências, justificativa, incertezas e possibilidade de fora. |
| Validação | [Schemas](src/types.ts) e [validação](src/validation.ts): formato, IDs ativos, correspondência de questões, duplicatas, citações literais e coerência. |
| Juiz | Três rubricas: `tema_central`, `evidencia_textual` e `distincao_de_concorrentes`, cada uma com `sustentado`, `incerto` ou `inadequado` e justificativa. |
| Decisão | [Regra original](src/validation.ts) e [variante explícita de fora](delivery/confirmed-outside.ts). Decisões calculadas por código. |
| Avaliação e entrega | [Avaliação](src/evaluation.ts) e [exportador](delivery/finalize.ts): métricas, divergências, auditoria e CSV. |

## Participação humana

Não houve substituição manual de um tema ou de uma decisão individual no CSV final. Houve condução humana na arquitetura, modelos, prompts, critérios de publicação, orçamento, sequência de testes e autorização da variante de decisão. As decisões finais foram recalculadas por regras versionadas a partir das propostas e dos pareceres preservados.

As justificativas estão em [Decisões por experimento](relatorio/decisoes-por-experimento.md) e [Histórico de decisões](relatorio/historico-de-decisoes.md). A referência própria e sua conferência são instrumentos de avaliação posterior, separados de uma intervenção manual no CSV. O uso dos resultados para ajustar a solução torna estes testes exploratórios; não há alegação de avaliação cega ou revisão humana especializada de todas as classificações finais.

## Reproduzir o CSV offline — caminho principal

Requer **Node.js 22.13 ou superior**, npm e dependências da raiz. `node:sqlite`/FTS5 faz parte dos módulos históricos; a entrega sem RAG não exige importar os livros nem reconstruir o banco.

```sh
npm ci
npm run delivery:reproduce
```

O segundo comando **não chama modelos, não requer login Google nem chaves de API e não depende de um `output/` pré-existente**. Usa o [pacote público sanitizado](reproducao/README.md), verifica hashes, revalida as 359 propostas/pareceres/decisões pela política declarada e exige que o CSV reproduzido seja idêntico ao da entrega.

Saídas em `output/reproduction/v20-entrega/`:

- `publicacao.csv`: as mesmas 359 linhas da entrega.
- `avaliacao.json`: concordância com a referência v2, cobertura e recortes.
- `divergencias.csv`: relações entre proposta, decisão e referência por ID.
- `reproducao.json`: origem, hash do CSV e confirmação de zero chamadas de rede.

Para outro diretório, use `npm run delivery:reproduce -- --out output/minha-conferencia`. O comando não substitui o CSV da raiz. Se quiser restaurá-lo após conferir o arquivo gerado:

```sh
cp output/reproduction/v20-entrega/publicacao.csv publicacao.csv
```

O CSV segue o [contrato do anexo](anexos/LEIA-ME.md): `id,decisao,tema_central_id,extras_ids,confianca,motivo`, uma linha por ID, UTF-8, vírgulas e aspas escapadas. Tema é obrigatório em publicar/revisar e vazio em fora; extras usam ponto e vírgula. Motivo é obrigatório em revisar/fora.

### O que acompanha o checkout

`output/` é ignorado pelo Git. Sua ausência não significa perda do pacote de reprodução:

| Arquivo versionado | Uso |
| --- | --- |
| [reproducao/v20-entrega.json.gz](reproducao/v20-entrega.json.gz) | Dados preparados, checkpoint final, configuração pública, referência v2, prompts, política e CSV conferido. |
| [reproducao/vertex-baseline.json.gz](reproducao/vertex-baseline.json.gz) | Template público de configuração e projeções estatísticas para iniciar um experimento v20 novo. |
| [reproducao/manifesto.json](reproducao/manifesto.json) | Hashes dos pacotes e do CSV. |
| [reproducao/publicacao-v19.csv](reproducao/publicacao-v19.csv) | CSV anterior preservado para comparação. |

Os pacotes são cópias sanitizadas identificadas como tais, sem credenciais, identificadores particulares de conta/projeto/crédito ou caminhos locais absolutos. A reprodução offline confere os dados empacotados; não refaz chamadas de rede nem substitui a auditoria dos logs originais, que permanece no acervo local. Os relatórios históricos em `output/` não são necessários para esse comando.

## Iniciar uma classificação nova pela Vertex AI

Este caminho usa os mesmos modelos e prompts-base da v20 original, **gera propostas novas** e consome a cota e o orçamento do seu projeto. Não repete automaticamente a recuperação retrospectiva dos cinco IDs nem garante os mesmos resultados. A CLI genérica `npm run run` atende às outras configurações históricas; não é o comando desta condição.

### Instalação e autenticação

Em um **checkout novo**, sem resultados históricos no diretório de inicialização:

```sh
npm ci
npm ci --prefix experiments/vertex-v18
npm run vertex:init -- --project SEU_PROJECT_ID
npm run prepare:data
```

Substitua `SEU_PROJECT_ID` pelo seu projeto. `vertex:init` não faz chamadas de rede: instala o template sanitizado no caminho de baseline esperado pelo executor, associa o projeto informado e recusa sobrescrever um diretório existente. Os registros anteriores do template servem somente ao estimador offline de custo; não preenchem propostas da execução nova.

O SDK Google é instalado pelo segundo `npm ci`, com lockfile próprio. Essa condição usa **ADC — Application Default Credentials**, isto é, o login local do Google Cloud. Não precisa de chaves OpenRouter, OpenAI ou AI Studio no `.env`.

Instale a [Google Cloud CLI](https://docs.cloud.google.com/sdk/docs/install-sdk), habilite o faturamento e a API no projeto e use o login oficial:

```sh
gcloud auth login
gcloud services enable aiplatform.googleapis.com --project=SEU_PROJECT_ID
gcloud auth application-default login
gcloud auth application-default set-quota-project SEU_PROJECT_ID
```

Os comandos exigem uma conta com permissões adequadas. `gcloud auth login` autentica a CLI que habilita a API; o login ADC autentica a aplicação. A condição usa o endpoint global e explicita projeto de recurso e projeto de cota. O [transporte Vertex](experiments/vertex-v18/connection.ts) verifica destino e OAuth; trocar uma chave no `.env` não troca o canal de acesso. Configurar ADC não comprova aplicação de crédito promocional ou saldo disponível.

### Planejamento, verificação e execução

```sh
# Apenas planejamento local; --suite separa a identidade da execução.
npm run pipeline:v20 -- --suite meu-v20 --dry-run

# Consulta metadados com ADC/rede, sem generateContent.
npm run pipeline:v20 -- --suite meu-v20 --preflight

# Faça esta etapa somente com um teto de gasto aprovado.
npm run pipeline:v20 -- --suite meu-v20 --run --budget-usd VALOR_APROVADO
```

`VALOR_APROVADO` é um marcador: substitua por um número positivo. O teto histórico de US$75 deste projeto não é autorização para outra pessoa executar um experimento. No workspace já utilizado, as suítes v20 compartilham `output/individual-v20/pro-judge-v20-359/authorization.json` e `spend.json`: trocar apenas `--suite` não cria outro saldo nem apaga gastos.

A verificação de metadados não garante que a inferência passará por cotas, capacidade ou faturamento. Preços e disponibilidade precisam ser conferidos antes de um novo gasto; os perfis de preço foram congelados em 19/10/2026. O planejamento usa cenários de tokens e cache, não uma promessa de custo.

Resultados em `output/individual-v20/meu-v20/`: `manifest.json`, `prompts.json`, `checkpoint.json`, `records.json`, `requests.jsonl`, `events.jsonl`, `status.json`, `report.json` e `last-run.json`. `checkpoint.json` é o estado autoritativo. As respostas completas e os erros são preservados sem cabeçalhos de autenticação.

### Retomar e finalizar

```sh
# Mesmo nome, dados, código, modelos e prompts. Reaproveita etapas válidas.
npm run pipeline:v20 -- --suite meu-v20 --run
```

O teto já salvo é reutilizado. Respostas válidas e contadores não são zerados. O limite é de **cinco tentativas totais por questão e etapa**, incluindo a primeira e os erros recebidos. O SDK não acrescenta retentativas ocultas. Há uma inferência por vez; sem falhas, 359 questões novas exigem pelo menos 718 chamadas.

Ao concluir as 359 decisões, o executor gera avaliação e CSV em `output/delivery/meu-v20/` e uma cópia no diretório do experimento. A v20 não substitui automaticamente o CSV da raiz. Se houver pendências, a entrega integral fica bloqueada; siga o diagnóstico abaixo. Código, prompts, modelos ou política diferentes exigem outra identidade, com origem documentada.

A variante aplicada na entrega consolidada está em uma **finalização offline explícita**, não no motor congelado usado por esse comando. Os recuperadores [repair.ts](experiments/individual-v20/repair.ts) e [finish-recovery.ts](experiments/individual-v20/finish-recovery.ts) foram escritos para os cinco IDs históricos, não são um comando genérico para qualquer nova pendência. Consulte [o protocolo da recuperação](docs/recuperacao-v20.md) antes de criar outra versão.

## Bloqueios: diagnosticar, retomar e reduzir falhas

Primeiro leia `last-run.json`, `status.json`, os erros por ID no checkpoint e o status/corpo da resposta em `requests.jsonl`. Diferencie **resposta do servidor**, **falha local sem resposta**, **validação de conteúdo** e **veto de decisão**. Um 429 isolado não prova esgotamento diário nem estouro de RPM.

Durante uma retomada ativa, `last-run.json` e `report.json` podem ainda descrever a invocação anterior. Confira também o horário de `status.json`, a trava e o PID antes de concluir que o processo parou.

| Situação | Como proceder |
| --- | --- |
| HTTP 429 transitório, `RESOURCE_EXHAUSTED` | Aguarde a pausa do executor e retome com a mesma identidade quando necessário. A mensagem pode refletir cota ou capacidade compartilhada. Confira a mensagem completa, o projeto e outros consumidores da mesma cota. |
| Limite diário, faturamento ou teto do serviço explicitamente informado | Interrompa. Confira a janela de reset ou o faturamento no projeto. Repetições rápidas não resolvem esses casos. |
| HTTP 400, 401, 403 ou 404 | Corrija a causa: parâmetros, ADC expirado, permissões, API desativada, modelo/região indisponíveis ou projeto incorreto. São interrupções, não tentativas de obter aprovação por repetição. |
| DNS, rede bloqueada, timeout ou queda sem resposta HTTP | Confira conectividade e execute o preflight no mesmo ambiente de rede usado pelo processamento. Em um ambiente isolado, use a permissão de rede necessária. Na v20, uma falha ambígua de rede interrompe no primeiro envio e mantém o consumo desconhecido reservado. |
| Orçamento local insuficiente | Confira consumo conhecido e reservas; não confunda teto com cobrança. Um aumento exige autorização registrada, preservando os lançamentos anteriores. |
| JSON truncado, ID inválido ou evidência não literal | Confira o retorno e o feedback técnico. O motor tenta somente a etapa afetada, até o limite persistente. Ajustes de prompt ou saída máxima exigem outro experimento. |
| Parecer válido, mas decisão impossível | Examine a combinação entre proposta, rubricas, incertezas e alternativas. Corrija o contrato em uma política versionada e com testes; repetir um parecer idêntico não resolve um bloqueio determinístico. |
| Cinco tentativas esgotadas | A retomada comum não renova o limite. Um novo ciclo precisa de autorização, lista explícita de IDs, vínculo com o checkpoint anterior e contadores próprios preservando o histórico. |
| `run.lock`/trava compartilhada | Confira o PID e se o processo ainda existe antes de intervir. Uma execução ativa mantém sua trava. Para uma trava órfã, registre a interrupção, preserve a trava como evidência e só então libere o caminho; não remova checkpoints ou ledger. |
| Fingerprint diferente | Não altere o manifesto para fazê-lo passar. Use a versão de código preservada ou crie outro experimento. |
| LexML/MCP retorna verificação de segurança | Nos modos históricos com busca, prefira uma API oficialmente oferecida, cache autorizado ou corpus local versionado. Registre a indisponibilidade; a condição entregue já opera sem essa dependência. |

### Abordagem já implementada para 429 e rede

A v20 usa `maxRetries=0`, uma tentativa no SDK, processamento sequencial e até cinco envios por etapa. Para 429, aguarda **pelo menos 60 segundos**, podendo respeitar uma espera maior indicada pelo serviço, com cooldown compartilhado por modelo dentro da suíte. A espera por capacidade não gasta tentativa; um envio realizado gasta. O erro e o consumo informado continuam registrados.

Esse é um controle **reativo**: a v20 não aplica o controle preventivo de RPM/TPM/RPD das versões v14/v16. Ausência de paralelismo reduz picos, mas não garante capacidade do Google nem coordena consumidores externos do mesmo projeto. Recuo exponencial com aleatoriedade, escalonamento preventivo por projeto e redução do orçamento de tokens são evoluções possíveis, a serem versionadas e medidas; não estão ativos silenciosamente nessa execução congelada.

O [guia oficial de 429](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/error-code-429) recomenda endpoint global, tratamento de retentativas e suavização de tráfego. Modelos, provedores ou contexto alternativos devem formar outra condição de teste, com os custos e efeitos de qualidade registrados.

### Reservas financeiras de rejeições confirmadas

O cliente congelado mantém reservas quando o consumo não vem na resposta. A [política de preços do Google](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing) informa que entrada e saída são cobradas somente para respostas 200. Por isso, reconciliamos os **429 comprovados** nos logs, com backup do ledger e auditoria; falhas sem resposta HTTP continuam desconhecidas.

Para inspecionar a reconciliação histórica da v20, sem inferência:

```sh
node --import tsx experiments/individual-v20/reconcile.ts
```

O comando mostra os lançamentos elegíveis; `--apply` aplica a política documentada, com trava e backup, somente quando nenhuma execução compartilha o ledger. **Esse script lê as duas suítes históricas codificadas nele.** Para uma suíte nova, a auditoria deve selecionar seus próprios logs e comprovar cada rejeição; não atribua custo zero a uma chamada sem resposta ou a uma resposta 200 rejeitada pela validação. Nenhuma reconciliação zera contadores de tentativas ou confere a fatura Google.

### A variante para dúvida de fora

`judge-confirms-outside-v1` executa primeiro a regra original. Quando uma proposta válida já é fora, mas a incerteza do classificador impede a decisão, permite que o juiz resolva essa dúvida se **as três rubricas estiverem sustentadas, `fora_sustentado=true`, sem tema alternativo, extras, alertas ou avisos materiais de entrada**. A incerteza original continua no registro; o motivo da exclusão incorpora a distinção feita pelo juiz.

Na recuperação, a política foi reaplicada às respostas em ordem de recebimento, aceitando o primeiro parecer elegível: Q0154 na primeira tentativa e Q0298 na terceira. `decision-policy.json` registra IDs de requisição, hashes e regra aplicada. A variante não altera as condições de publicar nem cria uma revisão sem tema. As duas decisões fora divergem da referência atual: precisam de conferência jurídica antes de serem tratadas como exclusões confiáveis.

## Autoavaliação, confiança e limites

A referência utilizada na entrega é [analise-propria-v2](referencias/analise-propria-v2/README.md). A v1 permanece histórica. A comparação acontece depois da inferência: não preenche destinos nem oferece a resposta esperada ao classificador/juiz.

**Concordância por ramo** conta tema exato, ancestral ou descendente; **exata** conta somente o mesmo ID. Ambas usam apenas as publicadas como denominador. **Cobertura** é publicadas/359; revisar e fora permanecem no denominador. A concordância de fora é relatada separadamente. Extras não corrigem um tema central divergente. Os intervalos Wilson são descritivos e não eliminam erros da referência, seleção dos casos ou exposição aos resultados.

O CSV usa a confiança subjetiva declarada pelo classificador, sem calibração. Em fora, o campo é zero por ausência de tema central. Três rubricas sustentadas não equivalem a probabilidade calibrada de 95%. A divisão desenvolvimento/avaliação é opcional no código histórico e não transforma esta recuperação dirigida em um teste reservado. A situação da previsão, do relatório final e do memo permanece explícita no início deste documento.

## Organização e histórico

| Caminho | Conteúdo |
| --- | --- |
| `anexos/` | Questões originais, taxonomia e modelo de entrega. |
| `src/` | Preparação, schemas, clientes históricos, regras, avaliação e módulos opcionais de contexto. |
| `experiments/` | Executores e perfis por versão; Vertex tem dependências isoladas. |
| `delivery/` | Exportação validada e política explícita de confirmação de fora. |
| `reproducao/` e `reproduction/` | Pacotes públicos sanitizados e código de reprodução, respectivamente. |
| `referencias/` | Referências provisórias de avaliação; os livros não são necessários para a condição entregue. |
| `docs/` e `relatorio/` | Protocolos, análises, decisões e material do relatório. |
| `output/` | Logs e resultados locais originais, ignorados pelo Git. |

O [README anterior, arquivado em 19/10](docs/historico-readme-2026-10-19.md), preserva o histórico e o retrato de 18/10. A [tabela de experimentações](relatorio/tabela-resultados-experimentacoes.md) e o [histórico de decisões](relatorio/historico-de-decisoes.md) permitem acompanhar os testes; seus números refletem as datas de cada documento, não necessariamente a entrega posterior consolidada.

Referências de implementação: [preparação e cenário de 50 mil questões](docs/preparacao-e-producao.md), [Vertex v18](docs/vertex-v18.md), [v20 original](docs/individual-v20-pro-judge.md), [RAG local](docs/base-local-rag.md), [livros de Criminologia](docs/livros-criminologia.md) e [integração LexML/MCP](docs/integracao-lexml-mcp.md). A arquitetura partiu do [case UNIPDS de triagem de suporte](https://github.com/kurybr/unipds-grupo-de-estudos/tree/main/desafios/02-triagem-de-suporte).

## Verificações locais

```sh
node --import tsx --test tests/reproduction*.test.ts tests/confirmed-outside.test.ts tests/delivery.test.ts
node node_modules/typescript/bin/tsc --project experiments/individual-v20/tsconfig.json
npm run delivery:reproduce
```

Esses comandos usam dados salvos ou respostas simuladas. Instalação, reprodução offline e testes não iniciam inferências pagas. As instruções históricas que usam `--run` ou preflight de rede têm escopo separado e aparecem explicitamente como tais.
