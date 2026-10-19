# Plano de revisão do README após o experimento atual

**Estado:** executado em 19/10/2026, após a recuperação e a conferência do CSV final. O plano original abaixo foi preservado como registro do escopo.

**Resultado:** README reorganizado em torno de `pro-judge-v20-359-repair-1-final`, com 359 decisões, situação real dos entregáveis, participação humana, modelos, custo/tempo e concordância. O texto anterior foi arquivado em [histórico do README](historico-readme-2026-10-19.md), preservando o retrato de 18/10. Instruções de bloqueio e retomada foram acrescentadas por solicitação da usuária.

**Reprodução:** os [pacotes públicos sanitizados](../reproducao/README.md) resolvem a dependência de `output/` para reproduzir o CSV offline e inicializar uma classificação nova em checkout limpo. Foram acrescentados `npm run delivery:reproduce` e `npm run vertex:init`. O inicializador não sobrescreve resultados históricos; a nova classificação continua exigindo ADC, rede e teto autorizado.

**Conferências concluídas:** 15 testes pertinentes passaram, incluindo exportação offline sem `output/`, inicialização e planejamento em cópia limpa com rede proibida. Passaram a checagem TypeScript da raiz e a do executor v20. O CSV reproduzido tem 359 decisões e o mesmo SHA-256 da raiz. Os links locais dos seis documentos principais foram conferidos. Nenhuma inferência paga, modificação de checkpoint, aumento de orçamento ou publicação externa ocorreu nesta revisão.

**Momento de execução:** após o encerramento do experimento `pro-judge-v20-359-r2` e a conferência dos resultados. O encerramento pode ocorrer com conclusão integral ou com pendências; o README deverá refletir a situação efetivamente encontrada. Este documento não agenda uma execução automática.

## Objetivo

Reorganizar o README para que uma pessoa consiga entender a solução, identificar a condição apresentada como entrega, reproduzir o processamento ou a exportação e localizar as decisões que orientaram o projeto. Atender aos requisitos do item “Código” do desafio: como executar, como gerar `publicacao.csv`, decisões manuais, modelos, custo aproximado e tempo.

A revisão também deverá tornar explícita a participação humana na condução do projeto, distinguindo-a da avaliação individual das questões pelo fluxo automático.

## 1. Consolidar o estado final antes da redação

- Conferir manifesto, configuração efetiva, propostas, pareceres, decisões, pendências e motivo de encerramento da v20-r2.
- Identificar qual execução corresponde ao CSV escolhido para a entrega. A conclusão da v20 não deve substituir automaticamente a v19 como referência do README.
- Registrar o nome da condição e as versões de modelos, prompts e regras efetivamente utilizadas, sem aplicar os padrões atuais retroativamente aos experimentos anteriores.
- Conferir a correspondência entre o CSV apresentado, o experimento de origem e os arquivos de avaliação.
- Preservar o retrato histórico de 18/10. Novas informações devem ser identificadas como atualização posterior.

**Resultado esperado:** uma base única e conferida para atualizar números e instruções, sem misturar a execução final com estados intermediários.

## 2. Corrigir a descrição da participação humana

Substituir a frase “nenhuma decisão humana foi incorporada nesta implementação” por uma explicação que separe classificação automática de decisões de projeto.

Texto proposto, sujeito à confirmação de que não houve avaliação humana individual incorporada às classificações finais:

> Nenhuma avaliação humana individual das questões foi incorporada ao processo automático de classificação. A condução do projeto envolveu decisões sobre arquitetura, seleção de modelos, prompts, regras de publicação e sequência dos experimentos. Essas decisões e suas justificativas estão documentadas em [Decisões por experimento](../relatorio/decisoes-por-experimento.md) e no [Histórico de decisões](../relatorio/historico-de-decisoes.md).

Ao inserir o texto no README da raiz, ajustar os links para `relatorio/decisoes-por-experimento.md` e `relatorio/historico-de-decisoes.md`.

Explicar também que a referência própria foi usada na avaliação posterior, sem preencher classificações nem oferecer respostas esperadas aos agentes. A conferência e a revisão dessa referência devem ser descritas separadamente de uma intervenção manual no CSV.

Se houver classificação alterada manualmente até o fechamento, registrar o ID da questão, o valor anterior e o novo, a justificativa, a autoria e o momento da alteração. Nesse caso, adaptar o parágrafo para não afirmar ausência de avaliação humana no fluxo final.

## 3. Apresentar a entrega antes do histórico

Reescrever a abertura com uma síntese curta:

- Objetivo do desafio e critério de precisão por ramo.
- Condição selecionada para a entrega e situação das 359 questões.
- Quantidades de publicadas, revisões, fora e pendências, se houver.
- Precisão/concordância entre publicadas, cobertura e referência utilizada.
- Modelos, custo estimado e duração da condição apresentada.
- Links para `publicacao.csv`, relatório em Markdown, resultados por experimento e previsão, quando disponível.

Usar “concordância com a referência provisória” para os percentuais internos. Não apresentar a meta de 95% como atingida sem evidência compatível nem confundir conclusão técnica das 359 decisões com qualidade suficiente.

**Resultado esperado:** o leitor identifica de imediato o que está sendo entregue e quais são suas limitações.

## 4. Criar um caminho principal de execução

Reorganizar a seção de início em torno da condição escolhida, retirando da posição principal os exemplos históricos da v10 caso ela não corresponda à entrega.

Documentar, em ordem:

