# Planejamento: Gemini classificador e OpenAI juiz

Data: 18/10/2026. Escopo: planejamento da migração; implementação e inferências pagas são etapas posteriores. Atualizado com a decisão do usuário: APIs diretas, Gemini 3.1 Pro no classificador e GPT-5.2 no juiz. O orçamento ainda está em aberto.

Implementação e testes locais concluídos após autorização do usuário: 90 testes aprovados e TypeScript sem diagnósticos. O estado da integração, os comandos e as diferenças operacionais estão em [modelos-pagos.md](modelos-pagos.md). Os adaptadores nativos foram implementados em `src/providers/direct.ts` sobre `ModelCaller`; não exigem SDKs adicionais. A configuração direta é o novo padrão da CLI, e as anteriores continuam disponíveis por `--config`. As primeiras chamadas reais reconheceram as chaves, mas foram bloqueadas por cota gratuita zero na Google e saldo de API esgotado na OpenAI; veja o [diagnóstico](../output/migrations/direct-api-v1/teste-real.md).

## 1. Objetivo e preservação

Adicionar uma configuração paga, mantendo a execução gratuita disponível. O fluxo de comparação inicial será o da configuração `config/individual-v9-classifier-tools.json`:

`questão → Gemini consulta a base local e classifica → recuperação automática para o juiz → OpenAI julga → validações e motor de decisão → avaliação contra a referência`

Preservar:

- processamento por questão, até cinco tentativas totais por etapa, contagem persistida antes de cada envio e retomada após interrupção;
- ciclo local de ferramentas, SQLite, limite de duas rodadas e quatro operações, seis documentos e 16 mil caracteres de contexto;
- classificador com recuperação escolhida por ferramentas e juiz com recuperação automática independente;
- prompts `classificador.v9-local.md` e `juiz.v8-local.md`, taxonomia, referência v2, corte jurídico e snapshot `penal50-v3`;
- regras conservadoras de publicação, verificações de evidência, IDs e citações;
- configurações, versões anteriores de prompts, resultados, logs e cópias do código dos experimentos históricos.

Os modelos pagos geram propostas e pareceres novos. Importar propostas do Nemotron impediria atribuir o resultado ao Gemini. Os experimentos antigos continuam legíveis e avaliáveis; uma execução incompleta não troca de modelo ou fornecedor no meio da retomada.

## 2. Canal de acesso e modelos

### Canal

Decisão: conectar diretamente à Google Gemini API e à OpenAI API. A configuração paga não usa OpenRouter e não deve encaminhar chamadas a ele como alternativa automática.

Acrescentar clientes específicos atrás da interface `ModelCaller`, mantendo o `OpenRouterClient` para os experimentos anteriores. Para OpenAI, usar Responses API no novo cliente; para Google, a API nativa Gemini. A integração direta exige credenciais e faturamento próprios de cada serviço. A inicialização da configuração paga deve validar somente as credenciais dos fornecedores selecionados e não exigir `OPENROUTER_API_KEY`.

Em termos práticos, os clientes são tradutores: o pipeline mantém a mesma tarefa e os mesmos resultados esperados; cada cliente traduz as mensagens, ferramentas e respostas para o formato de seu serviço. Não é necessário reescrever o grafo ou reconstruir a base.

### Modelos selecionados pelo usuário

