# Arquivo histórico do README — 19/10/2026, antes da revisão

O texto abaixo preserva a documentação anterior, incluindo o retrato de 18/10. Expressões como atual ou padrão pertencem àquela fase. Para executar a entrega consolidada, siga o README da raiz. Os caminhos output/ citados aqui são auditoria histórica local e não integram o pacote público; o CSV v19 foi preservado separadamente.

# Classificação de tópicos jurídicos

**Nova condição preparada (v20):** [questão a questão, com Gemini 3.1 Pro como juiz](../docs/individual-v20-pro-judge.md). Classificador Gemini 3.5 Flash-Lite/high preservado, juiz `gemini-3.1-pro-preview`/medium, ambos sem RAG. `npm run pipeline:v20 -- --dry-run` produz o planejamento das 359 questões e dos custos. A execução depende de teto financeiro próprio: o orçamento antigo b30/b20/b10 não inclui b1. Resultados e CSV da v19 são preservados.

**Execução atual sem RAG (v19):** 359/359 questões com proposta, parecer e decisão; 311 publicadas, 43 para revisão e cinco fora. Classificador Gemini 3.5 Flash-Lite/high e juiz Gemini 3.8 Flash/medium via Vertex AI. Foram 94 chamadas em 38,8 minutos, com custo bruto estimado de US$ 4,74. Concordância nas publicadas com a referência própria v2: 85,2% por ramo e 71,4% exata; a meta de 95% ainda não foi atingida. Os experimentos anteriores permanecem preservados.

O [CSV da execução completa](../reproducao/publicacao-v19.csv) está na raiz. Para gerar a entrega a partir dos resultados salvos, sem novas inferências, execute `npm run delivery:v19`. O comando valida as 359 decisões e produz também avaliação, divergências e auditoria em `output/delivery/model-only-v19-359/`. Um snapshot existente é preservado; para outra exportação use `-- --name entrega-v19-2`. O [mapeamento das seis etapas e os comandos](../docs/avaliacao-e-entrega-v19.md) explicam preparação, classificador, validação, juiz, decisão e avaliação. A confiança do CSV é declarada pelo classificador e não calibrada. `previsao.txt` depende de autoavaliação explícita; não é inferido retroativamente dos resultados. As instruções históricas abaixo continuam disponíveis para reproduzir outras condições.

Para executar e gerar o CSV automaticamente ao final, use `npm run pipeline:v19 -- --run`. O comando integrado reaproveita experimentos completos sem repetir inferências; em uma execução em andamento, gera a entrega após concluir todas as questões. A finalização é repetível quando as fontes e os arquivos são idênticos e recria o CSV da raiz caso ele esteja ausente.

**Atualização da base (18/10):** [dois livros de Criminologia incorporados](../docs/livros-criminologia.md) em `desafio359-v6-livros`: 6.535 trechos, dos quais 1.155 doutrinários, preservando as versões anteriores. Há candidatos para os 359 IDs, mas 21 lacunas documentais continuam explícitas. Consulte o [catálogo](../docs/catalogo-base359-livros.md) ou execute `npm run knowledge:inspect`. A nova condição usa `--config config/individual-v13-livros.json`; os padrões históricos de classificação abaixo foram preservados.

**Limites Gemini v14:** [controle persistente de RPM, TPM e RPD](../docs/limites-gemini-v14.md), com configuração separada `config/individual-v14-limites.json`. Mantidos Gemini 3.1 Flash-Lite/3.8 Flash; limites locais de 15 RPM em ambos, com 250.000 TPM/1.000 RPD no classificador e 1.000.000 TPM/1.500 RPD no juiz. Consultar `node --import tsx src/index.ts limits --config config/individual-v14-limites.json`. A cota real do Google continua independente do teto local.

**Projeto Google atual na v16:** [serialização, tratamento de 429 e retomada](../docs/gemini-v16-serializacao.md), usando `config/individual-v16-projeto3.json` no experimento `gemini35-v16-projeto2-359`. O usuário confirmou novo projeto e créditos às 18h02 de 18/10. O checkpoint e o orçamento acumulado foram preservados; os contadores são separados por projeto e há uma inferência por vez entre processos locais atualizados. A configuração anterior `individual-v16-projeto2.json` está preservada para histórico.

