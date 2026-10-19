# Diário inicial de decisões

Data: 16/10/2026, fuso America/Fortaleza.

- Arquitetura aprovada: dois papéis, classificador e juiz; etapas adicionais determinísticas.
- Configuração inicial: Nemotron classifica e Dots julga. Papéis invertidos disponíveis com `--swap`.
- Lotes aprovados: até 30 questões por requisição. Limite adicional de caracteres evita requisições excessivas. Lotes são requisições com vários itens, não apenas agrupamentos de chamadas individuais.
- Sem rótulos de origem ou referência nos prompts. Questões e taxonomia são tratadas como dados, não instruções.
- Referência própria v1 usada para concordância e diagnóstico; contém erros possíveis e exposições prévias declaradas.
- Separação desenvolvimento/avaliação explicada à usuária; opcional até definição explícita. Padrão exploratório, sem alegação de teste reservado.
- Três rubricas ordinais, sem conversão automática para probabilidade. Campos de confiança subjetiva e estimativa sobre referência têm origem declarada.
- Publicação conservadora, com raízes em revisão. Propostas sem tema central válido para revisão ficam pendentes.
- Nenhuma classificação manual ou gabarito foi incorporado à inferência. Nenhuma classificação foi preenchida a partir da referência.
- Não há repetição automática para melhorar uma nota ruim nem promoção automática do tema alternativo do juiz.
- Anexos e referência preservados. Prompts, entradas, modelos e código identificados por hashes nos experimentos.
- Previsão e relatório finais dependem dos resultados dos experimentos. Nenhum percentual foi fabricado.

Registrar aqui os próximos ajustes: questão/IDs utilizados, hipótese, alteração, resultado e se houve consulta à referência. Resultados que orientam ajustes passam a desenvolvimento, mesmo que estivessem antes reservados.

## Primeiro teste de integração

- O teste `piloto-v1` enviou Q0001–Q0030 ao Nemotron, com limite de duas chamadas. A primeira atingiu o tempo máximo de cinco minutos, sem resposta utilizável. O juiz não foi chamado; 30 itens ficaram pendentes. Não há concordância ou custo em tokens conhecido dessa chamada interrompida.
- A configuração posterior aumentou a espera para 15 minutos por requisição, definiu esforço `low` para o Nemotron (parâmetro anunciado pelo endpoint) e pediu justificativas concisas. O lote de 30 foi mantido. As mudanças não resultam de consulta aos rótulos de referência.
- A primeira tentativa permanece preservada; a configuração posterior usa outro nome de experimento para não misturar protocolos.

## Revisão dos prompts v3

- Pedido da usuária: trabalhar nos prompts do classificador e do juiz.
- Criados `classificador.v3.md` e `juiz.v3.md`, preservando v1/v2. A seleção da versão agora é feita por `classifierPrompt` e `judgePrompt` na configuração.
- Mantidos os JSONs existentes, as rubricas e as regras determinísticas. As mudanças esclarecem conhecimento determinante, especificidade, evidência de assunto versus veracidade de alternativa, concorrentes, incertezas materiais e campos de fora.
- Não foram consultados rótulos adicionais da referência nem feitas chamadas a modelos nesta revisão. As melhorias propostas ainda precisam de avaliação empírica.
- Detalhes e hipóteses registrados em `docs/prompts.md`.

## Reutilização da preparação e cenário de produção

- Orientação da usuária: não repetir a preparação a cada teste do recorte fixo; manter o módulo como parte do desenho para novas importações e 50 mil questões semanais no relatório.
- O comportamento atual já separa `prepareData()` de `loadData()`: os testes dos modelos reutilizam `output/prepared.json`, com conferência de hashes dos anexos. Não foi alterada a execução da classificação.
- Repetir a preparação somente quando necessário por mudanças nas entradas, regras de limpeza ou reconstrução do arquivo. A detecção automática da versão do normalizador ainda não foi implementada.
- Registrado em `docs/preparacao-e-producao.md` o desenho incremental proposto e a distinção entre capacidades implementadas e adaptações futuras. Nenhum teste de carga ou chamada de API foi realizado nesta etapa.

