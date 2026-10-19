# Limites dos modelos: configuração v14

Mantido **Gemini 3.1 Flash-Lite** como classificador, conforme esclarecimento do usuário. Os limites do classificador foram corrigidos após o esclarecimento do usuário: 15 RPM, 250.000 TPM e 1.000 RPD. O juiz continua sendo Gemini 3.8 Flash.

| Papel | Modelo | RPM | TPM | RPD |
| --- | --- | ---: | ---: | ---: |
| Classificador | gemini-3.1-flash-lite | 15 | 250.000 | 1.000 |
| Juiz | gemini-3.8-flash | 15 | 1.000.000 | 1.500 |

Esses números são limites de configuração fornecidos pelo usuário, não uma leitura atualizada da cota da conta. O projeto do Google precisa efetivamente disponibilizá-los. O último bloqueio recebido no experimento v13 indicava Free Tier com 20 chamadas diárias para o juiz; escrever 1.500 na configuração não altera esse limite no Google.

## Funcionamento técnico e efeito prático

`src/rate-limit.ts` mantém um arquivo de estado com trava e escrita atômica. RPM e TPM usam janela móvel de 60 segundos. A chamada aguarda capacidade sem segurar a trava. A contagem diária passa a ser persistente por modelo e escopo de projeto, compartilhada entre papéis, retentativas, invocações e chaves do mesmo escopo.

Na prática, várias execuções dividem o mesmo contador diário de cada modelo: 1.000 chamadas do classificador e 1.500 do juiz. Cada envio ao modelo, inclusive uma retentativa ou seleção de ferramentas, consome uma chamada; as consultas ao SQLite não consomem chamadas Gemini. Classificador e juiz têm contadores separados porque usam modelos distintos.

Para o Google, o dia é calculado no fuso `America/Los_Angeles`, com reset na meia-noite local e tratamento do horário de verão. Não é uma janela de 24 horas iniciada na primeira chamada. O [Google documenta cotas por projeto e reset no horário do Pacífico](https://ai.google.dev/gemini-api/docs/rate-limits). `quotaScope` é um alias local, não o ID verificado do projeto Google: usar o mesmo alias em todas as configurações do mesmo projeto. O v14 usa `workspace`, também o padrão das configurações antigas no novo código, para compartilhar seu contador.

Ao migrar um contador, o sistema importa os envios conhecidos nos arquivos `spend.json` dos experimentos locais, deduplica IDs de requisição e exclui entradas `not_sent`. Resultados desconhecidos e falhas enviadas continuam contando conservadoramente. A primeira migração também conserva a janela recente; quando não consegue reconstruir seus tokens, espera essa janela expirar antes de autorizar novos tokens. O histórico importado pressupõe o mesmo projeto para o uso local conhecido; outros projetos no mesmo workspace podem tornar a estimativa conservadora. O código não lê credenciais para calcular a cota.

Se o contador atingir o limite do modelo (1.000 para o classificador ou 1.500 para o juiz), o controle interrompe antes do envio e antes de consumir outra tentativa da questão. O pipeline salva o progresso e informa a data de retomada. Não fica esperando horas dentro da chamada. Uma configuração antiga sem `requestsPerDay` explícito respeita o limite já persistido no mesmo escopo; o contador não é apagado ao trocar de cliente.

Se o provedor responder esgotamento diário antes do teto local, o código guarda esse bloqueio para os demais clientes e usa o `retryDelay` informado pela API, ou a próxima meia-noite do Pacífico quando não houver indicação. Um HTTP429 por minuto continua usando espera e retentativa. O bloqueio diário continua sendo uma interrupção, sem multiplicar as cinco tentativas permitidas por etapa.

Se orçamento ou persistência impedir o envio, a reserva diária é devolvida uma única vez. O espaço de RPM/TPM fica reservado conservadoramente até a janela expirar. Se o processo morrer com um envio incerto, a reserva não é zerada automaticamente.

O TPM usa a reserva conservadora já existente: bytes UTF-8 da requisição, margem e teto de saída. Não é uma tokenização exata nem uma estimativa de velocidade. Por isso, a taxa efetiva pode ficar abaixo dos RPM máximos mesmo que a API ainda tenha capacidade. Os esforços de raciocínio e os tetos de saída foram preservados.

## Configuração e consulta

A nova condição está em [individual-v14-limites.json](../config/individual-v14-limites.json). Além dos limites, foram definidos `maxCalls=3590` para comportar o máximo de cinco tentativas em cada uma das duas etapas das 359 questões e `minIntervalMs=0`, deixando os controles por modelo regularem a janela. O campo global `requestsPerMinute=18` continua sendo legado do OpenRouter; as APIs diretas usam os perfis `direct.classifier` e `direct.judge`.

Preservados: modelos 3.1/3.8, prompts, base `desafio359-v6-livros`, corte jurídico, recuperação escolhida pelo classificador, recuperação automática do juiz, motor de decisão e teto financeiro de US$10. A solicitação anterior de US$15 não recebeu autorização; não houve aumento do orçamento.

Para consultar o estado **sem chamar os modelos ou a API Google**:

```sh
node --import tsx src/index.ts limits --config config/individual-v14-limites.json
```

A saída inclui `requests`, `remainingLocal`, `resetAt`, limites por modelo e `providerLimitsVerified=false`. `remainingLocal` é a margem no controle local, não saldo confirmado no Google. Na implantação, foram importados 53 envios conhecidos do classificador e 23 do juiz no dia do Pacífico. A verificação real do projeto deve ser feita no [AI Studio](https://ai.dev/rate-limit); o preflight atual verifica acesso aos modelos, sem consultar saldo de cota.

Para conferir o plano sem inferência:

```sh
node --import tsx src/index.ts run --config config/individual-v14-limites.json --experiment gemini-flash-v14-limites-359 --dry-run
```

Configurações v13 e anteriores, os 10 resultados completos e a proposta pendente da Q0011 foram preservados. A versão do código participa da identidade científica de um experimento: o executável atualizado não deve sobrescrever ou fingir ser o experimento v13. Uma continuação com este código precisa de novo experimento e migração validada dos checkpoints, registrando origem e consumo anterior. Essa migração não foi executada nesta alteração. Não foi feita inferência paga para testar os limites.

## Validação

110 testes passaram; TypeScript sem erros. O dry-run validou 359 IDs, mínimo estimado de 1.077 chamadas e teto de 3.590, sem rede ou inferência. Os dez resultados anteriores e a proposta pendente foram validados com os checkpoints e preservados por hash.

Os testes exercitam os limites RPM/TPM existentes, concorrência entre filas, persistência diária, retomada, importação do consumo conhecido, exclusão de `not_sent`, deduplicação, cancelamento antes do envio, bloqueio diário da API, fuso e dias de 23/25 horas, estado corrompido, mudança indevida de fuso, herança de limite por cliente antigo e consulta sem gastar requisições. Também validam que os modelos, prompts e RAG da configuração nova foram preservados.

Logs e evidências estão em `output/migrations/limites-v14/`. Os arquivos originais de código que mudaram foram preservados em `before/`; sua recomposição produz o mesmo `codeHash` do experimento v13. Manifesto, registros, configuração v13 e snapshot de conhecimento têm hashes de preservação verificados.