**Teste integral v15:** [Gemini 3.5 Flash-Lite / 3.8 Flash](../docs/gemini35-v15.md), desde Q0001, usando `config/individual-v15-gemini35.json`. Espaçamentos mínimos de 2,1 s e 4,1 s, janela móvel de RPM e controles TPM/RPD compartilhados. Versões anteriores preservadas.

Pipeline em TypeScript e LangGraph para classificar as 359 questões do case. Dois papéis de IA: classificador e juiz. Preparação, validação, decisão e avaliação são executadas por código. A CLI usa por padrão **uma questão por requisição**, com classificador Gemini 3.1 Pro e juiz GPT-5.2 pelas APIs diretas, RAG local e prompts v9/v8. As configurações anteriores dos modelos gratuitos e lotes de até 30 permanecem disponíveis por `--config`.

A pesquisa experimental do juiz via MCP está descrita em [docs/integracao-lexml-mcp.md](../docs/integracao-lexml-mcp.md). O MCP alternativo `ehrodan/lexmcp` foi integrado com duas ferramentas LexML; a comparação com dez questões depende de o portal deixar de retornar verificação de segurança. Consulte o relatório de execução (arquivo histórico local: `output/integration/lexml-mcp/relatorio.md`) antes de iniciar o piloto.

O novo modo [contexto pela API direta](../docs/contexto-api-lexml.md), em `config/individual-v5-contexto-api.json`, faz a aplicação pesquisar o tema proposto e o assunto original entre os agentes. O juiz v5 recebe os metadados disponíveis ou a falha registrada e pode emitir parecer mesmo quando a pesquisa falha; nesse caso, eventual publicação vai para revisão. Esse modo dispensa MCP e tool calling. A proteção do endpoint LexML ainda pode impedir resultados.

A [base local com RAG](../docs/base-local-rag.md) usa SQLite FTS5/BM25 e documentos congelados para Q0001–Q0050. Os testes atuais usam `penal50-v3`, com 492 trechos, e a referência de avaliação `analise-propria-v2`. A configuração `config/individual-v9-classifier-tools.json` permite ao classificador escolher consultas e mantém a recuperação automática do juiz; `config/individual-v9-control.json` é o controle sem RAG no classificador. Resultados, falhas e conferência jurídica das cinquenta questões por condição (arquivo histórico local: `output/comparisons/rag-classificador-v9/analise.md`). O modo histórico v6 e o corpus v2 permanecem disponíveis.

A configuração paga `config/individual-v10-gemini-openai.json` é o padrão da CLI. Os clientes, credenciais, orçamento persistente e comandos estão em [docs/modelos-pagos.md](../docs/modelos-pagos.md). O arquivo histórico `config/default.json` e os experimentos gratuitos continuam disponíveis.

A condição experimental [Gemini Flash v11](../docs/gemini-flash-v11.md) usa Gemini 3.1 Flash-Lite no classificador e Gemini 3.8 Flash no juiz, ambos pela API Google. Selecionar com `--config config/individual-v11-gemini-flash.json`; prompts, RAG e regras são preservados.

O piloto de dez questões (arquivo histórico local: `output/comparisons/gemini-flash-v11/analise.md`) concluiu todas as propostas e pareceres, com sete publicações, três revisões e concordância exata de 71,4% entre publicadas. A análise separa os 100% por ramo das divergências de granularidade e das falhas jurídicas das justificativas.

## Início

Requer Node.js 22.13 ou superior, com `node:sqlite` e FTS5 disponíveis.

```bash
npm ci
cp -n .env.example .env
# Preencher GEMINI_API_KEY e OPENAI_API_KEY no .env local.
npm run prepare:data # primeira preparação; repetir se entradas ou regras de limpeza mudarem
npm test
npm run typecheck
npm run preflight
npm run run -- --experiment pagos-v10-gemini-openai --limit 10 --dry-run
npm run run -- --experiment pagos-v10-gemini-openai --limit 10 --budget-usd 10
npm run evaluate -- --experiment pagos-v10-gemini-openai --limit 10
```
O código não inclui credenciais. O comando `preflight` nas APIs diretas consulta acesso aos modelos e usa os preços versionados; no modo gratuito consulta também cota e catálogo OpenRouter. Não faz inferências. A disponibilidade e o faturamento ainda podem variar na chamada real. Para executar o modo anterior, informar `--config config/individual-v3.json` e sua chave OpenRouter.

