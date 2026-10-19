# Teste Gemini 3.1 Flash-Lite / Gemini 3.8 Flash

Configuração: `config/individual-v11-gemini-flash.json`. Experimento: `gemini-flash-v11-piloto`.

Piloto concluído em 18/10/2026: dez propostas e dez pareceres, sete publicações e três revisões. Concordância entre publicadas: 71,4% exata e 100% por ramo. [Resultados e conferência jurídica](../output/comparisons/gemini-flash-v11/analise.md).

| Papel | Modelo | Esforço | Teto de saída |
| --- | --- | --- | --- |
| Classificador | `gemini-3.1-flash-lite` | high | 16.384 tokens |
| Juiz | `gemini-3.8-flash` | medium | 8.192 tokens |

Ambos usam a API nativa Google e a mesma `GEMINI_API_KEY` do `.env`. Essa condição não depende da OpenAI nem do OpenRouter. A configuração v10 e os resultados anteriores permanecem disponíveis. A seleção desta condição é explícita por `--config`, sem substituir a configuração histórica padrão durante o experimento.

Preservados: prompts v9/v8, base `penal50-v3`, corte jurídico, referência de avaliação v2, classificador escolhendo consultas, recuperação automática do juiz, uma questão por vez, cinco tentativas totais por etapa e motor de decisão conservador. Foram acrescentados os dois identificadores à lista de modelos aceitos; a interface de chamadas é a mesma já implementada.

Acesso aos modelos verificado em 18/10/2026. [Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash).

## Custos

O teto persistente desse experimento é US$ 10. Como a API não informa o preço efetivamente cobrado por requisição, o controle usa uma estimativa pelas tarifas pagas versionadas. A conta pode utilizar a camada gratuita; o valor estimado não comprova cobrança.

Tarifas de referência por milhão de tokens de texto, consultadas em 18/10/2026: Flash-Lite US$ 0,25 de entrada, US$ 1,50 de saída e US$ 0,025 de entrada em cache; Flash US$ 0,75, US$ 3,75 e US$ 0,075, respectivamente. O preço do Flash é promocional até 31/12/2026. Não se aplica aqui cobrança de armazenamento de cache explícito ou busca Google: a recuperação usa SQLite local. [Tabela oficial](https://ai.google.dev/gemini-api/docs/pricing).

## Execução e relatório

```bash
node --import tsx src/index.ts preflight --config config/individual-v11-gemini-flash.json
node --import tsx src/index.ts run --config config/individual-v11-gemini-flash.json --experiment gemini-flash-v11-piloto --limit 1 --budget-usd 10
node --import tsx src/index.ts run --config config/individual-v11-gemini-flash.json --experiment gemini-flash-v11-piloto --limit 10 --budget-usd 10
node --import tsx src/index.ts evaluate --config config/individual-v11-gemini-flash.json --experiment gemini-flash-v11-piloto --limit 10 --reference analise-propria-v2
node --import tsx scripts/relatorio-modelos-pagos-v10.ts --experiment gemini-flash-v11-piloto --report-dir gemini-flash-v11 --limit 10
```

Ampliar o mesmo experimento reaproveita as decisões concluídas e mantém o consumo acumulado. O relatório lê os modelos e preços do manifesto, compara os mesmos IDs à condição gratuita v9 e não reescreve seus registros.

Preservação do código anterior em `output/migrations/gemini-flash-v11/before/`; código usado no teste em `attempt-code/`, com hashes, sem `.env`. Os logs dos 92 testes locais e do TypeScript estão nessa mesma pasta de migração. A conferência jurídica e as limitações da amostra devem acompanhar os resultados, sem tratar concordância por ramo como concordância exata.
