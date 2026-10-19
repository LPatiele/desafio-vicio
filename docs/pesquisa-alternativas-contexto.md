# Alternativas de contexto jurídico — 17/10/2026

A alternativa mais promissora para este desafio é combinar **legislação estruturada, espelhos de jurisprudência e teses de precedentes**, com recuperação local e consultas remotas complementares. A pesquisa encontrou fontes que responderam com conteúdo jurídico real, por caminhos diferentes da pesquisa SRU do LexML bloqueada.

MCP é o protocolo de integração com ferramentas e fontes. RAG, de *Retrieval-Augmented Generation*, é a técnica de recuperar documentos e fornecê-los ao modelo durante a resposta. Na prática: manter uma biblioteca jurídica consultável e entregar ao juiz somente os trechos pertinentes, com identificação e versão. Isso se encaixa na etapa de contexto já implementada.

## O que foi verificado diretamente

Foram oito requisições HTTP de leitura, incluindo uma busca via POST, sem instalar ou executar novos servidores MCP e sem chamadas OpenRouter. Corpos, datas, hashes e resultados estão em [output/research/contexto-alternativas-2026-10-17](../output/research/contexto-alternativas-2026-10-17/summary.json).

| Fonte/consulta | Resultado observado | Utilidade e limite |
| --- | --- | --- |
| API do Senado, identificação do Código Civil por URN | HTTP 200, JSON com identificação, publicações e relações da norma | Confirma identidade e proveniência; não substitui o texto dos artigos |
| Normas.leg.br, Código Civil | HTTP 200, JSON-LD de cerca de 5,3 MB, com árvore e textos de dispositivos | Conteúdo normativo recuperável; é necessário selecionar versões e preservar hierarquia |
| Normas.leg.br, CDC | HTTP 200 com metadados; sem árvore de artigos nessa resposta | Cobertura varia por norma |
| Link do texto compilado do CDC, fornecido na resposta oficial | HTTP 404 | Link presente no catálogo não garante acesso ao texto |
| STJ, catálogo da Terceira Seção | HTTP 200, JSON CKAN com 54 recursos | Descoberta de arquivos públicos para importação local |
| STJ, arquivo mensal de agosto de 2026 | HTTP 200, 101 espelhos de acórdãos com ementas | Conteúdo jurisprudencial real para busca local; espelho não equivale automaticamente a inteiro teor |
| BNP/CNJ, busca “Tribunal do Júri”, STF e STJ | HTTP 200, dois registros solicitados, com teses e situação | Resultados retornados: Súmula 191/STJ e Tema 1068/STF; não houve validação abrangente de relevância, filtros ou cobertura |
| Código público do adaptador BNP de `jurismcp` | HTTP 200 | Contrato de consulta inspecionado, sem executar código de terceiros |

O campo `total` do BNP veio amplo (9.406); não deve ser apresentado como quantidade validada de precedentes sobre júri. Os dois resultados retornados eram pertinentes à expressão pesquisada. Uma integração deve testar o comportamento dos filtros e da ordenação antes de usá-los como critério de suficiência da pesquisa.

Os dois exemplos do BNP confirmam que existe texto de tese acessível. Sua presença não prova que sejam os precedentes necessários para classificar Q0001, nem que validem as assertivas dessa questão.

## MCPs e ferramentas encontrados

### br-eli-mcp — prioridade para legislação