`prepare:data` produz `output/prepared.json`: 359 questões normalizadas, taxonomia e diagnóstico de limpeza. Não altera os anexos. Remove comentários, XML e estilos de Word também das alternativas; mantém texto jurídico, entidades decodificadas e separações. Questões com imagem ou conteúdo insuficiente recebem avisos materiais. Os rótulos de origem não entram nos prompts v3; no modo optativo de API direta, orientam a busca e entram apenas no contexto do juiz. As referências de análise própria não entram em nenhum dos dois agentes.

No recorte fixo do desafio, a preparação é uma etapa separada e reutilizável: não deve ser repetida a cada teste de prompt ou troca de modelos. `run`, `evaluate` e `compare` carregam o arquivo já preparado. A checagem dos hashes dos anexos continua acontecendo para detectar mudanças; ela não refaz a limpeza. Se os anexos mudarem, ou se alterarmos as regras de preparação, gere novamente o arquivo antes dos próximos experimentos.

O módulo é mantido também como base conceitual para novas importações e o cenário de 50 mil questões semanais. O que já existe e as adaptações necessárias para esse cenário estão separados em [docs/preparacao-e-producao.md](../docs/preparacao-e-producao.md).

O comando `run` devolve código 2 quando há itens pendentes, e 1 para falha de configuração. Uma execução com limite de chamadas atingido pode ser retomada pelo mesmo comando. Nas configurações gratuitas, o orçamento de chamadas é **por invocação**; nas APIs diretas, o limite de chamadas e o orçamento em dólares são persistentes por experimento. O limite de cinco tentativas por questão e etapa é persistente em ambos e não se renova na retomada. A cota informada pela API é compartilhada pela conta e pode ser consumida por outros aplicativos.

## Fluxo e publicação

```text
Novas entradas ou mudança na limpeza:
preparar → output/prepared.json

Testes com dados já preparados:
carregar e conferir hashes → classificador → validar proposta → juiz → validar parecer → decidir → salvar
```

O juiz recebe questão, árvore ativa e proposta. Avalia `tema_central`, `evidencia_textual` e `distincao_de_concorrentes`, cada qual com `sustentado`, `incerto` ou `inadequado` e justificativa. Recebe a proposta no mesmo contexto: não é avaliação cega. Os modelos distintos não eliminam erros comuns.

Para publicar, os três critérios devem estar sustentados, sem incertezas ou alertas materiais, divergência de tema ou extras não sustentados. Raízes vão para revisão por padrão. O juiz não substitui automaticamente o tema do classificador. A política privilegia precisão e pode reduzir cobertura; seu efeito deve ser medido.

`fora` exige ausência de ramo adequado sustentada pelos dois papéis. Se o juiz contestar `fora`, deve sugerir tema ativo para permitir revisão. Sem sugestão válida o item fica pendente. Erros técnicos nunca viram `fora`, revisão fictícia ou tema raiz padrão.

Cada trecho citado é localizado no campo correspondente. Essa checagem prova apenas a presença do trecho; sua pertinência semântica pertence ao juiz. IDs, status dos temas, duplicatas e consistência dos campos também são verificados. A validação é por item: um registro defeituoso não descarta os irmãos válidos. Resposta truncada ou envelope ilegível deixa o lote pendente.

## Retomada e experimentos invertidos

```bash
# Retoma somente etapas faltantes das mesmas 50 questões.
npm run run -- --experiment individual-v3-invertido-50 --limit 50 --max-calls 500

# Mesmas questões, mesmos prompts e papéis trocados, em outro experimento.
npm run run -- --experiment individual-v3-papeis-trocados --swap --limit 50 --max-calls 500
npm run compare -- --left individual-v3-invertido-50 --right individual-v3-papeis-trocados --limit 50
```

O limite padrão é 500 chamadas por invocação. Cinquenta questões individuais exigem cem chamadas sem falhas e até quinhentas com cinco tentativas por etapa. Todas as 359 questões exigiriam pelo menos 718 chamadas; a cota e o orçamento devem ser conferidos antes de ampliar o recorte. Cada questão roda sequencialmente; propostas e pareceres válidos não são refeitos. Não há troca automática por modelos pagos ou outros modelos.

