# Controle compartilhado de chamadas

Estado: implementado para novas execuções, após o término de `individual-v3-invertido-50`. O código utilizado nesse teste foi preservado em `output/experiments/individual-v3-invertido-50/source-snapshot/`, com hash conferido contra o manifesto. O controle compartilhado não estava ativo nesse piloto.

## Limite externo e objetivo

A cota diária maior não elimina o limite por minuto das variantes gratuitas. Criar outras chaves não amplia os limites da plataforma. A documentação diferencia limites do OpenRouter e limites do provedor: [limites e HTTP 429](https://openrouter.ai/docs/api_reference/limits).

O objetivo do controlador é aguardar capacidade antes do envio e compartilhar pausas entre os experimentos deste projeto. Ele não altera limites externos nem troca automaticamente para modelos pagos. A estratégia mantém os prompts v3, os papéis dos modelos e o motor de decisão.

## Implementação

- `src/rate-limit.ts`: janela móvel persistida e exclusão mútua entre processos.
- `src/client.ts`: aguarda permissão antes de reservar a tentativa e enviar a chamada; registra esperas e respostas HTTP 429.
- `requestsPerMinute=18`: margem abaixo de vinte envios em qualquer janela de sessenta segundos. O intervalo mínimo configurado também é aplicado entre processos; com quatro segundos entre envios, a taxa efetiva fica ainda menor.
- Estado compartilhado em `output/rate-limit/openrouter-free.json`, incluindo classificações, julgamentos e retentativas. Reiniciar um processo não renova a capacidade da janela.
- A trava do arquivo é liberada antes de aguardar capacidade ou pausa do provedor. Se ficar ocupada por trinta segundos, o envio é interrompido; confira o processo proprietário antes de remover uma trava deixada por encerramento abrupto.

Esse compartilhamento abrange execuções na mesma pasta do projeto. Outros programas, outras cópias do projeto e outros computadores podem consumir a mesma cota sem passar por esse controlador. Por isso uma resposta HTTP 429 ainda precisa ser tratada, mesmo com o controle local.

## Espera e tentativas

O controlador respeita `Retry-After` e `X-RateLimit-Reset`, conservando a indicação de maior espera. Aceita segundos, datas HTTP e datas de renovação em formatos usuais. Sem indicação utilizável, um HTTP 429 estabelece pausa de um minuto. A pausa fica disponível para os demais processos deste projeto.

Esperar autorização de envio não consome tentativa. Uma requisição efetivamente iniciada, incluindo uma resposta HTTP 429, conta no limite de cinco tentativas totais por questão e etapa. O contador continua persistido antes do envio. A etapa termina no primeiro resultado válido, inclusive quando ele leva à revisão.

Cota diária, orçamento e autenticação continuam interrompendo a execução com estado salvo. A identificação do limite diário usa o valor confirmado na consulta prévia, evitando classificar qualquer teto maior que vinte como cota diária. Esperas transitórias indicadas pelo serviço podem ser respeitadas automaticamente até o timeout configurado; esperas maiores deixam o trabalho salvo para retomada. Não há mudança automática de modelo ou publicação para compensar falhas técnicas.

## Vazão e paralelismo

O piloto individual permaneceu sequencial. Seu tempo foi dominado pela latência das inferências; o máximo observado nas 113 chamadas foi de três envios em sessenta segundos, sem HTTP 429. O novo controlador protege futuras execuções concorrentes, mas não torna o processamento sequencial mais rápido.

Um próximo passo para aumentar a vazão é processar questões independentes em paralelo, preservando `classificador → juiz → decisão` dentro de cada ID. Isso exige também coordenar o salvamento dos registros por questão para evitar sobreposição de checkpoints. Esse paralelismo dentro de um experimento não faz parte desta alteração.

No cenário teórico de cinquenta mil questões semanais, o modo individual exige pelo menos cem mil chamadas. Com a cota atual de mil chamadas gratuitas por dia e duas etapas por questão, o teto nominal é de quinhentas questões por dia, antes de retentativas. O controlador evita rajadas locais; esse volume semanal exige outra capacidade contratada ou uma mudança de estratégia de processamento.

## Verificação

Os testes locais cobrem janela compartilhada por dois clientes, capacidade preservada após recriação, intervalo mínimo global, pausa compartilhada, estado inválido, interpretação de cabeçalhos, espera antes da contagem de tentativas e distinção entre HTTP 429 transitório e diário. Os 25 testes passaram após a integração no projeto, assim como a verificação de tipos. Nenhuma inferência foi usada nesses testes locais; não houve teste real de saturação do limite por minuto.