## Piloto com 20 questões

- Pedido da usuária: executar um lote de 20 questões. Criada `config/piloto-20.json`, sem alterar o lote padrão de 30. Usados os dados já preparados e os prompts v3, com Nemotron classificador e Dots juiz.
- `piloto-20-v3`: uma chamada ao Nemotron retornou HTTP 200 após 405.825 ms, mas terminou com `finish_reason=length`. Foram informados 44.710 tokens de entrada e 18.000 de saída, dos quais 17.669 de raciocínio; restaram 331 tokens para a resposta visível. Custo informado: zero. O JSON ficou incompleto e foi rejeitado. Não houve proposta válida nem chamada ao juiz.
- O esforço `low` enviado não impediu o esgotamento do orçamento de saída nessa execução. Isso não comprova que tenha sido ignorado, mas demonstra que não foi um limite suficiente para este pedido.
- Adicionado suporte explícito a `reasoning.enabled=false` na configuração e no teste do transporte. A configuração `config/piloto-20-sem-raciocinio.json` solicita esse modo para os dois modelos, mantendo o lote de 20, os prompts e os demais parâmetros. O teste local confirma o envio do parâmetro; o comportamento efetivo será conferido na resposta real.
- A tentativa ajustada usa outro nome, `piloto-20-v3-sem-raciocinio`, e orçamento de duas chamadas. É um teste de integração; a redução de raciocínio não implica qualidade jurídica equivalente ou meta de precisão atingida.

## Resultado do piloto de 20 sem raciocínio

- O classificador retornou as 20 propostas. Dezesseis passaram na validação e receberam pareceres válidos; quatro foram rejeitadas por citações não localizadas nos campos indicados: Q0008, Q0011, Q0014 e Q0018.
- A retomada no mesmo experimento processou apenas essas quatro questões, em mais duas chamadas, sem refazer os 16 resultados concluídos. Todas passaram. Resultado final: 20 propostas, 20 pareceres e 20 decisões, sem pendências.
- Foram quatro chamadas concluídas nessa configuração, com 172.391 tokens de entrada e 11.748 de saída, zero tokens de raciocínio e custo total informado de US$ 0. As durações das quatro requisições somam 214.455 ms; esse total não representa o tempo de parede, que inclui intervalos entre as invocações. Incluindo a tentativa anterior truncada, foram cinco chamadas neste teste de lote de 20.
- As regras indicaram publicar os 20 itens: o juiz sustentou as três rubricas em todos. A comparação exploratória encontrou 13/20 de concordância com a referência provisória (65%): sete exatos, cinco ancestrais e um descendente. Houve sete divergências, que não foram retidas pelo juiz. O objetivo técnico de produzir pareceres foi cumprido; a qualidade observada não sustenta a meta de 95%.
- Os resultados usados nesta comparação passam a integrar o trabalho exploratório/de desenvolvimento. Não são teste reservado nem revisão humana qualificada.
- Artefatos: `output/experiments/piloto-20-v3-sem-raciocinio/records.json`, `evaluation-exploratorio.json`, `resumo.json` e `pareceres.md`. As respostas originais, consumo e tentativas permanecem nos registros do experimento. Nenhuma entrega final de 359 questões foi gerada.

## Comparação com dois lotes de 10 e mais raciocínio