No modo individual, `maxAttemptsPerStage: 5` inclui a primeira tentativa e exige `batchSize: 1` e `maxRetries: 0`. O último campo pertence ao transporte legado e fica desligado para evitar multiplicação dos limites. Rede/timeout, HTTP transitório (408, 429 por minuto e 5xx), JSON inválido, truncamento e falhas de validação podem repetir somente a etapa afetada. Erros de formato, IDs ou evidências recebem feedback técnico na próxima chamada, sem referência ou rótulo esperado. A espera cresce de dois a dezesseis segundos e respeita indicações de espera do serviço até o timeout configurado. Falta de cota, orçamento, autenticação e erros HTTP não transitórios interrompem a execução.

As novas execuções compartilham o controle de taxa em `src/rate-limit.ts`: `requestsPerMinute: 18`, janela móvel de sessenta segundos e intervalo mínimo também compartilhado. O estado em `output/rate-limit/openrouter-free.json` coordena classificações, julgamentos e retentativas entre processos desta pasta. HTTP 429 compartilha a pausa informada por `Retry-After`/`X-RateLimit-Reset`; sem indicação, espera um minuto. Esperar capacidade não consome tentativa. Esse controle preserva o limite externo do serviço; detalhes e alcance estão em [docs/controle-de-taxa.md](../docs/controle-de-taxa.md).

Os contadores `attempts.classifier` e `attempts.judge` são salvos antes de cada envio. Uma falha ou queda entre essa reserva e o envio pode consumir uma tentativa local sem inferência; a reserva conservadora impede ultrapassar cinco envios por etapa. Ao esgotar o limite, o item permanece pendente e o fluxo segue para a questão seguinte. Pareceres válidos com `incerto`, `inadequado`, tema alternativo ou decisão de revisão não são falhas técnicas e não são reenviados para tentar obter aprovação. Pendências com proposta e parecer já salvos também não disparam novas chamadas.

Cada experimento tem manifesto com hashes das entradas, prompts, código e dependências, configuração e eventual divisão dos dados. Código, prompts, modelos ou política diferentes exigem outro nome de experimento. Orçamento e parâmetros de espera podem variar na retomada. Uma trava evita duas execuções simultâneas do mesmo experimento. Após encerramento abrupto, confira se o processo terminou antes de remover `run.lock`.

Arquivos em `output/experiments/<nome>/`:

- `records.json`: proposta, parecer, decisão, erros e contadores persistentes por ID, salvos antes de cada tentativa e após cada etapa.
- `requests.jsonl`: corpo enviado, resposta completa, status e duração por tentativa; sem Authorization ou chave.
- `events.jsonl`: consumo retornado pelo serviço, modelos, provedor, validações e orçamento.
- `manifest.json` e `prompts.json`: configuração e prompts preservados.
- `last-run.json`: itens concluídos, pendentes e motivo de parada.
- `evaluation-*.json`: concordância detalhada e divergências.

O salvamento não torna a chamada remota exatamente única: se o processo cair depois da resposta e antes de gravá-la, uma retomada pode repetir a inferência. Os registros de início e resposta ajudam a auditar esse caso. Não edite checkpoints manualmente. Decisões humanas futuras devem ter mecanismo explícito de alteração com ID, motivo e autoria; nenhuma decisão humana foi incorporada nesta implementação.

## Desenvolvimento e avaliação, em linguagem direta

Suponha que usamos 60 questões para descobrir que o prompt confunde apelação com RESE e corrigimos o texto. Essas 60 ajudaram a construir a solução: são desenvolvimento. As outras 299 servem para verificar o comportamento depois do ajuste. Todas as 359 continuam na entrega final.

**A divisão é opcional e não é criada automaticamente.** Sem divisão, os resultados são chamados `exploratorio`; podem ajudar a melhorar a solução, mas não representam teste reservado. Caso queira reservar questões, crie a divisão **antes do primeiro experimento**:

