# Execução v19 — somente modelos

A v19 retira a recuperação de conhecimento do classificador e do juiz. A entrada contém somente o texto preparado da questão, a taxonomia ativa e, para o juiz, a proposta do classificador. Não são abertos banco de referências, ferramentas de consulta, API jurídica, livros ou rótulos originais. A referência própria v2 continua sendo usada somente na avaliação posterior, fora das entradas dos modelos.

Modelos e raciocínio mantidos: Gemini 3.5 Flash-Lite/high como classificador e Gemini 3.8 Flash/medium como juiz, via Vertex AI/ADC no projeto já configurado. São 36 lotes de até dez questões para os 359 IDs, sequenciais, sem pausa preventiva. Cada etapa tem até cinco envios totais por questão; retentativas de transporte ocultas permanecem desabilitadas. Há previsão mínima de 72 chamadas, além de consultas de metadados e eventuais correções.

Os prompts são cópias versionadas dos prompts v3 sem instruções de RAG. Foram preservados os contratos de proposta e parecer, as três rubricas, a verificação literal de evidências e o motor conservador de decisão. Quando um trecho é atribuído ao campo errado, o feedback mostra em quais campos da própria questão a cópia literal foi encontrada; a saída não é corrigida automaticamente.

As retentativas enviam somente os IDs pendentes e seus erros anteriores em um contexto novo, contendo novamente as questões e propostas pertinentes. Itens válidos são preservados. Isso evita carregar a antiga conversação de ferramentas e permite corrigir formato e evidências sem novas pesquisas.

Não é criada decisão fictícia para atingir cobertura de 100%. Falhas técnicas após cinco tentativas continuam identificadas como pendências, e um parecer sem coerência suficiente para gerar decisão recebe feedback para correção. Uma execução sem RAG remove o bloqueio de consultas, mas ainda depende da disponibilidade da API e da validade das respostas.

O teto continua sendo os US$ 30 já autorizados, com o mesmo livro de gastos `output/paid-v17/paid-v17-359/spend.json`. A execução v19 começa com o saldo restante, considerando gastos e reservas dos experimentos anteriores. Estimativas são brutas e não confirmam abatimento pelo crédito Free Trial.

## Arquivos

- Configuração: `config/no-rag-v19.json`.
- Motor e executor: `experiments/no-rag-v19/engine.ts` e `cli.ts`.
- Prompts próprios: `experiments/no-rag-v19/prompts/`.
- Saídas: `output/no-rag-v19/model-only-v19-359/`.
- Estado incremental: `status.json`, `records.json`, `checkpoint.json`.
- Relatório final: `report.json`, `last-run.json`.
- Auditoria: `manifest.json`, `prompts.json`, `requests.jsonl`, `events.jsonl` e snapshot do código v19.

O novo motor e os prompts estão fora de `src` e dos diretórios dos executores v17/v18. Os experimentos anteriores, seus arquivos e seus fingerprints permanecem preservados. A v19 tem uma identidade independente e não reaproveita propostas ou pareceres das execuções com RAG.

## Comandos

Planejar sem chamadas de inferência:

```sh
node --import tsx experiments/no-rag-v19/cli.ts --dry-run
```

Executar ou retomar o checkpoint desta condição:

```sh
node --import tsx experiments/no-rag-v19/cli.ts --run
```

Retomar o mesmo comando preserva tentativas já consumidas; alterar código, configuração, prompts ou entradas exige nova suíte, indicada por `--suite`.

## Verificação

Cinco testes do novo motor e cinco do transporte Vertex passaram. Eles verificam ausência de ferramentas/contexto na entrada e no corpo nativo, rejeição de checkpoints com contexto antigo, recuperação de evidência por feedback, publicação versus revisão, preservação de resultados na retomada e esgotamento das cinco tentativas sem decisão inventada. A checagem TypeScript dedicada inclui os executores e suas dependências.

Na comparação com v18, considerar que além de retirar o RAG foram removidas as instruções de recuperação dos prompts e substituído o ciclo de ferramentas por retentativas diretas com contexto novo. Os resultados não devem ser atribuídos isoladamente a uma única dessas mudanças.