1. Versão necessária do Node.js e demais pré-requisitos reais.
2. Instalação das dependências da raiz e das dependências específicas do executor utilizado.
3. Arquivos de entrada e configuração necessários.
4. Autenticação do provedor correspondente. Se a condição for Vertex, explicar ADC e configuração de projeto com exemplos genéricos, sem solicitar chaves de APIs de outros fornecedores.
5. Preparação inicial dos dados e situações em que deve ser repetida.
6. Planejamento/verificação sem inferência, com a finalidade de cada comando.
7. Execução com orçamento explícito e retomada com preservação das respostas e tentativas.
8. Avaliação e geração do CSV, incluindo os caminhos de saída.

Conferir os comandos com os executores existentes no momento do fechamento. Não presumir que `npm ci` da raiz instala todas as dependências específicas nem que os comandos das versões v19 e v20 são intercambiáveis.

**Resultado esperado:** uma sequência que possa ser seguida em uma instalação nova, com os requisitos externos e financeiros claramente identificados.

## 5. Separar exportação offline de nova classificação

Criar duas instruções distintas:

- **Gerar o CSV a partir de resultados salvos:** listar os arquivos exigidos e o comando de validação/exportação, deixando claro quando não há novas chamadas aos modelos.
- **Executar uma nova classificação:** explicar entradas, configuração, autenticação, orçamento, identidade de experimento e geração posterior dos artefatos.

Resolver a dependência de `output/`, atualmente ignorada pelo Git: selecionar os resultados necessários para reprodução, documentar como obtê-los e indicar sua localização no pacote entregue. Não instruir o leitor a executar um comando que dependa de arquivos indisponíveis.

A seleção dos arquivos deve preservar os originais dos experimentos. Caso sejam necessárias cópias públicas sanitizadas, identificá-las como tais e conferir sua consistência. Chaves, tokens, credenciais de autenticação e identificadores particulares de conta, projeto ou crédito não devem aparecer nos exemplos do README.

**Resultado esperado:** o leitor sabe o que consegue reproduzir offline e o que depende de uma nova execução paga.

## 6. Consolidar modelos, custos, tempo e avaliação

- Informar os nomes completos e identificadores dos modelos por papel, além do canal de acesso e do tamanho de lote.
- Apontar os prompts e as regras de decisão da condição escolhida.
- Explicar a validação da proposta e do parecer do juiz e os critérios de publicar, revisar e fora.
- Informar custo conhecido, eventual consumo sem confirmação e reservas conservadoras, sem tratar orçamento autorizado como gasto realizado.
- Apresentar o custo por questão com decisão concluída, incluindo classificador, juiz e retentativas. Explicitar se o custo também incorpora tentativas de uma execução inicial encerrada.
- Distinguir tempo total transcorrido, soma das durações das chamadas e intervalos entre retomadas. Identificar qual medida é apresentada no resumo.
- Atualizar a referência principal para a versão efetivamente utilizada na entrega; manter a v1 apenas no contexto histórico correspondente.
- Explicar que confiança declarada não é probabilidade calibrada, qual foi o método de autoavaliação e quais limitações decorrem da referência própria e da exposição aos itens de desenvolvimento.
- Informar a situação real de `previsao.txt`. Não apresentar uma previsão redigida após observar os resultados como se tivesse sido registrada antes deles.

**Resultado esperado:** cada número pode ser associado a uma execução, a uma fonte e a um denominador.

## 7. Reduzir e organizar o histórico

- Manter no README apenas um resumo da trajetória experimental.
- Transferir o detalhamento histórico que for removido para um documento próprio ou apontar para os documentos já existentes, preservando conteúdo e referências.
- Vincular a lista de decisões e justificativas, os resultados em tópicos e os relatórios comparativos.
- Substituir expressões ambíguas como “padrão atual”, “novo modo” e “execução atual” por nomes de versão quando o trecho tratar de condições antigas.
- Eliminar repetições e afirmações desatualizadas sobre falta de CSV, referência principal, estado da v20 ou modelos da entrega.

**Resultado esperado:** um README direto, com histórico acessível sem competir com as instruções principais.

## Estrutura proposta para o README

1. Visão geral e estado da entrega.
2. Resultados principais, modelos, custo e tempo.
3. Arquivos entregues e organização do projeto.
4. Participação humana e decisões documentadas.
5. Pré-requisitos e instalação.
6. Como executar a condição apresentada.
7. Como avaliar e gerar `publicacao.csv` a partir dos resultados salvos.
8. Regras de classificação, autoavaliação e limitações.
9. Histórico experimental e referências.

## Verificações antes de considerar a revisão concluída

- As instruções distinguem instalação nova, retomada e exportação offline.
- Os comandos correspondem à condição escolhida e aos arquivos disponíveis no pacote.
- Os modelos, números, custos e duração coincidem com os registros finais e com o CSV apresentado.
- A contagem do CSV foi conferida; eventuais pendências e limitações permanecem explícitas.
- Todos os links locais funcionam nos arquivos que serão entregues.
- A participação humana está descrita sem sugerir ausência de condução do projeto ou revisão humana especializada inexistente.
- Eventuais alterações manuais de classificação estão registradas com motivo e autoria.
- Não há credenciais nem identificadores particulares nos exemplos e textos publicados.
- O histórico continua acessível, sem misturar instruções de versões diferentes.

As verificações de documentação e exportação devem priorizar os dados salvos. Este plano não autoriza novas inferências, aumento de orçamento, alteração de checkpoints ou publicação externa.
