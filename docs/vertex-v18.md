# Acesso pela Agent Platform / Vertex AI — v18

O novo canal usa `aiplatform.googleapis.com`, o SDK oficial `@google/genai` 2.30.0 e Application Default Credentials (ADC). Em termos práticos, a aplicação usa o login local Google Cloud e envia as chamadas ao projeto de cobrança escolhido, em vez de usar a chave do AI Studio.

O projeto Google Cloud é definido na configuração local. Região inicial: `global`.

## O que foi preparado

- `experiments/vertex-v18/connection.ts`: SDK, autenticação OAuth e verificação do destino e do projeto de cota. Recusa chave de API, redirecionamentos, outro projeto e endpoint do AI Studio.
- `experiments/vertex-v18/client.ts`: chamadas aos modelos, custos, registros de canal/projeto/endpoint e interrupção imediata para erros de faturamento, incluindo teto mensal apresentado como HTTP 429.
- `experiments/vertex-v18/cli.ts`: planejamento local, consulta de metadados e executor com checkpoints próprios.
- `config/vertex-v18.json`: projeto, região, modelos, identificação do crédito e preços.
- `scripts/gcloud-desafio.sh`: acesso à CLI instalada em `.tools/google-cloud-sdk`. Usa o Python 3.12 disponibilizado pelo ambiente Codex, pois o Python padrão da máquina é 3.9.

As dependências ficam em `experiments/vertex-v18/package.json` e seu próprio lockfile. O `package-lock.json` principal, `src`, os prompts, o banco e o código v17 não foram modificados. Assim, o fingerprint usado na retomada dos experimentos anteriores é preservado.

O executor reaproveita o motor v17: classificador com consultas escolhidas, contexto automático do juiz, validações por questão, decisão determinística e cinco envios totais por etapa. Não tem retentativas adicionais dentro do SDK, nem execução simultânea de lotes. HTTP 429 transitório gera espera compartilhada entre os dois modelos conforme o identificador do modelo. O ritmo preventivo do original v16 não é reproduzido.

Os novos resultados ficam em `output/vertex-v18/<suite>/<condição>`. O orçamento é compartilhado entre condições da mesma suíte e é registrado em `authorization.json`. A alteração de provedor de acesso exige uma identidade nova: o executor não importa nem zera tentativas dos checkpoints v16/v17. Uma eventual migração de pendências precisa registrar a origem e preservar os contadores; ela ainda não foi implementada.

## Autenticação

Na raiz do projeto:

```sh
bash scripts/gcloud-desafio.sh auth application-default login --project=SEU_PROJECT_ID
bash scripts/gcloud-desafio.sh auth application-default set-quota-project SEU_PROJECT_ID
```

O primeiro comando abre o login oficial no navegador. A escolha da conta e o consentimento são feitos pela pessoa usuária. O login cria credenciais na pasta padrão do gcloud, fora deste repositório. Não copie o arquivo de credenciais para `.env`, prompts ou relatórios.

ADC é o mecanismo de autenticação da aplicação; não é uma vinculação automática do bônus à chamada. O SDK explicita o projeto de recurso e o projeto de cota. A aplicação do crédito depende do faturamento e das regras da promoção.

