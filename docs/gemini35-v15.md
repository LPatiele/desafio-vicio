# Reinício integral: Gemini 3.5 Flash-Lite / Gemini 3.8 Flash

**Execução interrompida pela cota diária do provedor:** 1/359 questões concluída; Q0002 com proposta pronta e parecer pendente. A API retornou Free Tier, limite de 20 RPD para o juiz, apesar do teto local de 1.500. [Relatório e verificação dos intervalos](../output/comparisons/gemini35-v15-livros-359/analise.md).

Configuração: `config/individual-v15-gemini35.json`. Experimento novo: `gemini35-v15-livros-359`, selecionando os 359 IDs desde Q0001 e sem importar propostas, pareceres ou decisões anteriores. O teste v13 e a configuração v14 permanecem preservados.

| Papel | Modelo | RPM | Intervalo mínimo | TPM | RPD |
| --- | --- | ---: | ---: | ---: | ---: |
| Classificador | gemini-3.5-flash-lite | 30 | 2,1 s | 1.000.000 | 1.500 |
| Juiz | gemini-3.8-flash | 15 | 4,1 s | 1.000.000 | 1.500 |

O espaçamento evita rajadas; a janela móvel de 60 segundos continua impondo o teto de RPM. Contagem, reserva de tokens e bloqueios são compartilhados por modelo e escopo de projeto entre execuções, papéis e retentativas. Os números de chamadas diárias conhecidos não foram zerados ao reiniciar o experimento. A consulta ao SQLite não consome chamadas Google; uma chamada do modelo para escolher uma ferramenta consome.

Em linguagem prática, há duas filas lógicas com ritmos diferentes. Cada chamada passa pelo ritmo e pela janela de seu modelo, inclusive as tentativas após falhas. A execução continua sequencial por questão. Não se somam os dois limites em uma única fila de 45 RPM nem se cria um novo saldo por lote.

A reserva de TPM permanece conservadora, baseada em bytes da requisição, margem e teto de saída. Pode limitar o ritmo abaixo dos máximos declarados. HTTP429 por minuto respeita a pausa indicada pelo provedor. Cota diária esgotada salva e interrompe, mantendo as cinco tentativas totais por etapa e sem enviar chamadas adicionais durante o bloqueio. Controles locais não aumentam os limites efetivos do projeto Google.

Mantidos: prompts classificador v11/juiz v10, base `desafio359-v6-livros`, corte jurídico de 16/10/2026, raciocínio alto no classificador e médio no juiz, seus tetos de saída, recuperação escolhida pelo classificador, recuperação automática do juiz e motor de decisão conservador. A referência v2 só entra na avaliação, nunca nos prompts ou na recuperação.

O código `gemini-3.5-flash-lite` e seu suporte a ferramentas, saídas estruturadas e raciocínio foram conferidos na [documentação oficial](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite). O preflight da chave confirmou os dois modelos em 18/10/2026; isso verifica acesso, não saldo de cota.

A [tabela oficial de preços](https://ai.google.dev/gemini-api/docs/pricing) foi consultada em 18/10/2026: 3.5 Flash-Lite Standard, US$0,30/milhão de entrada, US$2,50/milhão de saída incluindo raciocínio e US$0,03/milhão de entrada em cache. Não se usa Batch/Flex, cache explícito ou Google Search. O preço de referência do juiz foi mantido. Valores de custo são estimativas dos tokens informados; não comprovam cobrança efetiva na conta.

O teto financeiro existente de **US$10** foi preservado, sem autorização para aumento. O limite operacional é 3.590 chamadas para comportar até cinco envios por questão e etapa; o mínimo previsto é 1.077 chamadas. Um novo experimento não implica que o Google renove cotas. O controle interrompe quando atingir qualquer teto, conservando o progresso.

## Reprodução

```sh
node --import tsx src/index.ts limits --config config/individual-v15-gemini35.json
node --import tsx src/index.ts preflight --config config/individual-v15-gemini35.json
node --import tsx src/index.ts run --config config/individual-v15-gemini35.json --experiment gemini35-v15-livros-359
node --import tsx scripts/relatorio-integral-v13.ts gemini35-v15-livros-359
```

A execução usa `.env` local. O código-fonte e a configuração usados foram copiados para `output/migrations/gemini35-v15/run-code/`, sem credenciais. Hashes de preservação, logs de 112 testes e TypeScript estão no diretório da migração. O teste novo também cobre o espaçamento e a janela móvel dos ritmos 30/15 RPM. O plano congelado operacional está em `output/experiments/gemini35-v15-livros-359/run-plan.json`.

[Relatório de resultados](../output/comparisons/gemini35-v15-livros-359/analise.md), produzido com os checkpoints e a referência v2. Resultados parciais devem ser identificados como tais; concordância exata e por ramo não são intercambiáveis. Comparações com condições antigas de modelos, base ou prompts diferentes não demonstram causalmente o efeito do RAG.
