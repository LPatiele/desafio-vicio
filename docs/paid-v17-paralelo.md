# Experimentos pagos em sequência, sem pausas preventivas — v17

Implementação em `experiments/paid-v17/`, separada de `src/`. O teste v16 em andamento continua com seu código, suas pausas e teto próprio de US$ 10. O dry-run v17 confere que o hash de todo o código original continua igual ao manifesto da v16 antes de permitir novos envios.

Cada condição começa com propostas novas, usa as mesmas 359 questões na mesma ordem, os modelos Gemini 3.5 Flash-Lite / 3.8 Flash, prompts base, rubricas, base v6 com livros, política de publicação e referência v2 para autoavaliação. A referência só é lida ao gerar o relatório, depois da inferência.

| Condição | Questões por chamada | Grupos planejados | Mínimo de chamadas de modelo |
|---|---:|---:|---:|
| b30 | 30 | 12 | 36 |
| b20 | 20 | 18 | 54 |
| b10 | 10 | 36 | 108 |
| b1, adiado | 1 | 359 | 1077 |

O mínimo considera seleção de ferramentas, proposta final e parecer. Uma segunda rodada de consultas, respostas inválidas e falhas aumentam esse total. O último grupo de cada condição pode ser menor. Os lotes não são divididos silenciosamente em função do tamanho; uma requisição excessiva interrompe a condição e registra a causa.

Por instrução posterior do usuário, a execução é **b30 → b20 → b10**, uma condição por vez, em paralelo apenas com o processo original. Depois desses lotes, b1 só inicia quando a v16 tiver todas as 359 decisões e seu processo estiver encerrado. Se a v16 estiver interrompida com pendências, b1 permanece adiado. Uma trava de sequência impede duas condições da mesma suíte em processos distintos. Bloqueio financeiro, diário ou erro inesperado interrompe a sequência e registra quais condições ainda não foram iniciadas. Não há intervalo artificial entre envios, espera preventiva por RPM/TPM ou trava global de inferência nesses novos experimentos. As gravações do orçamento compartilhado usam uma trava curta, liberada antes de qualquer chamada HTTP.