O [br-eli-mcp](https://github.com/matematicsolutions/br-eli-mcp) expõe consulta de identificação de normas, índice de dispositivos e texto de artigos, usando Senado e Normas.leg.br. Declara licença Apache-2.0 e também integra outras fontes. A inspeção de seus clientes apontou os endpoints testados nesta pesquisa. [Código do cliente de texto](https://github.com/matematicsolutions/br-eli-mcp/blob/main/src/br_eli_mcp/text_client.py).

**Avaliação para nosso projeto:** candidato útil para obter artigos a partir de normas conhecidas. A operação exige identificar a URN da norma; essas ferramentas de legislação não resolvem sozinhas a busca livre por todos os temas. Recomendo combinar um catálogo de normas com índice local. A resposta de uma norma pode ser grande e conter versões distintas; o juiz deve receber dispositivos selecionados, não a árvore integral. Os testes confirmam os endpoints de origem, ainda não a operação completa do MCP.

### jurismcp — prioridade para precedentes qualificados

O [jurismcp](https://github.com/ivancaron/jurismcp) possui o adaptador `BnpLegalPrecedentsRequest` para teses do BNP/CNJ, além de conectores de tribunais. O [código BNP](https://github.com/ivancaron/jurismcp/blob/main/src/jurismcp/domain/bnp.py) usa uma API JSON sem autenticação e registra que seu contrato não é documentado. Sua fonte LexML também reconhece a verificação de segurança; trocar apenas para esse adaptador não resolve o bloqueio anterior.

**Avaliação:** o módulo BNP é mais pertinente que acompanhamento processual para dar contexto ao juiz. A consulta direta funcionou com dois resultados, sem navegador. Eu restringiria a integração inicialmente a esse módulo e preservaria tribunal, espécie, número, tese, questão submetida, situação e data da obtenção. O contrato precisa de testes e monitoramento de mudanças. Não testamos os outros conectores nem o servidor MCP completo.

O [CNJ descreve o Pangea/BNP como sistema de precedentes qualificados](https://docs.pdpj.jus.br/servicos-negociais/pangeabnp/). Trata-se de uma fonte diferente dos metadados processuais do DataJud.

### dados-publicos-mcp — alternativa com base local

O [dados-publicos-mcp, da Licitei](https://github.com/Licitei/dados-publicos-mcp), documenta importação de fontes públicas para PGlite local, consultas de legislação e navegação por artigos via MCP stdio. O README consultado exige Bun e declara licença AGPL-3.0-only. Após indexação, a proposta é consultar localmente sem depender de scraping em cada resposta.

**Avaliação:** alinhado ao objetivo de volume, mas adiciona runtime e banco à solução atual. Não foi instalado, e não validamos sua importação. Seria uma alternativa a avaliar antes de adotarmos seu conjunto completo; o projeto contém muitos módulos que não contribuem para classificar as questões.

### juris-stj — importação e pesquisa local sem exigir MCP

O [juris-stj](https://github.com/fabiopauli/juris-stj) documenta uma CLI para baixar espelhos do portal do STJ e pesquisar em SQLite FTS5. A fonte oficial foi testada independentemente nesta pesquisa, com catálogo e um arquivo mensal válidos.

**Avaliação:** referência técnica para uma biblioteca local de ementas, decisões e referências legislativas. Não foi instalado ou testado. Podemos criar um importador limitado às fontes e campos necessários usando a arquitetura já existente, sem incorporar uma CLI completa.

O [conjunto oficial do STJ](https://dadosabertos.web.stj.jus.br/dataset/espelhos-de-acordaos-terceira-secao) documenta arquivos mensais, histórico inicial e remoção de duplicidades por ID. A data inicial dos arquivos em 2022 não significa que todos os julgados sejam posteriores a 2022: o primeiro ZIP contém histórico anterior. Os espelhos também não representam automaticamente todo o conteúdo integral de todas as decisões.

### Tavily MCP/API — alternativa de pesquisa na web

O [MCP oficial da Tavily](https://docs.tavily.com/documentation/mcp) oferece pesquisa e extração. A [API de busca](https://docs.tavily.com/documentation/api-reference/endpoint/search) permite restringir domínios e retornar conteúdo extraído. Para uma integração pela API, precisamos de credencial própria do provedor.

**Avaliação:** útil como complemento para descobrir páginas oficiais, com uma lista explícita de domínios. Uma página indexada ou um resumo de busca não deve ser apresentado como artigo integral lido. Não testamos a API ou a qualidade de recuperação em português.

A [tabela de créditos](https://docs.tavily.com/documentation/api-credits), consultada em 17/10/2026, informa 1.000 créditos gratuitos mensais: pesquisa básica custa um crédito e avançada dois; extração pode consumir créditos adicionais. Para 359 questões com duas pesquisas básicas, seriam 718 créditos antes de extras e retentativas. Isso não atende por si só a 50 mil questões semanais; cache e busca local ganham importância nesse cenário.

### Outras opções examinadas

O [mcp-juridico-brasil da DeHor-Labs](https://github.com/DeHor-Labs/mcp-juridico-brasil) concentra-se em processos, movimentos e prazos via DataJud. O [CNJ apresenta a API DataJud como acesso a metadados processuais](https://www.cnj.jus.br/sistemas/datajud/api-publica/). Não seria minha primeira escolha para fornecer fundamentos jurídicos ao juiz.

O [brlaw_mcp_server](https://github.com/pdmtt/brlaw_mcp_server) oferece pesquisa em tribunais, com dependências de navegador e scraping. É candidato secundário, pois acrescenta dependência operacional de portais. Não foi executado.

O [Jus MCP](https://github.com/mcp-dir/jus-mcp) anuncia serviço remoto com fontes públicas gratuitas e consultas pagas. Não verificamos transporte, cotas, disponibilidade ou qualidade dos resultados; não o classifico como solução operacional validada.

A consulta ao catálogo de plugins por “jurídico legislação jurisprudência” não trouxe resultados. Essa busca não esgota outros diretórios e repositórios públicos.

## Abordagem recomendada para o desafio

Recomendo **RAG local como base, com BNP como complemento**. A aplicação mantém o controle da recuperação entre os agentes. Um MCP pode servir de interface dos provedores, mas o fluxo não precisa de novas chamadas de modelo para decidir quando buscar.

1. **Importar um corpus pequeno e versionado:** normas realmente necessárias aos ramos da taxonomia e um recorte de espelhos oficiais. Conferir cobertura antes de ampliar. Guardar URL, URN/ID, hash, dispositivo, versão, datas jurídicas disponíveis e data de obtenção.
2. **Separar dispositivos e precedentes:** um artigo com seu caput/incisos e contexto hierárquico; uma tese com espécie, tribunal e situação; um espelho identificado como espelho. Preservar alterações e revogações indicadas sem presumir vigência apenas pela data de coleta.
3. **Começar com busca textual:** SQLite FTS5 com ordenação BM25 é uma opção documentada para recuperação local ([documentação SQLite](https://www.sqlite.org/fts5.html)). Depois podemos comparar busca semântica se a busca textual falhar por vocabulário. Essa escolha inicial evita introduzir mais um modelo e sua cota antes de medir necessidade.
4. **Buscar a partir da questão e das hipóteses:** combinar institutos presentes no comando/enunciado, tema proposto, assunto original e concorrentes relevantes. Consultar apenas os dois rótulos pode reforçar uma classificação equivocada. A referência de análise própria continua fora dessa recuperação.
5. **Entregar poucos trechos úteis:** orçamento por questão, diversidade de fontes/hipóteses e indicação explícita de conteúdo original, compilado, resumo ou tese. Não preencher o contexto com resultados sem relação demonstrável com o conhecimento cobrado.
6. **Separar verificações:** código confere origem, identidade, integridade, versão e existência da citação; o juiz julga pertinência e distinção entre temas. Um texto oficial verdadeiro pode ser irrelevante para o enquadramento da questão.

Fluxo sugerido:

```text
importação periódica de fontes oficiais → corpus versionado → índice local
                                                               ↓
questão → classificador → busca local + BNP quando necessário → juiz → decisão
```

É importante avaliar ganho para a **classificação temática**, não apenas veracidade de alternativas ou resolução da questão. Textos jurídicos podem explicar um instituto e ainda não distinguir o pai do filho correto na taxonomia.

## Próximo experimento proposto

Antes de migrar a integração, fazer um protótipo restrito a uma disciplina com cobertura documental confirmada. O teste precisa manter o mesmo conjunto de questões e propostas e comparar duas condições com o mesmo prompt de juiz e o mesmo tratamento dos rótulos originais: sem documentos recuperados e com documentos recuperados. Assim o efeito do contexto não se confunde com troca de prompt ou exposição ao rótulo original.

Registrar relevância dos trechos, citações sustentadas, falhas por fonte, concordância entre publicadas, cobertura, revisões, tempo e chamadas. A meta de 95% entre publicadas precisa ser medida com a referência provisória e suas limitações; disponibilidade de fonte não garante esse resultado.

Nesta etapa foram feitas apenas pesquisa e verificações de fontes. Nenhum novo mecanismo foi incorporado ao pipeline e nenhum novo teste de qualidade dos modelos foi executado.
