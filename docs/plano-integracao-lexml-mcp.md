# Plano de integração do LexML MCP

Data: 17/10/2026. Estado: planejamento; nenhuma dependência instalada, servidor iniciado ou inferência executada para esta integração.

Atualização de execução: o estado acima descreve a elaboração original. A implementação, a substituição pelo MCP `ehrodan/lexmcp` indicado pelo usuário, os testes e o bloqueio atual do portal estão documentados em [integração MCP](integracao-lexml-mcp.md).

## Objetivo e hipótese

Avaliar se consultar fontes jurídicas ajuda o juiz a identificar classificações inadequadas e aumenta a precisão das publicadas em relação à referência congelada. A hipótese precisa ser medida: encontrar uma norma relacionada não demonstra que o tema escolhido é o conhecimento determinante da questão.

Manter inicialmente o classificador Nemotron 3.5 Super VL, o juiz Nemotron 3 Super e o motor determinístico de decisão. Introduzir pesquisa somente dentro da etapa do juiz, sem criar um terceiro agente. Continuar restrito à taxonomia do desafio; ausência de resultado de busca não significa questão fora dos temas.

## O que foi verificado

As páginas dos dois modelos no OpenRouter anunciam suporte a `tools` e `tool_choice`: [3.5 Super VL gratuito](https://openrouter.ai/nvidia/nemotron-3.5-super-vl%3Afree/) e [3 Super gratuito](https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b%3Afree). Falta testar o ciclo real com o provedor gratuito disponível, raciocínio habilitado e JSON final.

A página indicada no LobeHub respondeu HTTP 403 nesta consulta. A documentação foi consultada no [repositório original prof-ramos/LeXML-mcp](https://github.com/prof-ramos/LeXML-mcp). Ele documenta servidor Python via **stdio** e três ferramentas:

| Ferramenta | Recurso documentado |
| --- | --- |
| `lexml_search` | Busca SRU/CQL e registros Dublin Core. |
| `lexml_resolve_urn` | Resolução de identificador jurídico para URL pública. |
| `lexml_explain` | Metadados e capacidades do serviço; não é explicação jurídica. |

O servidor documenta proveniência, cache em memória e erros estruturados. Pode detectar páginas de verificação HTML mesmo com HTTP 200. Isso deve ser registrado como indisponibilidade, nunca como busca vazia válida. O [roadmap](https://github.com/prof-ramos/LeXML-mcp/blob/main/ROADMAP.md) apresenta HTTP e cache persistente como evolução.

Busca de registros e resolução de URL não garantem texto integral, redação vigente ou aplicabilidade temporal. A primeira etapa verificará se os metadados retornados são úteis. Uma futura obtenção de texto oficial exigirá recurso adicional explicitamente implementado e validado.

O código-fonte Python e suas dependências ainda precisam de auditoria antes da execução. `uv` não foi encontrado no PATH local.

## Fluxo proposto

```text
questão → classificador v3 → proposta salva
                                  ↓
                         juiz com ferramentas
                                  ↓
                      pedido de consulta do modelo
                                  ↓
                aplicação Node → cliente MCP → LexML
                                  ↓
                   resultado limitado e registrado
                                  ↓
                   juiz → parecer JSON validado
                                  ↓
                        motor de decisão atual
```

O modelo solicita a ferramenta; a aplicação executa a consulta e devolve o resultado. O MCP não se conecta sozinho ao modelo. O protocolo de mensagens segue a [documentação de tool calling do OpenRouter](https://openrouter.ai/docs/guides/features/tool-calling).

## Mudanças previstas no projeto

| Arquivo ou módulo | Trabalho |
| --- | --- |
| Novo `src/mcp/lexml-client.ts` | Inicializar processo, negociar protocolo, listar ferramentas, executar chamadas, aplicar timeout e encerrar sessão. |
| Novo `src/mcp/tool-registry.ts` | Converter schemas anunciados pelo MCP para ferramentas do modelo; permitir somente nomes e argumentos validados. |
| Novo `src/research/evidence.ts` | Normalizar fontes, identificar resultados, limitar conteúdo, guardar snapshots e distinguir sucesso, vazio, erro e desafio HTML. |
| `src/client.ts` | Aceitar mensagens `assistant`/`tool`, respostas `tool_calls` e resposta final; verificar suporte no preflight quando a pesquisa estiver habilitada. |
| `src/nodes/especialista.ts` | Coordenar o ciclo limitado de pesquisa do juiz e persistir progresso entre requisições. |
| `src/types.ts` e `src/state.ts` | Acrescentar configuração e estado da pesquisa, fontes, histórico e contadores; manter contratos de proposta e parecer. |
| Novo `src/agents/juiz.v4-lexml.md` | Orientar consulta, uso crítico da fonte, concorrentes e limites da evidência externa. Preservar v3 para comparação. |
| `src/runner.ts` e `src/logger.ts` | Registrar revisão do servidor, schemas, fontes, chamadas, consumo e retomada reproduzível em novo experimento. |
| Nova configuração isolada | Habilitar o recurso por papel, com limites próprios; não substituir a configuração padrão antes da avaliação. |

Hoje `src/client.ts` aceita apenas `system`/`user` e retorna texto. Um `finish_reason=tool_calls` seria tratado como resposta interrompida e gastaria tentativa. A adaptação precisa ocorrer antes de executar os novos prompts.

O transporte deverá conservar a mensagem de solicitação, IDs de ferramentas e metadados opacos necessários à continuação do raciocínio, sem os reescrever. Ver [preservação de raciocínio](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens). Aplicar o schema do parecer na fase final; verificar em teste a compatibilidade com seleção de ferramentas. Não habilitar parâmetros de paralelismo que o provedor não anuncie.

Usar o [SDK TypeScript oficial](https://github.com/modelcontextprotocol/typescript-sdk), com versão fixada e compatibilidade negociada no teste. A documentação consultada apresenta a linha v2 e o pacote cliente `@modelcontextprotocol/client`; confirmar versões disponíveis antes da instalação.

## Limites recomendados

- Pesquisa inicialmente apenas no juiz; uma busca obrigatória por questão no piloto. Não depender da autopercepção de incerteza, pois aprovações erradas também podem parecer confiantes ao juiz.
- Até **duas chamadas lógicas de ferramenta por questão**, por exemplo busca e resolução. `lexml_explain` fica na verificação inicial da sessão, fora desse orçamento por questão.
- Até cinco registros por busca e limite explícito de caracteres por resultado e por questão; valores finais definidos após observar o retorno real.
- Timeout inicial de 15 segundos por envio ao MCP. No máximo dois envios por operação lógica em erro transitório, portanto até quatro envios MCP por questão. Não repetir automaticamente desafios HTML nem argumentos inválidos.
- Para preservar o teto escolhido pelo usuário, recomendar **até cinco requisições efetivas ao modelo por questão e etapa**, somando seleção de ferramenta, continuação e falhas. Uma seleção bem-sucedida é uma etapa normal, não uma falha; terá evento próprio no log. Não conceder cinco novas tentativas a cada continuação.
- Reservar a última requisição disponível para resposta final, com ferramentas desativadas. Se não houver parecer válido ao esgotar o orçamento, manter pendência; não inventar uma decisão.
- Toda requisição OpenRouter atravessa o controlador compartilhado existente: janela de 18/minuto e intervalo mínimo de quatro segundos. Consultas MCP não consomem a cota OpenRouter, mas as inferências que usam seus resultados consomem.
- Persistir histórico, resultados e contadores antes de continuar; uma retomada não renova limites nem repete consultas já concluídas. Cache persistente da aplicação, separado do cache em memória do servidor, permite reutilizar snapshots no experimento.

Esses limites são propostas deste plano, ainda não aplicadas. A espera do controlador não conta como tentativa.

## Evidências e decisão

Manter separados os trechos literais da questão e as fontes externas. A validação atual de citações do enunciado não deve receber textos de documentos externos como se estivessem na questão.

Cada consulta deve guardar argumentos, ferramenta, status, duração e resultado bruto limitado. Cada fonte usada deve receber ID, URL/URN, título, data de recuperação, hash e proveniência disponível. Marcar se há somente metadados ou texto oficial efetivamente obtido. Datas de publicação não comprovam a redação da norma na data de corte, atualmente `2026-10-16`.

O juiz deverá indicar quais fontes sustentam ou contradizem cada conclusão, sem atribuir conteúdo jurídico a um documento cujo texto não recebeu. Validar existência dos IDs citados e correspondência ao material recuperado; relevância e sustentação jurídica ainda exigem avaliação de conteúdo.

Conteúdo externo é dado, não instrução. O subprocesso receberá apenas as variáveis necessárias, sem herdar a chave OpenRouter. Somente ferramentas permitidas serão executadas. Eventual obtenção de texto por URL terá política própria de hosts oficiais e limites.

Conservar `decide` inicialmente para isolar o efeito da pesquisa sobre o parecer. No piloto com pesquisa obrigatória, indisponibilidade da consulta deixa a execução identificada como pendência técnica, sem publicação automática por falta de evidência. Registrar essa perda de cobertura separadamente. Um resultado vazio válido será entregue ao juiz como tal, sem conclusão automática de inadequação ou de fora dos temas.

## Sequência de implementação e validação

1. **Servidor isolado:** revisar fonte, requisitos, licença e dependências; fixar commit e lockfile; preparar ambiente Python. Conectar por stdio, executar `initialize`/`tools/list` e conferir schemas reais. Testar metadados do serviço, busca de norma conhecida e resolução de URN. Não consumir inferências nessa fase. Serviço local vivo não basta: a consulta externa precisa funcionar.
2. **Protocolo com os dois modelos:** realizar uma chamada solicitando ferramenta e uma continuação até JSON final por modelo. Previsão nominal: quatro inferências. Confirmar IDs, raciocínio, resposta final e contabilização; interromper em incompatibilidade antes do piloto.
3. **Integração e testes locais:** validar argumentos, resultado vazio, erro, desafio HTML, chamadas múltiplas/indevidas, limite de conteúdo, IDs incorretos, contador, reserva da chamada final, taxa compartilhada e retomada após interrupção. Usar respostas simuladas para esses casos e executar testes e verificação de tipos.
4. **Comparação pareada com dez IDs:** congelar seleção antes da execução e reutilizar as mesmas propostas já validadas do experimento individual. Criar importação explícita com origem e hashes; não editar checkpoints manualmente. Julgar cada proposta novamente em duas condições: pesquisa desabilitada e pesquisa habilitada. Usar uma nova versão comum do prompt, mantendo modelos, raciocínio, taxonomia e decisão iguais; registrar a condição de pesquisa. A referência permanece somente na avaliação posterior.
5. **Revisão dos resultados:** examinar divergências e fontes utilizadas antes de ampliar. Depois de viabilidade técnica e benefício observado, executar um pequeno teste do fluxo completo com novas classificações e só então ampliar a amostra.

## Orçamento e avaliação

Para dez propostas reutilizadas, o controle demanda nominalmente dez inferências do juiz. O tratamento demanda vinte com busca e resposta final, ou trinta com busca, resolução e resposta final. Total previsto: **30–40 inferências**, mais quatro do teste de protocolo: **34–44**, antes de falhas. Com teto de cinco por etapa, o piloto pareado permite no máximo cem inferências do juiz; o teste de protocolo terá orçamento separado e fixo, sem repetição ilimitada.

Não reutilizar o parecer antigo como único controle: mudanças de prompt e variação do modelo confundiriam a comparação. Não escolher exclusivamente erros conhecidos. Como os IDs vêm de experimentos anteriores, este piloto serve ao desenvolvimento; avaliação final deve usar seleção reservada e congelada.

Relatar precisão das publicadas com numerador e denominador, cobertura, acerto global, decisões fora dos temas, erros publicados que viraram revisão e acertos que deixaram de ser publicados. Acrescentar completude técnica, esgotamentos, consultas tentadas, fontes efetivamente usadas, citações inválidas, desafios HTML, cache, chamadas de modelo/MCP, tokens e duração.

**Dez questões verificam funcionamento e sinal inicial de qualidade; não demonstram precisão de 95%.** Mesmo uma amostra maior precisa distinguir concordância com a referência atual de correção jurídica, pois a própria referência pode conter erros. Nenhuma publicação será autorizada apenas porque uma busca retornou documentos.

## Recomendações para iniciar

Adotar stdio local com revisão fixada; pesquisa apenas no juiz; busca obrigatória no piloto; duas ferramentas por questão; teto compartilhado de cinco inferências por etapa; novo prompt e experimento; comparação pareada com dez propostas. Primeiro comprovar utilidade dos resultados disponíveis, depois decidir sobre a extensão para obter texto oficial. Implementar nessa ordem permite identificar se um problema está no servidor, no protocolo, na relevância da pesquisa ou na avaliação do juiz.