Os números de 1000 RPM e 4 milhões de tokens de entrada por minuto são uma hipótese operacional, não cotas verificadas do projeto. A [Google informa que os limites variam por modelo, projeto e tier](https://ai.google.dev/gemini-api/docs/rate-limits) e devem ser consultados no AI Studio. O modo reativo não assume que a cota diária seja infinita: um bloqueio diário ou financeiro retornado pelo servidor interrompe os novos envios. HTTP 429 transitório gera cooldown compartilhado por modelo, respeitando RetryInfo/Retry-After e mantendo pelo menos 20 segundos, ou 60 sem indicação. Não se repetem chamadas de saldo esgotado. Permanecem cinco envios totais por questão e etapa; o transporte não tem outro ciclo de retentativas.

O classificador conserva a recuperação escolhida por ferramentas. Nos lotes, cada operação deve incluir `questao_id`: só pode alterar o contexto daquela questão. São até duas rodadas no lote e quatro operações, seis documentos e 16000 caracteres por questão. Uma proposta sem consulta válida para seu ID é rejeitada. O juiz mantém a recuperação automática por questão e só pode citar fontes entregues no contexto daquele ID. Assinaturas nativas do Gemini são preservadas no histórico.

Para comportar várias propostas/pareceres, o teto de saída é escalado pelo tamanho do lote, limitado a 65536 tokens e ao limite de saída que a consulta de metadados da Google efetivamente confirmar. Isso e o contrato de roteamento são diferenças operacionais relevantes: a comparação não isola somente as pausas. Conteúdo dos prompts base e todos os parâmetros efetivos ficam no manifesto.

Cada condição possui manifesto, prompts, checkpoint transacional, registros por questão, respostas completas, erros e relatório próprios. Resultados válidos são preservados quando outros IDs falham. O checkpoint principal contém o histórico nativo e as operações; `records.json` é uma visão derivada. A retomada reproduz as consultas SQLite e rejeita contextos ou decisões alterados. Nenhuma falha vira automaticamente publicação ou classificação fora.

Os quatro novos experimentos compartilham **um teto total**, aprovado separadamente do teste atual. O orçamento considera todas as reservas simultâneas e conserva custo desconhecido após timeout/erro sem consumo. Não há orçamento padrão implícito na execução paga. O código está preparado e validado localmente; os novos envios aguardam a definição desse teto pelo usuário.

```bash
# Sem inferência ou consulta externa
node --import tsx experiments/paid-v17/cli.ts --dry-run

# Executar somente depois de definir o teto TOTAL dos novos testes
node --import tsx experiments/paid-v17/cli.ts --suite paid-v17-359 --budget-usd VALOR

# Retomar uma condição da mesma suíte, preservando os contadores e o gasto total
node --import tsx experiments/paid-v17/cli.ts --suite paid-v17-359 --condition b20 --budget-usd VALOR
```

Arquivos em `output/paid-v17/paid-v17-359/b1`, `b10`, `b20` e `b30`; o ledger financeiro é `output/paid-v17/paid-v17-359/spend.json`. Um teto pequeno pode interromper as quatro condições antes das 359 questões. Os relatórios informam denominadores e pendências; compare qualidade nos mesmos IDs concluídos. Durante os lotes, a v16 e uma condição experimental compartilham o servidor: esses tempos não medem desempenho isolado. B1 aguarda a conclusão da v16 e das três condições em lotes, sem inferências simultâneas da mesma sequência.

Validação local: 120 testes da suíte completa passaram antes da inclusão do teste de CLI; os seis testes específicos finais e a verificação TypeScript também passaram. O dry-run confirma 359 IDs nas quatro condições e o hash original preservado. Plano, fonte e logs de preparação estão em `output/paid-v17/preparation/`. Nenhum dos novos envios pagos foi iniciado durante essa preparação.

Atualização de sequência: a ordem, a ausência de sobreposição, a interrupção da fila após bloqueio e o requisito de conclusão efetiva da v16 para b1 foram testados. O dry-run padrão lista b30, b20, b10 e b1 adiado; define concorrência experimental igual a um. A execução paga continua aguardando o teto total dos novos testes.

## Teto aprovado para a execução em lotes

O usuário autorizou **US$ 30 no total para b30, b20 e b10**, nessa ordem. B1 está fora desse orçamento e não será iniciado por esta execução. A autorização está registrada em `output/paid-v17/paid-v17-359/authorization.json`; a CLI rejeita incluir b1 ou exceder US$ 30 nessa suíte. O teste original conserva seu próprio teto e processo. Código e sete testes específicos foram preservados em `source-snapshot/` antes da execução.

```bash
node --import tsx experiments/paid-v17/cli.ts --suite paid-v17-359 --condition batches --budget-usd 30
```

## Correção de compatibilidade do esquema no primeiro b30

A primeira condição recuperou documentos para todos os 30 IDs, mas a chamada final recebeu HTTP 400 `INVALID_ARGUMENT`. Um diagnóstico sintético controlado reproduziu HTTP 400 com `resultados.maxItems = 30` e HTTP 200 com o mesmo contrato sem esse único limite externo. As duas chamadas de diagnóstico foram incluídas no ledger de US$ 30, sem consumir tentativas das questões reais.

A correção retira apenas `maxItems` da lista externa no JSON Schema transmitido à Google nos lotes. O contrato completo permanece no prompt; os limites dos registros internos, a validação Zod, IDs esperados, duplicatas, evidências, fontes e regras de publicação continuam obrigatórios. Retentativas de um único ID de um lote também usam esse formato compatível. A Google documenta que esquemas complexos podem ser rejeitados: [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).

O primeiro b30 e seu manifesto original foram preservados em `archive/b30-initial-400/`. A condição corrigida tem novo manifesto e proveniência explícita em `b30/recovery.json`. Foram recuperadas somente as consultas, mensagens nativas e contadores: não havia proposta ou parecer. As três tentativas iniciais por questão, inclusive o HTTP 400, não foram zeradas. Todo gasto e reserva anterior permanece no ledger compartilhado. O novo código foi preservado em `source-snapshot-wirefix/`. A v16 continua com o código original inalterado.