- Pedido da usuária: reduzir os lotes para 10, aumentar o esforço e executar dois lotes para comparação de qualidade.
- Mantidos Q0001–Q0020, os modelos nos mesmos papéis, os prompts v3, a árvore, os dados preparados e as regras de decisão. Lotes planejados: Q0001–Q0010 e Q0011–Q0020.
- O catálogo consultado anunciou os esforços `medium`, `low` e `none` para o Nemotron; `high` não foi anunciado. Configurado `medium`, o maior nível listado. Para o Dots, o catálogo não anunciou seleção de nível: foi configurado `enabled=true`.
- Aumentado o limite total de saída para 32.000 tokens por chamada, compartilhado entre raciocínio e JSON final, para reduzir o risco de truncamento observado anteriormente. Essa alteração é parte do protocolo e deve ser considerada na interpretação da comparação.
- Configuração separada: `config/piloto-10-raciocinio.json`. Experimento: `piloto-2x10-v3-raciocinio`. Quatro chamadas nominais, sem retentativas automáticas. Os resultados e consumo efetivo serão conferidos antes de qualquer conclusão de qualidade.
- A consulta prévia passou a conferir os níveis anunciados pelo modelo e se o raciocínio é obrigatório. Os testes locais passaram (16 casos) antes da execução.
- A comparação é exploratória: estes 20 itens já foram avaliados. Tamanho do lote, raciocínio e teto de saída mudaram juntos; o resultado não isola o efeito de cada alteração.

## Resultado dos dois lotes de 10

- As quatro chamadas iniciais produziram 16 propostas e 16 pareceres válidos. Q0008, Q0014, Q0018 e Q0020 tiveram citações rejeitadas; a retomada usou duas chamadas adicionais apenas para esses IDs, mantendo a configuração e os 16 resultados concluídos.
- Resultado: 20 propostas e 20 pareceres; 19 decisões de publicar e uma pendência de decisão em Q0020. Nesse item, a proposta foi fora; o juiz marcou `tema_central=inadequado` e `fora_sustentado=true`, sem tema alternativo. A regra não conseguiu decidir com esse parecer contraditório e a pendência foi preservada para análise.
- O classificador concordou com a referência provisória em 13/20 (65%), igual ao teste anterior. No primeiro grupo, a concordância foi de 6/10 para 7/10; no segundo, de 7/10 para 6/10. Não houve ganho agregado observado.
- Entre as 19 questões indicadas para publicação, houve 13 concordâncias (68,4%). O teste anterior também teve 13/19 quando restrito exatamente a esses mesmos IDs. A variação de 65% para 68,4% nas médias gerais de publicação decorre da diferença de denominador, não de ganho na comparação pareada. Nenhum item recebeu decisão de revisar.
- Foram seis chamadas, com 250.270 tokens de entrada, 50.355 de saída e 38.337 tokens de raciocínio. Custo informado: US$ 0. A soma dos tempos de requisição foi de 1.149.691 ms (19 min 10 s), contra 214.455 ms (3 min 34 s) na execução anterior concluída: cerca de 5,36 vezes mais. Não é tempo de parede.
- Criado `scripts/resumir-piloto.py` para reproduzir a leitura dos registros e a tabela comparativa, sem chamadas de IA. Artefatos em `output/experiments/piloto-2x10-v3-raciocinio/`: `records.json`, `evaluation-exploratorio.json`, `resumo.json` e `pareceres.md`. A comparação pareada também foi salva em `output/comparisons/`.
- Os resultados são exploratórios e a referência é provisória. Mais raciocínio não comprovou melhora agregada neste recorte. A contradição do juiz em Q0020 e as divergências restantes são pontos de investigação, não rótulos corrigidos manualmente nesta execução.

## Troca do juiz para Nemotron 3.5 Super VL

- A pedido do usuário, `config/default.json` passou a usar `nvidia/nemotron-3.5-super-vl:free` como juiz, com raciocínio explicitamente ativado. O classificador permanece `nvidia/nemotron-3-super-120b-a12b:free` e os prompts permanecem v3.
- Criada `config/piloto-10-juiz-nemotron-3.5.json` a partir de `config/piloto-10-raciocinio.json`, alterando somente o modelo do juiz e a chave correspondente em `reasoningByModel`. Mantém os dois lotes previstos de 10, esforço `medium` do classificador e teto de saída de 32.000 tokens. As configurações e os resultados anteriores foram preservados.
- Consulta real ao OpenRouter em 16/10/2026 confirmou ambos os modelos gratuitos, JSON Schema e controle de raciocínio. O novo juiz anuncia contexto de 1.000.000 tokens e não anuncia `reasoning_effort`, por isso recebe `enabled: true`. Na consulta, a cota restante era 27 de 50 chamadas gratuitas diárias.
- Os 16 testes locais passaram e a verificação de tipos foi concluída. A consulta prévia não fez inferências. Nenhum lote foi executado com o novo juiz nesta alteração; seus resultados de qualidade ainda não foram medidos.