A API do projeto deve estar habilitada: [Agent Platform API no projeto](https://console.cloud.google.com/apis/library/aiplatform.googleapis.com). O usuário precisa das permissões de inferência e de uso de serviços no projeto. Uma falha de autorização deverá ser tratada conforme a mensagem específica do servidor.

## Verificações sem inferência

Planejamento inteiramente local:

```sh
node --import tsx experiments/vertex-v18/cli.ts --dry-run --condition b20
```

Após o login, consultar os metadados dos modelos, sem `generateContent`:

```sh
node --import tsx experiments/vertex-v18/cli.ts --check
```

O segundo comando precisa de rede e ADC. Seu resultado é salvo em `output/vertex-v18/preflight.json`. Acesso a metadados não comprova autorização de inferência nem aplicação do bônus.

Mantemos `gemini-3.5-flash-lite` e `gemini-3.8-flash`, sem substituição automática. Confirmar acesso no projeto é necessário mesmo que os modelos funcionem na Developer API. A ficha oficial do Flash-Lite registra janela de 1.048.576 e saída de 65.536 tokens; o executor mantém o teto de saída de até 65.536 e conserva os limites por questão do motor anterior.

## Crédito, preços e primeira execução

Antes da inferência, identificar o nome exato do crédito e os serviços/SKUs elegíveis no painel de faturamento. Não presumir que Free Trial, GenAI App Builder ou outra promoção tenham a mesma cobertura.

Os dados específicos do crédito e da conta de faturamento ficam na configuração local e foram omitidos desta documentação. `creditEligibilityVerified` indica compatibilidade documental do programa Free Trial com a Agent Platform, a partir do ID informado e da política oficial; não é uma confirmação financeira desse crédito específico. `creditEvidence` distingue vínculo, saldo e abatimento, todos ainda não verificados. O identificador do crédito não é enviado ao modelo.

A checagem administrativa do vínculo foi bloqueada por HTTP 403: Cloud Billing API desativada. A tentativa de habilitá-la também retornou HTTP 403 porque Service Usage API está desativada. Nenhuma API foi confirmada como habilitada por essa tentativa, e nenhuma conta de faturamento foi alterada. O acesso a metadados dos modelos pela Agent Platform já funcionou com ADC; isso é uma verificação separada. O saldo e a validade podem ser conferidos no painel de créditos da conta Google Cloud. A política geral mantém créditos restantes após upgrade até a data de expiração original, sem reiniciar os 90 dias.

Os preços foram conferidos na tabela oficial em 18/10/2026 (Fortaleza): classificador global Standard PayGo de US$ 0,30 entrada, US$ 0,03 cache e US$ 2,50 saída por milhão de tokens. Para o juiz, o orçamento usa os valores brutos conservadores de US$ 1,50 / US$ 0,15 / US$ 7,50, antes da promoção de 50% devolvida como créditos. O preço líquido anunciado para o juiz até 31/12/2026 é US$ 0,75 / US$ 0,075 / US$ 3,75; esse crédito futuro não é presumido como saldo já recebido.

Cada papel registra `inputUsdPerMillion`, `cachedInputUsdPerMillion`, `outputUsdPerMillion`, `source` (URL oficial) e `verifiedAt` (data ISO). Os três valores são preços em dólares por milhão de tokens, incluindo o valor de saída usado para raciocínio quando aplicável. Esta implementação considera um único preço por modalidade; um modelo com faixas de contexto, cobranças extras ou outras regras exige adaptar o cálculo antes de usá-lo. Os valores são da modalidade Standard: os lotes locais usam chamadas síncronas `generateContent`, e não o produto Batch API com desconto.

O teto local mede custo estimado bruto do modelo, antes de eventual crédito promocional; não consulta saldo ou fatura Google. Reservas de consumo desconhecido permanecem no orçamento.

Exemplo de piloto, após confirmar os requisitos e definir o valor de teto autorizado:

```sh
node --import tsx experiments/vertex-v18/cli.ts --run --suite vertex-v18-piloto --condition b10 --limit 10 --budget-usd VALOR_AUTORIZADO
```

O valor acima é um marcador, não um teto já autorizado. Nenhuma chamada de inferência é feita apenas ao instalar o SDK ou concluir o login. Os testes anteriores continuam preservados e parados.

Para continuar dentro do teto de US$ 30 já autorizado para b30/b20/b10, usar `--shared-budget-suite paid-v17-359 --budget-usd 30`. Isso utiliza o mesmo `spend.json` da suíte anterior, com as mesmas travas transacionais; não concede outros US$ 30. A autorização anterior é revalidada, inclusive a exclusão de b1. As chamadas Vertex são distinguidas pelo `quotaScope`, pelo canal nos logs e pelo manifesto próprio; os resultados v16/v17 não são alterados.

## Validação realizada

Cinco testes específicos do Vertex e nove testes v17 passaram, com transporte simulado e sem cobrança. Verificam endpoint/projeto/OAuth mesmo com chave e URL concorrentes no ambiente, bloqueio de destinos indevidos, preservação de assinaturas de ferramentas, interrupção financeira sem retries ocultos e planejamento com o fingerprint original preservado. A checagem TypeScript passou.

Download da CLI oficial para macOS ARM64: versão 589.0.0; SHA256 do arquivo conferido com a documentação: `71b37ca07ab0f9bc43898e42c913e10f143166230ab31e0bbea3632dbc77b010`.

## Documentação oficial consultada

- [Google Gen AI SDK](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/sdks/overview)
- [Migração do SDK generativo Vertex anterior](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/deprecations/genai-vertexai-sdk)
- [Agent Platform API — serviço aiplatform.googleapis.com](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest)
- [Configuração de ADC](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/gcp-auth)
- [Google Cloud CLI](https://docs.cloud.google.com/sdk/docs/install-sdk)
- [Gemini 3.5 Flash-Lite na Agent Platform](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite?hl=en)
- [Oferta Free Trial e condições](https://docs.cloud.google.com/free/docs/free-cloud-features)
