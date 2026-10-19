# Serialização e novo projeto Google — v16

## Retomada em outro projeto às 18h02 de 18/10/2026

O usuário confirmou nova chave, novo projeto Google e adição de créditos. A configuração operacional atual é `config/individual-v16-projeto3.json`, com `quotaScope: google-projeto3`. O código, os modelos, prompts, base, decisões anteriores, tentativas por etapa e orçamento acumulado permanecem os mesmos. O experimento mantém o nome `gemini35-v16-projeto2-359` para continuar seu checkpoint, sem reiniciar as 359 questões. O campo operacional de escopo não altera a identidade científica do experimento; os novos envios registram seu próprio escopo no ledger e na configuração da invocação.

Uma cópia do checkpoint anterior à transição está em `output/migrations/v16-projeto3-20261018T210208Z/`. Nenhuma credencial foi copiada. O bloqueio e os contadores de `google-projeto2` foram preservados; não se aplicam ao novo projeto confirmado.

A primeira chamada real ao juiz no novo projeto foi aceita, concluiu Q0018 e permitiu prosseguir para Q0019. Essa execução continua sequencialmente, com o teto acumulado de US$ 10. Para consultar cotas locais ou retomar após uma interrupção, usar a configuração atual:

```bash
node --import tsx src/index.ts limits --config config/individual-v16-projeto3.json
node --import tsx src/index.ts run --config config/individual-v16-projeto3.json --experiment gemini35-v16-projeto2-359
```

## Histórico da configuração do projeto anterior

A chave foi substituída por uma chave de outro projeto Google Cloud, conforme confirmação do usuário em 18/10/2026. O escopo local `google-projeto2` representa esse novo projeto; não contém identificador nem segredo da chave. As cotas são por projeto, não por chave, segundo a [documentação Google](https://ai.google.dev/gemini-api/docs/rate-limits).

`config/individual-v16-projeto2.json` preserva modelos, prompts, base, limites por modelo e teto financeiro de US$ 10 da v15. Muda somente o escopo dos contadores. Reservas novas registram o escopo no `spend.json`; registros antigos sem esse campo pertencem a `workspace`. A inicialização dos contadores considera apenas o histórico do mesmo projeto. Os arquivos antigos não são zerados nem alterados.

O pipeline já aguardava cada questão, nó e chamada de ferramenta antes de prosseguir. Nos sete envios registrados em `gemini35-v15-livros-359/requests.jsonl`, a concorrência máxima observada foi uma chamada, com todas as respostas encerradas antes do envio seguinte. Não houve evidência de paralelismo naquele experimento.

Foi acrescentada uma trava de inferência por fornecedor e projeto (`src/providers/serial.ts`), mantida durante a admissão no limitador, envio HTTP, leitura da resposta e registro de consumo. Ela impede sobreposição entre papéis e entre processos locais que usam o código atualizado e o mesmo escopo. Também foram serializadas as duas consultas de metadados do preflight. Outros programas e versões antigas do cliente não são controlados por essa trava. Uma trava abandonada exige conferir seu PID antes de removê-la.

Os limites RPM e TPM continuam sendo verificados em janela móvel de 60 segundos, além do espaçamento mínimo de 2,1 segundos para o classificador e 4,1 para o juiz. Processamento sequencial, sozinho, não impede chamadas rápidas demais; o limitador continua necessário.

Para HTTP 429 transitório, o cliente devolve uma espera mínima de 20 segundos. Respeita `Retry-After` e `RetryInfo.retryDelay` maiores; sem indicação do servidor, espera 60 segundos. O prazo também fica persistido no limitador compartilhado. Os loops existentes aguardam esse prazo antes de tentar novamente. Permanecem cinco envios totais por questão e etapa, incluindo ferramentas e erros; não foi criado um segundo ciclo de retentativas dentro do transporte.

`RESOURCE_EXHAUSTED` não identifica sozinho RPM, TPM ou RPD. Na v15, a resposta trouxe `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: 20`, modelo `gemini-3.8-flash` e `retryDelay: 17373s`. Esse erro é diário e interrompe a execução, salvando o bloqueio e o checkpoint. Repeti-lo a cada 20 segundos não libera a cota. O novo projeto terá seus próprios limites reais, que o preflight de metadados não informa.

Como o código mudou, a v15 não deve ser retomada pelo código novo nem ter sua identidade sobrescrita. Para a próxima execução completa, usar novo experimento, preservando os anteriores:

```bash
node --import tsx src/index.ts limits --config config/individual-v16-projeto2.json
node --import tsx src/index.ts run --config config/individual-v16-projeto2.json --experiment gemini35-v16-projeto2-359
```

A nova tentativa começa com propostas novas; não mistura resultados científicos da versão anterior. Os contadores locais não observam consumo de outros programas no mesmo projeto. O limite efetivamente retornado pela API prevalece sobre os valores configurados.

Validação: 115 testes locais passaram, incluindo clientes simultâneos de papéis distintos, liberação da trava após falha, separação dos projetos e pausas de 20/60/70 segundos; a verificação TypeScript também passou. Código e log de testes preservados em `output/migrations/gemini-v16-projeto2/`.

A execução real foi iniciada em 18/10/2026 às 17h09 de Fortaleza (20h09 UTC), selecionando as 359 questões. Concluiu Q0001–Q0007 com propostas, pareceres e decisões; deixou 352 questões pendentes. Foram 28 chamadas, sem HTTP 429 e com concorrência máxima observada de uma inferência. Os checkpoints ficam em `output/experiments/gemini35-v16-projeto2-359/records.json`.

Às 17h13min32s, a segunda chamada do classificador para Q0008 recebeu **HTTP 402**, com `status: RESOURCE_EXHAUSTED` e mensagem `Your prepayment credits are depleted`. O servidor apontou o gerenciamento de projetos/faturamento em `https://ai.studio/projects`. Esse bloqueio é de créditos pré-pagos, não de RPM. O transporte interrompeu a execução sem repetir uma chamada que depende de regularização do saldo. Não há processo do teste em execução; o checkpoint e as tentativas foram preservados.

O custo conhecido estimado pelos preços configurados foi US$ 0,20914352. Incluindo a reserva conservadora da resposta sem consumo informado, o orçamento contabiliza US$ 0,29506842, abaixo do teto local de US$ 10. Isso não equivale ao saldo real da conta Google. O erro e o resumo final estão em `output/audits/gemini-v16/final.json` e `output/experiments/gemini35-v16-projeto2-359/last-run.json`. Para retomar após regularizar o faturamento, usar o mesmo comando e nome do experimento v16, mantendo o código preservado; respostas válidas e contadores não são reiniciados.

A fotografia parcial da auditoria está em `output/audits/gemini-v16/pacing.json`. Ela distingue admissões conservadoras de tokens, horários de início HTTP e consumo de entrada efetivamente informado. As admissões antecedem os registros HTTP por operações de disco: perto da borda de 60 segundos, uma janela calculada pelos registros HTTP pode conter por poucos milissegundos uma reserva conservadora extra. Isso não equivale a excesso observado de tokens de entrada; os horários de processamento no servidor não são observáveis localmente.
