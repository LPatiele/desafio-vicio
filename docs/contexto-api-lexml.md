# Contexto LexML pela aplicação

O modo `individual-v5-contexto-api.json` executa:

```text
questão → classificador v3 → validação da proposta
                             ↓
             consultas HTTP à API SRU do LexML
             1. título do tema central proposto
             2. assunto original da questão
                             ↓
             juiz v5 com questão, proposta e contexto
                             ↓
             validação do parecer → decisão conservadora
```

O classificador continua sendo `nvidia/nemotron-3.5-super-vl:free`; o juiz é `nvidia/nemotron-3-super-120b-a12b:free`. São duas chamadas de modelo esperadas por questão, sem tool calling ou MCP nesse modo. Cinco tentativas totais por etapa continuam sendo o limite persistente. As consultas HTTP ao LexML têm orçamento separado e não consomem chamadas OpenRouter.

## Rótulos, hipóteses e avaliação

`loadOriginalLabels`, em `src/retrieval/context.ts`, lê exclusivamente `id`, `disciplina_origem` e `assunto_origem` de `anexos/questoes.jsonl`. Confere o hash do arquivo contra a preparação existente e carrega os rótulos uma vez. Isso não repete a limpeza das questões nem altera `output/prepared.json`.

O classificador recebe os mesmos campos preparados da v3, sem esses rótulos. Depois da proposta válida, a aplicação consulta o título do tema proposto e o assunto original como duas hipóteses. A disciplina acompanha os rótulos no contexto para interpretação pelo juiz; não é um filtro da consulta SRU. Assunto original ausente não é substituído pela referência. Proposta `fora=true` não gera um tema inventado para pesquisar. Consultas equivalentes após normalização de acentos, espaços e caixa são unificadas, com as duas origens registradas.

A referência de análise própria permanece na avaliação offline. O experimento com contexto passa a usar informação adicional do rótulo original; deve ser identificado assim nas comparações. Seu resultado não demonstra classificação sem auxílio de rótulos legados. Como a avaliação não é cega, duas buscas não eliminam viés de confirmação.

## Consulta e conteúdo fornecido

`src/retrieval/lexml-api.ts` faz GET em `https://www.lexml.gov.br/busca/SRU`, com SRU 1.1, `searchRetrieve`, esquema `dc`, primeira página e até cinco registros por consulta. Os termos são escapados em CQL (`cql.serverChoice all`). O endpoint consta do [catálogo oficial do Senado](https://www12.senado.leg.br/dados-abertos/legislativo/legislacao/acervo-do-portal-lexml).

São aceitos somente resultados XML SRU válidos, com total declarado e documentos identificáveis por URN LexML. Diagnósticos SRU, HTML, respostas excessivas e XML inválido são falhas técnicas. HTTP 200 com HTML nunca equivale a busca vazia. Resultado vazio válido é um XML SRU com total zero.

O contexto contém título, resumo/ementa, assuntos, data, URN e link do resolvedor. **São metadados; não texto integral ou prova de vigência.** Nenhum documento ligado é aberto automaticamente. O juiz deve citar os IDs `S-xxxxxxxxxxxx` quando usar uma fonte em suas justificativas existentes. A validação rejeita IDs nesse formato que não estejam no contexto entregue; isso verifica a existência da fonte, não a correção semântica da citação.

Documentos são intercalados entre as consultas e deduplicados por URN. Tamanho de títulos, resumos e assuntos é limitado. O envelope JSON respeita 16 mil caracteres; omissões são indicadas. Consultas, datas de obtenção, status HTTP, hash do corpo e a relação de cada fonte com suas consultas acompanham o conteúdo.

## Falhas, limites e retomada

O padrão permite duas tentativas totais por consulta e quatro requisições HTTP por questão. Rede, timeout e HTTP 408/429/5xx transitórios podem repetir; HTML de verificação, XML inválido e falhas não transitórias não são repetidos. Há controle compartilhado de taxa específico do LexML, independente do OpenRouter, com intervalo mínimo de dois segundos e até 18 envios em uma janela móvel de um minuto. Esse é um limite local conservador, não uma cota oficial declarada pelo LexML.

Os contadores são salvos antes dos envios. Retomadas não renovam esses limites e não refazem consultas já finalizadas. Uma queda após a reserva pode gastar uma tentativa sem completar o envio. Sucessos e buscas vazias têm cache de 24 horas em `output/retrieval-cache/lexml`, contendo XML bruto, hash e resultado normalizado. O cache é conferido contra o XML antes de reutilização; falhas não são cacheadas. O contexto salvo no experimento permanece estável nas retentativas do juiz.

Mesmo sem pesquisa disponível, o juiz pode produzir um parecer a partir da questão e da árvore, recebendo a indicação explícita da falha. A política experimental, em `src/retrieval/decision.ts`, transforma uma eventual publicação em revisão quando alguma consulta planejada falha ou nenhuma pôde ser planejada. `src/validation.ts::decide` permanece inalterada. Revisão e `fora` continuam obedecendo às regras semânticas existentes; erro de API não cria `fora`.

Busca vazia válida conta como sucesso técnico, sem comprovar adequação ou ausência de tema. O sinalizador `requireApiSuccessForPublication` controla apenas o veto técnico adicional. Não substitui as rubricas nem garante a meta de 95%.

## Arquivos para conferir

| Arquivo | Responsabilidade |
| --- | --- |
| `src/retrieval/context.ts` | Rótulos originais, plano de buscas, conteúdo para o juiz, orçamento e checkpoints |
| `src/retrieval/lexml-api.ts` | HTTP, XML SRU, cache e detecção de falhas |
| `src/nodes/contexto.ts` | Etapa entre classificação e julgamento |
| `src/nodes/especialista.ts` | Contexto somente no juiz e validação das citações |
| `src/retrieval/decision.ts` | Veto técnico adicional à publicação |
| `src/agents/juiz.v5-contexto.md` | Instruções para comparar hipóteses e interpretar metadados |
| `config/individual-v5-contexto-api.json` | Configuração optativa; padrão v3 preservado |

`records.json` contém `retrieval`: rótulo original, tema proposto, plano, resultados, contadores, contexto exato entregue e fontes citadas no parecer. Manifesto, prompts e chamadas continuam sendo registrados pelo mecanismo de experimentos. A retomada e a avaliação verificam a mesma política de decisão.

## Comandos

```bash
# Verificar apenas a API, reutilizando uma proposta salva. Zero chamadas de modelo.
npm run context:check
npm run context:check -- --id Q0001 --proposals-from individual-v3-invertido-50

# Conferir orçamento antes da execução.
npm run run -- --config config/individual-v5-contexto-api.json --experiment contexto-api-v5-q0001 --ids Q0001 --max-calls 10 --dry-run

# Fluxo completo de uma questão, com teto de dez chamadas de modelo.
npm run run -- --config config/individual-v5-contexto-api.json --experiment contexto-api-v5-q0001 --ids Q0001 --max-calls 10
```

A verificação independente salva evidências em `output/integration/lexml-direct-api/<data>/`. Ela não elimina a proteção do portal. O relatório dessa implementação registra o resultado efetivamente observado e distingue testes simulados, disponibilidade da fonte e julgamento real.