## Protocolo: cinco lotes e inversão dos modelos

- Autorizados dois testes de cinco lotes de 10, ambos nos mesmos IDs Q0001–Q0050. A configuração é `config/piloto-10-juiz-nemotron-3.5.json`, com orçamento inicial de dez chamadas por execução, sem retentativas automáticas. As entradas preparadas são reutilizadas.
- Primeiro: `piloto-5x10-v3-juiz-nemotron35`, com Nemotron 3 Super no classificador e Nemotron 3.5 Super VL no juiz. Segundo: `piloto-5x10-v3-invertido-nemotron35`, com `--swap`. Os prompts v3 continuam associados aos papéis. O raciocínio acompanha os modelos: `medium` no Nemotron 3 Super, `enabled: true` no Nemotron 3.5 Super VL, inclusive após a inversão.
- A consulta prévia confirmou 25 chamadas gratuitas restantes antes do início. O mínimo nominal é vinte chamadas para os dois testes; as cinco restantes permitem recuperação de etapas ausentes, se necessário. Nenhum ajuste de prompt, regra ou limite de saída está previsto entre as execuções.
- A avaliação usará a referência provisória nos mesmos 50 IDs, apresentando concordância antes do filtro, concordância e cobertura das publicadas, decisões e pendências, consumo e duração. A troca de papéis avalia a combinação completa dos modelos; não isola a contribuição individual de cada papel.

### Resultado dos dois testes de cinco lotes

- Ambos concluíram 50 propostas e 50 pareceres. Os manifestos confirmam entradas, prompts, código e configuração idênticos, exceto pela inversão de `classifierModel` e `judgeModel`. A configuração padrão permanece com o juiz 3.5 Super VL; o teste invertido está preservado em experimento próprio.
- Com classificador 3 Super e juiz 3.5 Super VL: 39 publicações, nove revisões, um fora e uma pendência de decisão (Q0020). Concordância do classificador: 35/50 (70%); entre publicadas: 30/39 (76,9%); cobertura: 78%.
- Os cinco lotes iniciais dessa configuração produziram 46 propostas e pareceres. Foram necessárias duas recuperações de duas chamadas cada. Na primeira, o juiz de dois itens consumiu o limite proporcional de 6.400 tokens integralmente em raciocínio e terminou com `length`. Na segunda, foram obtidas as duas propostas e os quatro pareceres que faltavam, sem mudar parâmetros. Total: 14 chamadas.
- Q0020 tem proposta e parecer. O classificador propôs `fora`; o juiz marcou os três critérios como `incerto`, não confirmou `fora` e não indicou tema alternativo. As regras mantiveram a decisão pendente. Não foi feita alteração manual nem nova tentativa sem etapa ausente.
- Com classificador 3.5 Super VL e juiz 3 Super: 45 publicações, cinco revisões, nenhum fora ou pendência. Concordância do classificador: 39/50 (78%); entre publicadas: 35/45 (77,8%); cobertura: 90%. As dez chamadas nominais concluíram sem recuperações.
- Entre os mesmos 37 IDs publicados nas duas configurações, a concordância foi 29/37 e 30/37, respectivamente. O filtro invertido enviou para revisão quatro propostas concordantes e uma divergente, enquanto publicou dez divergentes; não elevou a concordância em relação ao classificador antes do filtro.
- Consumo original/invertido: entrada 584.534/425.546 tokens; saída 134.216/133.877; raciocínio 112.189/113.511. Soma dos tempos de chamadas: 2.000.420/1.994.665 ms (33min20s/33min15s). Todas as 24 chamadas informaram consumo e custo de US$ 0.
- A inversão foi mais estável tecnicamente e teve maior concordância das propostas neste recorte. A concordância entre publicadas permaneceu distante de 95% nas duas configurações; estes resultados exploratórios não demonstram precisão jurídica real.
- Relatório consolidado: `output/comparisons/piloto-5x10-v3-papeis.md`. Há pareceres completos e resumos em ambos os diretórios de experimentos. O gerador `scripts/resumir-piloto.py` passou a mostrar grupos de dez e a identificar as diferenças reais de configuração no texto de comparação, sem alterar o pipeline de inferência.

