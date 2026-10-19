# Piloto v2: cinco lotes de dez por configuração

## Resultado registrado

Os cinco grupos foram tentados em cada configuração, com retomadas após interrupções. A original tem 49 propostas, 49 pareceres, 48 decisões e duas pendências (Q0020 e Q0044). A invertida tem 39 propostas, 39 pareceres, 39 decisões e onze pendências de validação. A última recuperação planejada dos onze itens invertidos foi recusada na autorização de execução; nenhuma chamada dessa rodada foi enviada.

Concordância entre publicadas: 29/38 (76,3%) na original e 9/11 (81,8%) na invertida. A meta de 95% não foi atingida. Consulte o [relatório consolidado](../output/comparisons/piloto-v2-v3.md) e o [anexo com erros e questões](../output/comparisons/piloto-v2-erros-e-itens.md). Os protocolos e bloqueios anteriores permanecem abaixo como histórico.

## Ampliação autorizada para cinco lotes

Em 16/10/2026, o usuário ampliou o teste para cinco lotes de dez em cada configuração. A consulta de 21:37 UTC confirmou limite diário de 1.000 chamadas, com 951 restantes. Os testes passam a usar Q0001–Q0050, nos experimentos `piloto-5x10-v2-juiz-nemotron35` e `piloto-5x10-v2-invertido-nemotron35`, com orçamento inicial de dez chamadas por execução. Ambos usam a configuração v2 abaixo; o segundo usa `--swap`. Podem executar em paralelo, com arquivos e travas separados. O motor de decisão permanece sem alteração. A comparação principal será com os experimentos v3 de cinco lotes nos mesmos IDs. O protocolo original de um lote fica preservado abaixo como histórico.

```bash
node --import tsx src/index.ts run --config config/piloto-10-v2-juiz-nemotron-3.5.json --experiment piloto-5x10-v2-juiz-nemotron35 --limit 50 --max-calls 10
node --import tsx src/index.ts run --config config/piloto-10-v2-juiz-nemotron-3.5.json --experiment piloto-5x10-v2-invertido-nemotron35 --swap --limit 50 --max-calls 10
```

## Histórico da tentativa de um lote

Estado em 16/10/2026: preparado e validado por execução simulada, sem inferência realizada com v2. A consulta ao OpenRouter informou uma chamada gratuita restante, enquanto os dois fluxos completos precisam de pelo menos quatro. A autorização do ambiente para iniciar a primeira chamada foi recusada; nenhum resultado v2 foi gerado.

Após nova solicitação do usuário, a consulta de 16/10/2026 às 21:03 UTC voltou a informar cota usada 49/50 e uma chamada restante. A nova tentativa de iniciar o classificador também foi recusada na autorização de execução, antes de iniciar o processo. A cota não foi consumida por essa tentativa e continuam inexistentes propostas ou pareceres v2.

## Configuração

Usar `config/piloto-10-v2-juiz-nemotron-3.5.json`. A configuração deriva de `config/piloto-10-juiz-nemotron-3.5.json`, alterando `classifierPrompt` para `classificador.v2.md` e `judgePrompt` para `juiz.v2.md`, além do orçamento operacional de duas chamadas por invocação. O lote permanece em dez, o teto de saída em 32.000 tokens e o timeout em 15 minutos. Mantêm-se as regras de decisão, JSON Schema e raciocínio por modelo: `medium` no Nemotron 3 Super e `enabled: true` no Nemotron 3.5 Super VL.

IDs: Q0001–Q0010 nos dois testes. Os prompts v2 existentes foram reutilizados sem edição. O classificador v2 tem 2.635 caracteres, contra 5.934 em v3; o juiz v2 tem 2.695, contra 7.054. Esses números medem apenas o texto dos prompts, não a taxonomia compartilhada, os tokens reais ou a verbosidade efetiva das respostas.

## Execução após disponibilidade de cota e autorização de rede

```bash
node --import tsx src/index.ts preflight --config config/piloto-10-v2-juiz-nemotron-3.5.json

# Classificador 3 Super, juiz 3.5 Super VL
node --import tsx src/index.ts run --config config/piloto-10-v2-juiz-nemotron-3.5.json --experiment piloto-1x10-v2-juiz-nemotron35 --limit 10 --max-calls 2

# Classificador 3.5 Super VL, juiz 3 Super
node --import tsx src/index.ts run --config config/piloto-10-v2-juiz-nemotron-3.5.json --experiment piloto-1x10-v2-invertido-nemotron35 --swap --limit 10 --max-calls 2
```

São quatro chamadas nominais no total. Rejeições de validação ou respostas truncadas podem exigir mais. Uma retomada usa o mesmo comando e só processa as etapas ausentes; não repetir itens já concluídos para selecionar um resultado favorável. A preparação dos dados não precisa ser repetida.

## Comparação após os testes

```bash
node --import tsx src/index.ts compare --left piloto-1x10-v2-juiz-nemotron35 --right piloto-1x10-v2-invertido-nemotron35 --limit 10
python3 scripts/resumir-piloto.py piloto-1x10-v2-juiz-nemotron35
python3 scripts/resumir-piloto.py piloto-1x10-v2-invertido-nemotron35 --baseline piloto-1x10-v2-juiz-nemotron35

# v2 versus v3, nos mesmos dez IDs e na mesma configuração de modelos
node --import tsx src/index.ts compare --left piloto-5x10-v3-juiz-nemotron35 --right piloto-1x10-v2-juiz-nemotron35 --limit 10
node --import tsx src/index.ts compare --left piloto-5x10-v3-invertido-nemotron35 --right piloto-1x10-v2-invertido-nemotron35 --limit 10
```

No recorte Q0001–Q0010, os registros v3 têm dez propostas, dez pareceres e dez publicações em cada configuração, com concordância de 7/10 (70%) em ambas. O teste v3 original precisou recuperar Q0003 num grupo com outros IDs; por isso, o consumo total dos experimentos de 50 questões não deve ser comparado diretamente ao consumo destes testes de dez.

Comparar concordância antes do filtro, concordância entre publicadas e cobertura, pendências e recuperações, comprimento das respostas, consumo de tokens visíveis e de raciocínio e duração das chamadas. Justificativas menores ou menos tokens não demonstram melhoria de classificação por si só. Os dez IDs já foram usados em ajustes e os resultados serão exploratórios, relativos à referência provisória.