```bash
npm run split:data -- --development-count 60 --seed case-v1
npm run run -- --experiment reservado --subset development
npm run evaluate -- --experiment reservado --subset development
# Ajustes em prompts/código exigem novo experimento.
# Depois de congelar a configuração escolhida:
npm run run -- --experiment reservado --subset evaluation
npm run evaluate -- --experiment reservado --subset evaluation
```

A seleção usa hash dos IDs e uma semente, sem consultar rótulos da referência. Não é estratificação por dificuldade. A divisão não apaga exposições prévias e não cria uma referência externa independente. Se um resultado reservado for usado para ajustar a solução, registre essa exposição no diário e passe a tratá-lo como desenvolvimento. O sistema registra os IDs e o subconjunto de cada execução; ele não consegue inferir se uma pessoa usou um relatório para modificar um prompt.

## Autoavaliação

`referencias/analise-propria-v1/referencia.jsonl` é a base provisória escolhida. Seu hash e os hashes das entradas são conferidos contra o manifesto. Não é gabarito oficial. A avaliação mede concordância de tema, não acerto de alternativa jurídica.

Aceita ID exato, ancestral e descendente. Irmãos são erro; extras não tornam uma resposta correta. Relata cobertura e concordância nas publicadas, resultados do classificador antes do filtro e análise de sensibilidade sem raízes amplas, sem referências com limitações e sem itens de exposição prévia. Ausência de publicações produz concordância nula, não 100%. Intervalos Wilson não corrigem defeitos da referência ou dependência entre itens.

`compare` informa se os experimentos concluíram os mesmos IDs e grava os registros pareados. Não compare apenas médias gerais quando os conjuntos concluídos diferem. Trocar os papéis e escolher a melhor configuração com base nessas questões também é um ajuste de desenvolvimento.

## Confiança e exportação

`confianca_declarada` é uma estimativa subjetiva do classificador; três aprovações do juiz não são uma probabilidade de 95%. A implementação não inventa uma precisão prevista.

Com divisão explícita, é possível produzir uma estimativa agrupada usando **somente desenvolvimento**:

```bash
npm run calibrate -- --experiment reservado
npm run export -- --experiment reservado
```

A estimativa usa `(acertos+1)/(n+2)` por decisão, com ao menos 20 casos por grupo. É uma aproximação da concordância com a referência provisória e não comprova calibração individual ou precisão jurídica real. Se a amostra de um grupo for insuficiente, a exportação nesse modo é bloqueada.

Para usar explicitamente as estimativas subjetivas, aceitando a limitação:

```bash
npm run export -- --experiment baseline --confidence declared
```

A exportação exige decisões válidas para **todas as 359 questões**. Produz `output/delivery/<nome>/publicacao.csv` e `exportacao.json`, que declara a origem da confiança. `fora` recebe confiança 0 por não possuir tema central; não significa confiança zero na decisão de exclusão.

`previsao.txt` só é gerado a partir de uma previsão explicitamente fornecida, para não fabricar números. Crie um JSON com `precision`, `precisionLow`, `precisionHigh`, `coverage`, `coverageLow`, `coverageHigh` (0–1) e `explanation`, e informe `--forecast caminho.json`. Registre a previsão antes de consultar a avaliação reservada. O programa valida intervalos, mas não comprova a ordem temporal da previsão. A cobertura do CSV concluído é uma fração exata; seu intervalo pode ter extremos iguais. O relatório final e o memo serão escritos após os experimentos, com resultados reais.

## Configuração e origem

Os prompts atuais são `classificador.v3.md` e `juiz.v3.md`, selecionados por `classifierPrompt` e `judgePrompt` em `config/default.json`. As versões anteriores permanecem em `src/agents/`. A revisão v3 preserva o formato de resposta e está descrita em [docs/prompts.md](../docs/prompts.md); ainda não há evidência de melhora de desempenho. Para comparar versões, copie a configuração e altere os dois nomes, ou apenas um para isolar o efeito de um papel, sempre usando outro nome de experimento.