## Novo teste solicitado com prompts v2

- Preparados dois testes de um lote de dez nos mesmos IDs Q0001–Q0010: `piloto-1x10-v2-juiz-nemotron35` e `piloto-1x10-v2-invertido-nemotron35`. Criada `config/piloto-10-v2-juiz-nemotron-3.5.json`, reutilizando os prompts v2 existentes, sem editar o motor de decisão. Mantidos lote, saída, raciocínio, formato e demais parâmetros científicos da configuração anterior.
- As duas execuções simuladas confirmaram um lote de dez e duas chamadas nominais por teste. A consulta real ao OpenRouter em 16/10/2026 às 20:32 UTC informou cota usada 49/50 e somente uma chamada restante, insuficiente para completar os dois testes.
- A autorização do ambiente para executar a primeira chamada foi recusada. Nenhuma inferência v2 foi realizada e nenhum experimento v2 recebeu resultados. Não houve tentativa de contornar a recusa nem uso de modelo pago.
- Protocolo e comandos de execução, retomada e comparação: `docs/protocolo-piloto-v2.md`. No mesmo recorte de dez IDs, a linha de base v3 tem concordância de 7/10 nos dois arranjos. Ainda não há evidência de qualidade, consumo ou duração para v2.
- Na nova tentativa solicitada pelo usuário, a consulta de 16/10/2026 às 21:03 UTC confirmou novamente uma chamada restante. A autorização de execução da primeira inferência foi recusada antes de iniciar o processo. Nenhuma inferência foi enviada e os testes v2 continuam sem resultados.

## Ampliação do teste v2 após aumento da cota

- O usuário autorizou cinco lotes de dez em cada configuração de modelos. A consulta de 16/10/2026 às 21:37 UTC confirmou 49 chamadas utilizadas, limite de 1.000 e saldo de 951. Mantidos prompts v2 originais, motor de decisão e parâmetros científicos anteriores.
- Experimentos: `piloto-5x10-v2-juiz-nemotron35` e `piloto-5x10-v2-invertido-nemotron35`, ambos em Q0001–Q0050, com dez chamadas nominais cada. Execuções independentes em paralelo, com orçamento próprio e registros separados. Recuperações, se necessárias, serão restritas às etapas ausentes, sem alterar prompts ou parâmetros.
- Serão comparados com os dois testes v3 de cinco lotes nos mesmos 50 IDs, medindo concordância, cobertura, pendências, rejeições, consumo e duração. O teste muda os dois prompts ao mesmo tempo, portanto não isola qual prompt contribui para uma diferença observada.

### Resultados e relatório dos testes v2

