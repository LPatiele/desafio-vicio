# APIs diretas: Gemini e OpenAI

## Configuração e fluxo

`config/individual-v10-gemini-openai.json` habilita:

Essa configuração é o padrão da CLI, com experimento padrão `pagos-v10-gemini-openai` e referência de avaliação v2. As configurações antigas continuam selecionáveis por `--config`, com seus padrões de avaliação anteriores.

| Papel | Fornecedor | Modelo | Raciocínio | Teto de saída |
| --- | --- | --- | --- | --- |
| Classificador | Google Gemini API | `gemini-3.1-pro-preview` | high | 16.384 tokens |
| Juiz | OpenAI Responses API | `gpt-5.2-2025-12-11` | medium | 8.192 tokens |

O snapshot do GPT-5.2 fixa uma versão da família solicitada; o Gemini permanece preview. O valor de esforço tem semântica própria de cada fornecedor. Os tetos de saída incluem o orçamento necessário ao raciocínio conforme a API; não são metas de tamanho da resposta.

Fluxo: questão → Gemini escolhe consultas locais → SQLite devolve trechos → Gemini propõe classificação → aplicação recupera contexto independente → GPT-5.2 julga → validações e decisão. Mantidos os prompts `classificador.v9-local.md` e `juiz.v8-local.md`, a referência v2 para avaliação, a base `penal50-v3` e a política conservadora. A referência de avaliação não entra no contexto dos modelos.

## Credenciais

Preencher no `.env` do diretório do projeto:

```dotenv
GEMINI_API_KEY=
OPENAI_API_KEY=
```

O cliente Google também aceita `GOOGLE_API_KEY` se `GEMINI_API_KEY` estiver ausente. A configuração direta não exige nem utiliza `OPENROUTER_API_KEY`. Essa variável continua atendendo às configurações anteriores. Nenhuma credencial é colocada no corpo da requisição, na URL ou nos manifestos; os logs ocultam os valores das variáveis.

## Implementação

- `src/providers/direct.ts`: seleção por papel, adaptadores nativos Gemini/Responses, verificações de acesso, HTTP sem retentativas internas e normalização de consumo. Reutiliza `ModelCaller`; usa `fetch` do Node, sem novos SDKs ou dependências.
- `src/providers/budget.ts`: reservas monetárias e conciliação pelo consumo retornado. O arquivo `spend.json` pertence ao experimento e depende da trava `run.lock` já existente para serializar acesso.
- `src/rate-limit.ts`: janelas compartilhadas por fornecedor, credencial e modelo, com limites de chamadas e reservas de tokens; pausas de HTTP 429 são persistidas. Os perfis diretos não herdam o teto fixo gratuito de vinte chamadas. Limites configurados precisam respeitar os da conta; o preflight não descobre automaticamente a cota de tokens da conta.
- `src/knowledge/agent-types.ts` e ciclo local: checkpoints v2 preservam partes e assinaturas do Gemini ou itens nativos da OpenAI, incluindo continuidade criptografada. Checkpoints antigos v1 continuam legíveis.

Em linguagem prática, os adaptadores traduzem a mesma tarefa para as duas APIs. O grafo, a busca SQLite, a validação e a decisão continuam pertencendo à aplicação.

## Gastos, falhas e retomada

O perfil contém um teto inicial de US$ 10 por experimento, a ser ajustado ao orçamento escolhido. O piloto real deve usar o teto definido pelo usuário. Preços de referência consultados em 18/10/2026, por milhão de tokens:

- Gemini 3.1 Pro: entrada US$ 2; saída, incluindo raciocínio, US$ 12. Para prompts acima de 200 mil tokens: entrada US$ 4 e saída US$ 18; cache US$ 0,20/0,40. [Preços Google](https://ai.google.dev/gemini-api/docs/pricing).
- GPT-5.2: entrada US$ 1,75; entrada em cache US$ 0,175; saída US$ 14. [Modelo e preços OpenAI](https://developers.openai.com/api/docs/models/gpt-5.2).

Antes de cada envio, a aplicação reserva uma estimativa conservadora pelo tamanho UTF-8 da requisição, uma margem de envelope e o teto de saída. Essa reserva não é previsão de tokens. Após a resposta, o consumo informado substitui a reserva pelo custo estimado aos preços versionados, distinguindo cache e sem somar raciocínio duas vezes. A fatura do serviço é a confirmação final de cobrança.

Timeout, resposta sem consumo ou interrupção mantêm a reserva como desconhecida. Reiniciar não libera essa reserva. Erros explícitos de acesso, parâmetros ou faturamento interrompem a execução; falhas transitórias podem ser repetidas pelo ciclo existente, respeitando cinco envios totais por questão e papel. Uma nova consulta ao SQLite não consome inferência, mas os trechos reenviados aos modelos contam como entrada.

Orçamento e limites de taxa podem ser ajustados na retomada e ficam registrados no evento `invocation`. Modelos, preços, esforço, tetos de saída, prompts, dados, base e código integram a identidade científica e exigem outro experimento se alterados. O manifesto guarda a configuração original; os eventos de cada invocação registram ajustes operacionais posteriores.

## Comandos

Não é necessário preparar novamente os dados para trocar os modelos.

```bash
node --import tsx src/index.ts preflight --config config/individual-v10-gemini-openai.json
node --import tsx src/index.ts run --config config/individual-v10-gemini-openai.json --experiment pagos-v10-gemini-openai --limit 10 --dry-run
```

O preflight faz duas consultas de metadados/autenticação e não envia inferência. A disponibilidade e o faturamento precisam funcionar também na chamada real.

Após definir o orçamento, validar uma questão e ampliar o mesmo experimento para dez, reutilizando o que já concluiu. Exemplo com teto total de US$ 10 nesse experimento:

```bash
node --import tsx src/index.ts run --config config/individual-v10-gemini-openai.json --experiment pagos-v10-gemini-openai --limit 1 --budget-usd 10
node --import tsx src/index.ts run --config config/individual-v10-gemini-openai.json --experiment pagos-v10-gemini-openai --limit 10 --budget-usd 10
node --import tsx src/index.ts evaluate --config config/individual-v10-gemini-openai.json --experiment pagos-v10-gemini-openai --limit 10 --reference analise-propria-v2
node --import tsx scripts/relatorio-modelos-pagos-v10.ts --experiment pagos-v10-gemini-openai --limit 10
```

Para ampliar às cinquenta questões, substituir `--limit 10` por `--limit 50` no mesmo experimento, mantendo ou ajustando explicitamente seu teto em dólares. O script de relatório aceita o mesmo limite e lê a condição gratuita v9 sem sobrescrever seus resultados. Experimentos diferentes têm orçamentos independentes: se houver mais de um, considerar o gasto acumulado da migração ao definir os tetos.

Com os tokens antigos, a simulação de preços indica cerca de US$ 4,23 para os primeiros dez IDs e US$ 19,85 para cinquenta. Os modelos novos podem consumir quantidades diferentes; esses valores não garantem o custo do teste.

## Avaliação e preservação

As primeiras chamadas reais de 18/10/2026 foram recusadas: Google com Free Tier e limites zero, OpenAI com `credit_balance_exhausted`. Nenhuma proposta nova ou parecer foi produzido. O tratamento dos erros foi corrigido para interromper imediatamente esses bloqueios financeiros, mantendo retentativas para limites temporários. [Relatório e instruções de liberação](../output/migrations/direct-api-v1/teste-real.md).

Como essa correção mudou o código depois das tentativas iniciais, o próximo teste deve usar outro nome, como `pagos-v10-gemini-openai-r2`. Os experimentos originais continuam preservados; não reutilizar seus manifestos com o código alterado.

Relatar concordância exata e por ramo entre publicadas, cobertura, revisões, fora, pendências, falhas, tokens e custo. O relatório inclui inventário das citações e dos documentos efetivamente entregues, mas a validação de IDs e hashes não equivale à conferência jurídica da pertinência de uma citação.

Como transporte, modelos, raciocínio e tetos de saída mudam, o resultado compara as condições completas. Ajustes de prompts ou da base devem formar experimentos separados.

O código e as configurações anteriores estão copiados em `output/migrations/direct-api-v1/before`, com `hashes.json`, sem `.env`. Os artefatos históricos, prompts e bases não foram substituídos. A compatibilidade de leitura dos registros v9 é verificada também pelo script do novo relatório.
