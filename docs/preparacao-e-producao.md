# Preparação reutilizável e novas importações

Decisão de escopo: manter o módulo de preparação como etapa separada. No desafio, os mesmos dados preparados serão reutilizados nos testes. O cenário de novas importações e 50 mil questões por semana será tratado no desenho de produção do relatório, sem alegar que esse volume já foi implementado ou validado.

## Funcionamento no desafio

`prepareData()`, em `src/data.ts`, lê os anexos, valida sua estrutura, limpa os textos e grava `output/prepared.json`. Essa etapa é explícita, por meio de `npm run prepare:data`, e não usa modelos de IA.

Os experimentos carregam o resultado com `loadData()`. A conferência de hashes verifica se os anexos ainda correspondem ao conjunto preparado; não executa novamente a limpeza. Alterar prompts, inverter modelos ou repetir a avaliação não exige preparar novamente os mesmos dados.

Preparar novamente quando:

- os arquivos de entrada forem alterados;
- as regras de limpeza ou normalização forem modificadas;
- o arquivo preparado estiver ausente ou precisar ser reconstruído.

Atualmente, mudanças nos anexos são detectadas automaticamente; mudanças nas regras de limpeza exigem regeneração explícita. Não há detecção automática da versão do normalizador no arquivo preparado. Nenhum desses eventos autoriza misturar resultados de protocolos diferentes no mesmo experimento.

## Proposta para a seção de produção do relatório

Separar a chegada de dados da execução dos classificadores:

```text
Nova importação
  → preservar conteúdo original e origem
  → validar estrutura e identificar itens novos ou alterados
  → preparar os itens necessários e registrar a versão da preparação
  → persistir conteúdo normalizado e avisos
  → encaminhar itens elegíveis à fila de classificação
  → classificar, julgar e aplicar regras de publicação/revisão
```

| Aspecto | Implementado no desafio | Evolução proposta para produção |
|---|---|---|
| Reutilização | Arquivo preparado reutilizado entre experimentos | Dados preparados persistidos por questão e versão |
| Identificação de mudanças | Hash dos arquivos de entrada | Identidade da questão, origem e hash do conteúdo por item |
| Preparação | Executa sobre o conjunto completo quando solicitada | Processa itens novos/alterados; mudanças do normalizador podem exigir nova preparação dos itens afetados |
| Taxonomia | Árvore dos anexos validada e filtrada na entrada dos agentes | Taxonomia versionada; alterações podem exigir reclassificar itens afetados sem limpar novamente seu texto |
| Volume | Leitura em memória e gravação de um JSON | Leitura incremental, persistência por item e filas com controle de capacidade |
| Retomada | Estado salvo por etapa em cada experimento | Tarefas idempotentes, retentativas limitadas e encaminhamento de falhas para tratamento |
| Qualidade dos dados | Avisos estruturais e diagnóstico de limpeza | Acompanhamento por origem, itens com conteúdo insuficiente e verificação de perda de informação |

Não confundir reaproveitar a preparação com reaproveitar uma classificação: o texto pode continuar válido enquanto um novo prompt, modelo, regra de decisão ou versão de taxonomia exige outra inferência. Uma mudança apenas de taxonomia não exige, por si só, repetir a remoção de HTML.

Com 50 mil questões efetivamente precisando de nova classificação, lotes completos de até 30 e uma chamada de cada papel por lote, o mínimo nominal seria `2 × ceil(50.000 / 30) = 3.334` chamadas. Falhas, limites de tamanho e novas rodadas aumentam essa quantidade. Esse cálculo não é teste de capacidade, estimativa de duração ou garantia de disponibilidade dos modelos. O desenho de produção precisará dimensionar cotas, filas e custo a partir dos consumos e tempos observados.

## Limites atuais a explicitar no relatório

A implementação ainda contém regras específicas do case, como a exigência de exatamente 359 questões e o padrão de IDs `Q0001`. Usa arquivos locais e não foi submetida a teste de carga de 50 mil itens. A arquitetura oferece uma separação útil entre preparação e inferência, mas sua evolução para produção é uma proposta, não uma capacidade já comprovada.