- Os cinco grupos de dez foram tentados em cada configuração. Houve três timeouts sem uso retornado (dois na original e um na invertida), retomadas dos grupos interrompidos e recuperações restritas a etapas ausentes. Não houve edição de prompts, validação, `decide` ou checkpoints.
- Original: 49 propostas e 49 pareceres validados, 48 decisões, 38 publicações e dez revisões. Concordância nas publicadas: 29/38 (76,3%). Q0020 permanece sem decisão: juiz confirmou `fora`, mas incerteza do classificador e alerta do juiz acionaram vetos; não há tema para revisão. Q0044 permanece sem proposta e parecer: duas rejeições de citação e resposta isolada truncada no teto proporcional de 3.200 tokens.
- Invertida: 39 propostas, pareceres e decisões; onze publicações, 27 revisões e um fora. Concordância nas publicadas: 9/11 (81,8%). Há onze pendências de citações não localizadas: Q0005, Q0009, Q0011, Q0016, Q0020, Q0021, Q0023, Q0024, Q0028, Q0036 e Q0049.
- A última recuperação planejada dessas onze questões, em grupos de seis e cinco, foi recusada na autorização de execução. Nenhuma chamada dessa rodada foi enviada e não houve nova tentativa de contornar a recusa.
- Tentativas original/invertida: 17/15, das quais 15/14 retornaram uso. Tokens de entrada informados: 612.577/569.335; saída: 151.206/158.957; raciocínio: 124.171/132.680. Custo informado: US$ 0 nas 29 respostas com uso; os três timeouts não retornaram consumo. Não houve economia observada nesses totais, que incluem recuperações e não demonstram efeito isolado dos prompts.
- A primeira proposta estruturada recebida por ID, antes da validação literal, foi comparada nos mesmos 50 IDs: v2 original 37/50 contra v3 35/50; v2 invertida 38/50 contra v3 39/50. Validade na primeira resposta: v2 38/50 e 33/50, contra v3 46/50 e 50/50. Esse diagnóstico não substitui propostas ou decisões validadas.
- O usuário pediu que erros e itens fossem apresentados no relatório. Criados `output/comparisons/piloto-v2-v3.md`, `piloto-v2-erros-e-itens.md` e versão JSON do anexo. O anexo inclui 37 IDs distintos, enunciados e alternativas, histórico por etapa, citações rejeitadas, temas propostos e de referência, pareceres relevantes e eventos de rede/truncamento. Inclui as nove publicações divergentes da original e as duas da invertida. Nenhuma delas prova erro jurídico independentemente da referência provisória.
- O anexo é regenerado por `scripts/relatorio-piloto-v2.py`, sem inferência. A meta de 95% de concordância entre publicadas não foi atingida. Os conjuntos concluídos e publicados diferem; os relatórios preservam denominadores e comparações pareadas disponíveis.

## Envio individual com prompts v3 e tentativas persistentes

- O usuário solicitou envio questão a questão, retomada dos prompts v3 e classificador Nemotron 3.5 Super VL / juiz Nemotron 3 Super. Confirmou cinco tentativas totais por questão e etapa, incluindo a primeira. Criada `config/individual-v3.json` e atualizado o padrão com essa configuração.
- `batchSize=1`, saída de 32.000 tokens por etapa, sem redução para 3.200 tokens. O recorte inicial permanece Q0001–Q0050 para comparar com os testes anteriores: cem chamadas nominais, no máximo quinhentas. A preparação de dados é reutilizada e `decide` permanece intacta.
- O contador de cada etapa é reservado e salvo antes de transmitir a requisição, após conferir orçamento e cota. Retomadas não zeram esse contador. Falhas de rede, HTTP transitório, truncamento, JSON e validação podem ser repetidas. Feedback de validação contém somente erros técnicos e não inclui a referência.
- Propostas e pareceres válidos são preservados, inclusive decisões de revisar, incerto e inadequado. Uma etapa esgotada continua pendente, sem classificação fictícia; as questões seguintes continuam. Auth, cota, orçamento e HTTP permanente interrompem a execução. Retentativas internas do transporte ficam desativadas nesse modo para impedir limites multiplicados.
- Os 19 testes locais passaram e a verificação de tipos passou. Os testes abrangem salvamento antes do envio, teto completo por questão, recuperação de JSON/evidência/IDs/truncamento, revisão válida sem repetição, limite entre retomadas, orçamento sem consumir tentativa, falhas HTTP, autenticação e continuidade para outra questão.
- Por alterar o código e a política de tentativas, o teste usa novo nome: `individual-v3-invertido-50`. A comparação com lotes envolve também a quantidade de contexto por chamada, o teto efetivo por item e as recuperações; não isola apenas tamanho de lote.