- **Classificador: Gemini 3.1 Pro**, identificador `gemini-3.1-pro-preview`, via Google Gemini API. A documentação apresenta esse modelo como preview e confirma function calling e saída estruturada. Usar a versão padrão, sem substituir pela variante `customtools`. [Documentação oficial](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview).
- **Juiz: GPT-5.2**, identificador `gpt-5.2`, via OpenAI Responses API. O modelo oferece function calling e saída estruturada. Para reprodução dos experimentos, preferir o snapshot documentado `gpt-5.2-2025-12-11`, após verificar acesso pela conta, e registrar o ID efetivamente usado. O juiz automático atual recebe contexto no prompt, mas o modo existente de juiz com ferramentas também deve continuar utilizável. [Documentação oficial](https://developers.openai.com/api/docs/models/gpt-5.2).

Esses modelos substituem os candidatos sugeridos na primeira versão do planejamento. A escolha foi motivada pelo usuário pelo desempenho no OAB Bench; o desempenho nesta tarefa de classificação e julgamento será medido separadamente. A condição de preview do Gemini e as versões efetivamente retornadas devem constar no manifesto. Não escolher automaticamente outro modelo se o solicitado estiver indisponível.

### Credenciais locais

O usuário incluirá os valores diretamente no `.env`, usando:

```dotenv
GEMINI_API_KEY=
OPENAI_API_KEY=
```

O `.env.example` documenta apenas os nomes, sem valores. A leitura das credenciais será responsabilidade de cada cliente; configurações, manifestos e logs não devem conter as chaves. A documentação das variáveis pode ser preparada agora, mas os clientes ainda precisam ser implementados para utilizá-las.

## 3. Alterações no código

| Local | Alteração planejada | Compatibilidade |
| --- | --- | --- |
| `src/types.ts` e `src/config.ts` | Acrescentar uma versão de configuração que permita fornecedor, modelo, parâmetros e limites por papel. Substituir a exigência universal `:free` por política explícita de execução gratuita ou paga. | Interpretar configurações antigas como OpenRouter gratuito, com os padrões atuais. Se usada, a inversão de papéis deve trocar a configuração completa do papel. |
| `src/client.ts` e novos clientes de fornecedor | Separar a interface comum da verificação de modelo/capacidades, política de cobrança e transporte. Implementar `GeminiClient` e `OpenAIClient`, selecionados por papel. Hoje o preflight rejeita qualquer preço diferente de zero e o cliente debita cota gratuita em todas as chamadas. | Preservar essas proteções no modo gratuito; no pago usar contabilização e orçamento próprios, sem dependência da cota ou da chave do OpenRouter. |
| `src/runner.ts` | Selecionar o cliente por papel e registrar fornecedor, modelo, parâmetros, preços e versão de integração no manifesto. | Continuar lendo manifestos antigos; gerar experimentos novos quando a identidade científica mudar. |
| `src/knowledge/agent-judge.ts` e `agent-types.ts` | Adaptar mensagens, chamadas e respostas de ferramentas; preservar os campos opacos exigidos pelo fornecedor durante consultas e retomadas. | Versionar checkpoints se necessário, com leitura da versão anterior. Não substituir o ciclo persistido por execução automática de ferramentas dentro de um SDK. |
| `src/rate-limit.ts` | Remover o teto universal de 20 apenas para os perfis novos; controlar limites por serviço/conta/modelo conforme a política aplicável, incluindo tokens quando necessário. | Manter os padrões gratuitos e separar os arquivos de controle de cotas. Respeitar `Retry-After` e pausas persistidas. |
| `src/logger.ts` e relatórios | Registrar uso e custo por papel, questão, tentativa e experimento, incluindo falhas e estados de consumo desconhecido. | Conservar respostas e métricas brutas, acrescentando uma representação normalizada sem sobrescrever logs históricos. Auditar a ocultação das novas credenciais. |
| `config/`, `.env.example`, documentação e testes | Criar configuração paga própria, documentar parâmetros e adicionar testes de compatibilidade. | Não editar a configuração histórica para apontar aos novos modelos. Nunca inserir chaves em arquivos versionados. |

### Particularidades que exigem validação

O `reasoningByModel` atual tem formato do OpenRouter. Níveis e parâmetros não devem ser copiados literalmente entre serviços: o mesmo nome, como `medium`, não representa necessariamente o mesmo esforço ou consumo. Definir também limites de saída por papel, pois os 32 mil tokens atuais são um teto global amplo para uso pago.

O esquema JSON de proposta e parecer continua sendo o contrato interno. Cada cliente adapta o subconjunto aceito pelo serviço, e a aplicação continua validando conteúdo, evidências, IDs e referências: JSON válido não assegura correção jurídica.

No Gemini, preservar as assinaturas de continuidade das chamadas de ferramentas, inclusive ao salvar e retomar. A normalização atual conserva apenas alguns campos da resposta; precisamos adaptar a persistência para os dados exigidos pela API nativa Gemini. [Function calling e assinaturas](https://ai.google.dev/gemini-api/docs/function-calling).

No acesso direto por SDKs, desativar retentativas automáticas ocultas. Cada envio físico deve passar pelo contador persistente, orçamento e limitador. Falhas de autenticação, faturamento ou parâmetros incompatíveis interrompem a execução; não devem consumir cinco tentativas repetindo uma requisição inviável. Falhas transitórias continuam sujeitas ao limite total de cinco tentativas por etapa.

## 4. Orçamento e consumo

Antes de qualquer piloto pago:

1. Registrar preços e sua data, canal, modelo efetivamente usado e limites de tokens por papel.
2. Estimar consumo a partir dos logs históricos, separando classificador, juiz, consultas, respostas finais e retentativas. Não contar tokens de raciocínio duas vezes quando já incluídos na saída faturável.
3. Definir teto em dólares para o experimento e reservar uma estimativa conservadora antes de cada chamada; interromper novos envios quando não houver saldo no orçamento local.
4. Conciliar com o consumo retornado pelo fornecedor. Resposta perdida ou timeout podem ter sido cobrados: registrar consumo desconhecido e manter a reserva até conciliação, em vez de assumir custo zero.

O controle local reduz o risco de ultrapassar o orçamento; a fatura final depende do serviço e de cobranças não observadas pelo cliente. Usar também os controles de gasto disponíveis na conta contratada. Não confundir cota gratuita do OpenRouter, limites de uso do ChatGPT/Codex e faturamento das APIs.

Com o fluxo atual há normalmente pelo menos três envios por questão: Gemini solicita consulta, Gemini classifica e OpenAI julga. Rodadas adicionais e falhas elevam esse número, respeitando cinco tentativas por papel. Consultar SQLite não gera uma chamada de inferência, mas reenviar o histórico e os trechos recuperados consome tokens.

## 5. Sequência de entrega e validação

1. **Preservar a linha de base:** registrar hashes dos dados, prompts, snapshot, configurações e código; criar a nova configuração paga sem alterar os artefatos anteriores.
2. **Implementar configuração, transporte e cobrança:** executar testes locais com respostas simuladas, sem inferências pagas. Cobrir leitura das configurações antigas, erros, limites, retomada, preservação de mensagens e orçamento.
3. **Validar integração com uma questão:** confirmar consulta real ao SQLite, proposta, parecer, decisão e contagem de consumo. Simular retomada em testes locais para não gastar chamadas apenas verificando persistência.
4. **Executar piloto de dez questões:** comparar os mesmos IDs aos resultados anteriores, registrar qualidade, latência, tokens e custo. O orçamento definido delimita esta etapa.
5. **Ampliar para as mesmas cinquenta questões:** após avaliar o piloto e seu custo, produzir comparação pareada por ID com a referência v2 e com os experimentos v9. As propostas precisam ser novas; a referência não entra no contexto dos modelos.
6. **Revisar qualidade:** analisar concordância exata e por ramo, precisão entre publicadas, cobertura, erros, pendências e correção jurídica das citações; incluir custo por questão concluída e por publicação concordante com a referência.

No primeiro comparativo, manter prompts, RAG e motor de decisão. Ajustes de prompt ou correções conhecidas da base devem formar outra versão experimental. Se uma adaptação de contrato exigir alterar o texto enviado ao modelo, registrar a mudança e sua limitação para atribuir ganhos somente aos modelos.

Critérios de entrega: execução gratuita continua válida; os dois novos papéis completam o pipeline; limite de tentativas e orçamento funcionam; retomada não repete etapas concluídas; logs permitem explicar custos e falhas; relatório distingue resultados concluídos de pendências. Aprovar a integração não equivale a atingir 95% de precisão.

## 6. Decisões fechadas e pendentes

Fechado pelo usuário:

- Canal: APIs diretas Google e OpenAI.
- Classificador: Gemini 3.1 Pro (`gemini-3.1-pro-preview`).
- Juiz: GPT-5.2 (`gpt-5.2`; snapshot recomendado para reprodução acima).
- Credenciais: fornecidas pelo usuário diretamente no `.env`.

Pendente:

1. **Parâmetros:** definir esforço e tetos de tokens específicos para os dois modelos, considerando compatibilidade e custo.
2. **Orçamento:** teto em dólares para integração e piloto; registrar também a previsão antes da ampliação para cinquenta questões.
3. **Meta de qualidade:** explicitar se os 95% se referem à concordância exata ou por ramo entre publicadas. Recomendo exata como métrica principal e ambas no relatório, sem redefinir a meta anterior unilateralmente.

As cinquenta questões já usadas no desenvolvimento permitem comparação controlada, mas não demonstram sozinhas generalização para novas importações. Uma avaliação independente posterior exige questões reservadas e referência revisada.
