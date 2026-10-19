# Pacotes públicos de reprodução

Estes arquivos acompanham o código, ao contrário de `output/`, que é ignorado pelo Git. Foram produzidos em 19/10/2026 por `scripts/build-reproduction-bundles.ts`, lendo os resultados já salvos. Não houve inferência durante o empacotamento.

| Arquivo | Conteúdo e finalidade |
| --- | --- |
| `v20-entrega.json.gz` | Snapshot sanitizado da entrega final: dados preparados, 359 propostas/pareceres/decisões, configuração de decisão, referência v2, prompts, política e CSV esperado. |
| `vertex-baseline.json.gz` | Template público para inicialização da v20, com configurações e prompts preservados e projeções estatísticas do processamento v19 para o estimador de custo. Não é o manifesto privado ou um conjunto integral de logs nativos da v19. |
| `manifesto.json` | SHA-256 dos dois arquivos e do CSV conferido. |
| `prompts/` | Cópia legível dos prompts-base, iguais aos textos incluídos nos pacotes. |
| `publicacao-v19.csv` | Entrega anterior preservada, anterior à recuperação v20. |

Cada arquivo `.json.gz` é um JSON comprimido com gzip e contém `files`, `hashes`, `metadata`, `kind` e `version`. Os hashes internos verificam cada conteúdo. Não são assinaturas digitais ou uma nova validação jurídica da referência.

## Reproduzir a entrega sem API

Na raiz do projeto, após `npm ci`:

```sh
npm run delivery:reproduce
```

O pacote é lido diretamente; não precisa ser extraído em `output/`. O programa verifica integridade, os 359 IDs, schemas, evidências, temas ativos, pareceres, decisões e a política explícita `judge-confirms-outside-v1`. Recalcula avaliação/divergências e exige que o CSV reproduzido seja byte a byte igual ao arquivo conferido. Não há importação de credenciais ou chamada a modelos.

A saída padrão é `output/reproduction/v20-entrega/`. O CSV da raiz não é sobrescrito. `--out OUTRO_DIRETORIO` escolhe outro destino. A referência do pacote só é usada nesta avaliação offline.

## Inicializar outro projeto Google Cloud

Em um checkout novo e com os anexos originais:

```sh
npm run vertex:init -- --project SEU_PROJECT_ID
```

O inicializador confere os hashes dos anexos e instala um template local em `output/no-rag-v19/model-only-v19-359/`, caminho de baseline esperado pelo executor congelado da v20. Ele configura o projeto e o escopo de cota informados, não instala credenciais, não cria autorização financeira e não faz requisições. Se o diretório já existir, interrompe sem substituir arquivos.

As projeções `records.json`, `requests.jsonl` e `events.jsonl` desse template são insumos do estimador offline. As requisições incluem somente papel e corpo; os eventos incluem somente papel e uso de tokens. Endpoints, projeto, conta, identificadores de requisição e crédito particulares foram removidos. Esses arquivos não devem ser usados como se fossem os logs nativos completos de uma execução reproduzida. As propostas antigas não são transferidas para o novo checkpoint da v20.

O [README principal](../README.md) separa instalação, ADC, preflight, nova execução paga e recuperação de bloqueios. Os prompts e modelos são os da condição v20 original; o ajuste retrospectivo de política da entrega continua explícito na finalização offline, sem ativação automática no executor congelado.

## Escopo da sanitização

Foram excluídos credenciais, identificadores particulares de projeto/conta/crédito, caminhos locais absolutos e logs de autenticação. O projeto no template é apenas um marcador. Configuração de cota e caminhos do snapshot público foram sanitizados; a configuração de decisão e as estruturas de classificação foram preservadas. Os originais privados não foram editados.

A reprodução verifica os dados empacotados e a igualdade do CSV. A auditoria nativa completa e a cadeia dos experimentos continuam no acervo local original; não se afirma que elas foram refeitas a partir desses pacotes reduzidos.