### Resultado do envio individual

- `individual-v3-invertido-50` processou Q0001–Q0050, com 50 propostas, 49 pareceres válidos e 49 decisões: 38 publicações, oito revisões e três fora. Foram 113 chamadas e 13 tentativas adicionais. Q0039 ficou pendente após cinco pareceres rejeitados pela mesma contradição; não houve sexto envio nem preenchimento manual.
- Concordância das propostas: 35/50 (70%); entre publicadas: 28/38 (73,7%), cobertura de 76%. A linha de base em lotes tinha 39/50 (78%) nas propostas, 35/45 (77,8%) nas publicadas e cobertura de 90%. Nos 49 IDs concluídos por ambos, as publicadas tiveram 34/44 (77,3%) e 28/38 (73,7%). Nos mesmos 36 IDs publicados por ambos, foram 31/36 e 26/36. O recorte não demonstrou melhora nem a meta de 95%.
- As dez publicações divergentes foram Q0002, Q0005, Q0008, Q0009, Q0030, Q0031, Q0032, Q0036, Q0038 e Q0040. Os fora Q0017, Q0020 e Q0037 também divergiram da referência. Das oito revisões, seis propostas concordavam e duas divergiam.
- Falhas: três timeouts (juiz de Q0022 duas vezes e classificador de Q0046), três respostas interrompidas com `finish_reason=error` (juiz de Q0024, Q0033 e Q0035), três rejeições de evidência (classificador de Q0024, Q0042 e Q0050) e cinco contradições do juiz de Q0039. Todos os outros itens foram recuperados dentro do limite.
- Consumo informado: 4.307.122 tokens de entrada, dos quais 3.572.976 em cache; 313.410 de saída, incluindo 285.149 de raciocínio. Custo informado de US$ 0 nas 110 respostas com consumo; três tentativas sem consumo retornado. Os totais não tratam esses timeouts como consumo zero.
- Relatório: `output/comparisons/individual-v3-vs-lotes.md`. O relatório por questão inclui enunciados e alternativas dos itens problemáticos, propostas, pareceres, decisões, respostas rejeitadas e contadores. O código do teste foi preservado em `source-snapshot/`, com hash conferido contra o manifesto.

## Controle compartilhado de chamadas por minuto

- Solicitação do usuário durante o piloto: evitar bloqueios pelo limite de vinte chamadas por minuto. A análise das 113 tentativas encontrou máximo de três em sessenta segundos e nenhum HTTP 429; as falhas observadas não demonstram bloqueio por esse limite.
- A implementação foi preparada e testada em cópia isolada e integrada depois do encerramento do piloto, preservando seu código. `src/rate-limit.ts` compartilha janela móvel, intervalo mínimo e pausas entre processos desta pasta; `requestsPerMinute=18` deixa margem. Esperar capacidade não consome tentativa. Envios, inclusive retentativas, entram no mesmo controle.
- HTTP 429 respeita `Retry-After`/`X-RateLimit-Reset`; sem indicação utilizável, aplica pausa compartilhada de um minuto. Cota diária é identificada com o teto consultado no preflight e interrompe a execução; não há troca por modelos pagos. O limite externo do serviço não é ampliado pelo controlador.
- Os 25 testes e a verificação de tipos passaram após a integração. Incluem janela compartilhada, capacidade entre retomadas, pausa global, cabeçalhos, distinção entre teto diário e minuto e contagem antes do envio. Não houve saturação real nem paralelismo dentro de um experimento. Alcance e próximos passos em `docs/controle-de-taxa.md`.
- Consulta final ao OpenRouter em 17/10/2026 às 08:11 de Fortaleza: 113 chamadas usadas, limite de 1.000 e saldo de 887. Registro em `quota-final.json` no experimento. Nenhuma inferência adicional foi iniciada após o teste.