`config/default.json` e `config/individual-v3.json` usam a abordagem individual. O timeout é de até 15 minutos por requisição; cada questão tem o teto completo de 32.000 tokens compartilhado entre raciocínio e resposta. `reasoningByModel` acompanha o modelo na inversão dos papéis: o padrão ativa raciocínio no classificador 3.5 Super VL e solicita `medium` no juiz 3 Super. A consulta prévia exige suporte anunciado ao parâmetro configurado. O efeito real depende do provedor e deve ser medido. `--config outro.json` permite variações explícitas. Configurações históricas sem `maxAttemptsPerStage` preservam o modo anterior, com uma tentativa de validação por invocação. A mudança de código e política exige novo experimento; resultados antigos continuam disponíveis para avaliação.

Base conceitual: [UNIPDS — Triagem de suporte](https://github.com/kurybr/unipds-grupo-de-estudos/tree/main/desafios/02-triagem-de-suporte). Reaproveitados o desenho de configuração por papel, prompts Markdown, estado compartilhado e construção de grafo. A implementação do transporte usa `fetch` diretamente para controlar e registrar cada tentativa, sem retentativas ocultas de SDK. Integrações de WhatsApp e supervisor com retornos não entram neste fluxo.

Documentação consultada: [LangGraph](https://docs.langchain.com/oss/javascript/langgraph/use-graph-api), [limites OpenRouter](https://openrouter.ai/docs/api_reference/limits), [respostas estruturadas](https://openrouter.ai/docs/guides/features/structured-outputs).

O preço de tokens esperado para os dois endpoints `:free` é zero e é verificado antes da execução. Custo e duração observados vêm dos registros retornados, nunca de uma suposição de tempo. Disponibilidade, cotas e qualidade serão medidos no piloto. Testes automatizados usam respostas simuladas; chamadas reais ficam separadas e consomem a cota da conta.

## Histórico: primeira integração

Os testes locais passaram. A primeira execução real, `piloto-v1`, tentou Q0001–Q0030 e atingiu o limite inicial de cinco minutos na primeira chamada. Não recebeu classificações e não chamou o juiz. O resultado e a tentativa estão preservados em `output/experiments/piloto-v1/`; custo/consumo da inferência interrompida não foram informados.

A configuração adotada após aquela integração usava espera de até 15 minutos e esforço baixo no Nemotron. Os prompts v3 explicitaram os critérios temáticos. Os ajustes e testes seguintes estão registrados abaixo; o padrão atual é o modo individual descrito no início deste documento. Para testar esse padrão, use um novo nome:

```bash
npm run run -- --experiment piloto-v3 --limit 30 --max-calls 300
npm run evaluate -- --experiment piloto-v3 --limit 30
```

Nenhuma das 359 questões recebeu classificação a partir das referências. Na primeira integração descrita nesta seção ainda não havia entrega completa. O CSV integral da v19 está disponível no início deste README.

## Primeiro lote concluído: 20 questões

O experimento `piloto-20-v3` com esforço baixo recebeu resposta, mas 17.669 dos 18.000 tokens de saída foram usados em raciocínio, deixando o JSON truncado. O diagnóstico está preservado em `output/experiments/piloto-20-v3/diagnostico.json`.

Com `config/piloto-20-sem-raciocinio.json`, o experimento `piloto-20-v3-sem-raciocinio` completou 20 propostas, 20 pareceres e 20 decisões. Foram quatro chamadas: duas iniciais e duas para retomar quatro itens com evidências inválidas. As respostas informaram zero tokens de raciocínio e custo de US$ 0. Naquele momento o padrão era 30; as configurações históricas de 20 permanecem separadas do padrão individual atual.

```bash
node --import tsx src/index.ts run --config config/piloto-20-sem-raciocinio.json --experiment novo-piloto-20 --limit 20 --max-calls 2
# Se houver pendências, repetir o comando retoma apenas o que falta, com novo orçamento de até duas chamadas.
node --import tsx src/index.ts evaluate --experiment novo-piloto-20 --limit 20
```

Os pareceres podem ser lidos em `output/experiments/piloto-20-v3-sem-raciocinio/pareceres.md`; `records.json` guarda as estruturas completas. A concordância exploratória com a referência provisória foi 13/20 (65%). O juiz sustentou todos os itens e as regras indicaram publicar os 20, inclusive as sete divergências com a referência. O teste comprovou a execução do fluxo; ainda precisamos melhorar e medir o filtro de qualidade. Esses números não comprovam precisão jurídica real ou a meta de 95%.

## Comparação: dois lotes de 10 com raciocínio

`config/piloto-10-raciocinio.json` mantém os mesmos 20 IDs, modelos, prompts e regras, mas usa lotes de 10, esforço `medium` no Nemotron (maior nível anunciado no catálogo consultado), raciocínio ativado no Dots e teto de 32.000 tokens de saída por chamada. O controle aceita também `enabled=true`. A consulta prévia confere se o esforço consta dos níveis anunciados e se a desativação é permitida quando solicitada.

O experimento `piloto-2x10-v3-raciocinio` gerou 20 propostas e 20 pareceres em seis chamadas, incluindo recuperação de quatro itens com citações inválidas. Gerou 19 decisões de publicar e deixou Q0020 pendente por contradição no parecer. A concordância do classificador permaneceu em 13/20 (65%): primeiro grupo 7/10 e segundo 6/10, contra 6/10 e 7/10 anteriormente. A soma dos tempos de API aumentou de 3 min 34 s para 19 min 10 s; custo informado de ambos: US$ 0.

A concordância entre as 19 publicadas foi de 13/19 (68,4%), mas a comparação anterior também foi de 13/19 nos mesmos IDs. Não houve melhora agregada observada neste recorte. Lote, raciocínio e orçamento de saída mudaram juntos; essa comparação não isola cada fator nem comprova precisão jurídica real.

```bash
node --import tsx src/index.ts evaluate --experiment piloto-2x10-v3-raciocinio --limit 20
node --import tsx src/index.ts compare --left piloto-20-v3-sem-raciocinio --right piloto-2x10-v3-raciocinio --limit 20
python3 scripts/resumir-piloto.py piloto-2x10-v3-raciocinio --baseline piloto-20-v3-sem-raciocinio
```

O último comando produz `resumo.json` e `pareceres.md` a partir dos registros salvos, sem inferência. Consulte `output/experiments/piloto-2x10-v3-raciocinio/pareceres.md` para a leitura dos pareceres e a tabela de comparação. Q0020 tem proposta e parecer, mas continua sem decisão automática; repetir a execução não resolve, por si só, essa pendência sem análise do protocolo.

## Histórico: juiz Nemotron 3.5 Super VL

Nessa etapa, o juiz passou a ser `nvidia/nemotron-3.5-super-vl:free`, com classificador `nvidia/nemotron-3-super-120b-a12b:free`. As configurações desses pilotos preservam seus modelos originais. O padrão individual atual usa os papéis invertidos.

Para comparar com o último piloto de dois lotes de 10, use `config/piloto-10-juiz-nemotron-3.5.json`: troca somente o modelo do juiz e transfere a ativação de raciocínio para ele. Mantém lote de 10, esforço `medium` no classificador, prompts v3, teto de 32.000 tokens e demais parâmetros do piloto anterior. Use outro nome de experimento:

```bash
node --import tsx src/index.ts preflight --config config/piloto-10-juiz-nemotron-3.5.json
node --import tsx src/index.ts run --config config/piloto-10-juiz-nemotron-3.5.json --experiment piloto-2x10-v3-juiz-nemotron-3.5 --limit 20 --max-calls 4
```

Em 16/10/2026, a consulta prévia confirmou preço zero, suporte a JSON Schema e controle de raciocínio para o novo juiz. O catálogo não anunciou `reasoning_effort` para ele; a configuração usa `enabled: true`. A troca foi validada pela consulta prévia e pelos testes locais, sem executar inferências com o novo modelo.

## Cinco lotes com os modelos nos dois papéis

Os testes `piloto-5x10-v3-juiz-nemotron35` e `piloto-5x10-v3-invertido-nemotron35` usaram os mesmos 50 IDs (Q0001–Q0050), com cinco lotes iniciais de dez, a configuração acima e orçamento de dez chamadas por execução. O segundo foi executado com `--swap`, mantendo raciocínio por modelo e prompts por papel. Ambos receberam 50 propostas e 50 pareceres.

O primeiro teste teve 39 publicações, nove revisões, um fora e Q0020 pendente de decisão, com 14 chamadas incluindo duas recuperações. A concordância do classificador foi 35/50 (70%) e a das publicadas, 30/39 (76,9%). O invertido concluiu em dez chamadas sem recuperações: 45 publicações e cinco revisões; concordância de 39/50 (78%) nas propostas e 35/45 (77,8%) nas publicadas. O custo informado foi zero nos dois testes.

A inversão teve maior concordância nas propostas e maior cobertura, mas o juiz ainda publicou dez divergências com a referência. A análise dos mesmos itens publicados e as falhas da recuperação estão no relatório consolidado (arquivo histórico local: `output/comparisons/piloto-5x10-v3-papeis.md`). Os resultados não comprovam a meta de 95% ou precisão jurídica real. A configuração padrão não foi alterada em função do resultado.

```bash
node --import tsx src/index.ts compare --left piloto-5x10-v3-juiz-nemotron35 --right piloto-5x10-v3-invertido-nemotron35 --limit 50
python3 scripts/resumir-piloto.py piloto-5x10-v3-juiz-nemotron35
python3 scripts/resumir-piloto.py piloto-5x10-v3-invertido-nemotron35 --baseline piloto-5x10-v3-juiz-nemotron35
```

## Testes v2 e catálogo de erros

Os testes v2 tentaram os mesmos cinco grupos de dez nas duas configurações, sem alterar `decide`. A configuração com classificador 3 Super e juiz 3.5 VL obteve 49 propostas e pareceres, com duas pendências e concordância de 29/38 (76,3%) entre publicadas. A invertida obteve 39 propostas e pareceres, onze pendências e concordância de 9/11 (81,8%) entre publicadas. A última recuperação dos onze itens invertidos não recebeu autorização de execução. A meta de 95% não foi atingida.

O relatório v2/v3 (arquivo histórico local: `output/comparisons/piloto-v2-v3.md`) apresenta resultados, denominadores e consumo conhecido. O anexo de erros e itens (arquivo histórico local: `output/comparisons/piloto-v2-erros-e-itens.md`) inclui enunciados, alternativas, citações rejeitadas, histórico por ID e publicações divergentes da referência. Para regenerar esse anexo a partir dos registros salvos, execute `python3 scripts/relatorio-piloto-v2.py`.

## Envio individual v3 e controle de taxa

`individual-v3-invertido-50` tentou Q0001–Q0050 com classificador 3.5 Super VL, juiz 3 Super, prompts v3 e até cinco tentativas totais por questão e etapa. Produziu 50 propostas, 49 pareceres e 49 decisões em 113 chamadas: 38 publicações, oito revisões e três fora. Q0039 esgotou cinco pareceres com contradição entre proposta dentro da árvore e `fora_sustentado=true`; permaneceu pendente, e o processamento dos demais itens continuou.

Foram 13 tentativas adicionais, incluindo recuperações de timeouts, citações e respostas interrompidas. O custo informado foi zero nas 110 respostas com consumo; três timeouts não retornaram consumo. A concordância entre publicadas foi 28/38 (73,7%), contra 35/45 (77,8%) no teste v3 em lotes, e a cobertura caiu de 90% para 76%. Os três fora divergiram da referência. O envio individual não melhorou a qualidade observada nem atingiu a meta de 95%.

O relatório individual versus lotes (arquivo histórico local: `output/comparisons/individual-v3-vs-lotes.md`) inclui comparações pareadas, consumo, erros e limitações. Os pareceres detalhados (arquivo histórico local: `output/experiments/individual-v3-invertido-50/pareceres.md`) incluem respostas rejeitadas e contadores. Para regenerá-los sem inferência:

```bash
node --import tsx src/index.ts compare --left piloto-5x10-v3-invertido-nemotron35 --right individual-v3-invertido-50 --limit 50
python3 scripts/resumir-piloto.py individual-v3-invertido-50 --baseline piloto-5x10-v3-invertido-nemotron35
```

O controle compartilhado de taxa foi integrado após esse teste, para próximas execuções. O piloto permaneceu sequencial, sem HTTP 429 e com máximo de três chamadas por minuto; sua demora não foi causada pelo teto de vinte por minuto. O código original está preservado em `source-snapshot/` no experimento. A mudança de código exige novo nome para futuras inferências. Os 25 testes locais e a verificação de tipos passaram após a integração. A consulta de cota posterior registrou 887 chamadas disponíveis em `quota-final.json`.
