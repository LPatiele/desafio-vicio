# Integração MCP para pesquisa do juiz

Estado em 17/10/2026: integração implementada e testes locais aprovados; protocolo dos dois modelos verificado com função local. Servidor alternativo disponível, mas a busca real LexML está bloqueada por página de verificação de segurança. O piloto pareado ainda não foi executado.

## Servidor e escopo

O MCP originalmente indicado, `prof-ramos/LeXML-mcp`, retornou 404 no clone e na API pública do GitHub. O usuário indicou então outro projeto: [ehrodan/lexmcp](https://github.com/ehrodan/lexmcp). A substituição preserva o objetivo de descoberta de documentos no LexML, mas não é uma atualização do mesmo servidor.

Foi baixada a revisão `be163c70fb15082d5d982656485a0b1b0d084677`, versão declarada `0.5.0`, licença MIT. O código permanece em `vendor/lexmcp`. Seus 129 arquivos rastreados foram registrados com hash em `vendor/lexmcp-source-lock.json`.

`src/mcp/lexmcp-server.py` registra somente duas funções do código original, com limites e envelope de proveniência da aplicação:

- `pesquisar_lexml`: termos, campo, filtros e paginação; piloto limitado a cinco registros na primeira página.
- `resolver_urn_lexml`: valida URN e constrói URL offline. Não verifica a página, o texto da norma ou a vigência.

As demais ferramentas do projeto não são registradas nesse adaptador. Não são necessárias credenciais DataJud para essa integração. A chave OpenRouter não é passada ao subprocesso, e o diretório de trabalho do Python fica na cópia do servidor, separado do `.env` do projeto principal.

Foi usado Python 3.12.14 em ambiente isolado `vendor/lexmcp/.venv`, com dependências da camada LexML e FastMCP. A lista exata instalada está em `vendor/lexmcp-requirements.lock`. Não foi instalado o conjunto completo de funcionalidades processuais, corpus e geração de documentos do projeto.

## Uso

O servidor histórico é distribuído como submódulo Git, fixado na revisão acima. Para obter sua fonte em um novo clone, execute `git submodule update --init vendor/lexmcp`. O ambiente `.venv` é local e não acompanha o repositório. A entrega final sem RAG não depende desse submódulo.

```bash
# Após obter e revisar a fonte e preparar o ambiente: fixar origem e hashes.
npm run mcp:pin

# Verifica stdio, catálogo real, busca de norma conhecida e URN.
# Não consome inferências OpenRouter.
npm run mcp:check

# Testa ferramentas dos modelos com função local, sem pesquisa jurídica.
npm run mcp:smoke

# Diagnóstico único da incompatibilidade documentada de tool_choice=none.
npm run mcp:compat

# Executa o piloto somente com verificação externa pronta e protocolo aprovado.
npm run mcp:pilot
```

O sandbox deste ambiente pode bloquear a conexão externa; uma falha de rede local não demonstra indisponibilidade do LexML. A verificação real foi repetida com acesso externo permitido e então identificou o desafio HTML do portal.

Os testes de protocolo possuem estado persistido em `output/integration/lexml-mcp/protocol`. Reexecutá-los não renova seu orçamento nem repete um teste concluído. Foram quatro requisições iniciais e uma continuação adicional de diagnóstico; a falha original foi preservada.

## Configuração experimental

- `config/lexml-controle-v4.json`: pesquisa desabilitada.
- `config/lexml-pesquisa-v4.json`: pesquisa obrigatória somente no juiz.
- Ambos usam `classificador.v3.md` e `juiz.v4-lexml.md`, os mesmos modelos e os mesmos limites de decisão. O classificador padrão continua 3.5 VL e o juiz 3 Super.
- A configuração padrão e o motor `decide` não foram alterados para habilitar pesquisa.

O piloto congela dez IDs por ordenação de hash, sem consultar a referência: `Q0023`, `Q0013`, `Q0002`, `Q0017`, `Q0008`, `Q0041`, `Q0039`, `Q0035`, `Q0037`, `Q0050`. As propostas vêm de `individual-v3-invertido-50`, incluindo origem e hashes. A importação valida as propostas e descarta pareceres, decisões e contadores do experimento anterior.

A seleção e seus hashes estão em `output/integration/lexml-mcp/cohort.json`. Este é um teste de desenvolvimento, não uma amostra reservada para demonstrar 95%.

Para execução manual em outro experimento, o comando `run` aceita `--proposals-from NOME`. Use os mesmos IDs nas duas condições e um novo nome de experimento. A importação integra o fingerprint e não permite trocar a origem na retomada.

## Fluxo e limites

`src/client.ts` separa solicitação de ferramenta e resposta final. A aplicação valida argumentos, executa o MCP, devolve uma mensagem `tool` com o ID correto e preserva a mensagem `assistant` e os metadados necessários à continuação.

`src/research/judge.ts` coordena a pesquisa dentro da etapa do juiz. O primeiro pedido exige busca. Após a busca, o juiz produz o parecer no schema existente. Uma resolução pode ocorrer quando houver URN sem URL, dentro do mesmo orçamento de ferramentas.

Continuam valendo até cinco envios OpenRouter por questão e etapa, incluindo seleção, continuação e falhas. São até duas operações lógicas MCP por questão e dois envios por operação em erro transitório; o Python usa uma tentativa interna para evitar multiplicação. A última inferência disponível é reservada ao parecer. Pedidos de ferramenta recebidos nessa fase não são executados.

Todas as inferências passam por `src/rate-limit.ts`, incluindo continuações. As consultas MCP têm limites próprios e não consomem a cota de inferências OpenRouter.

O provedor do 3 Super recusou `tool_choice=none` com HTTP 404. A continuação com `auto` e JSON Schema funcionou. Por isso as configurações experimentais usam `finalToolChoice=auto`; o bloqueio de execução de novas ferramentas na fase final é aplicado no transporte da aplicação.

`src/research/session.ts` guarda operações, contadores e snapshots bem-sucedidos. Uma retomada reutiliza resultados concluídos. Desafios HTML e erros não entram no cache como resultados válidos. `src/research/checkpoint.ts` valida a consistência do histórico e dos limites ao carregar registros.

Se a busca obrigatória falhar, não há parecer nem publicação automática. Uma busca vazia válida tem outro estado e não implica fora da taxonomia. O motor determinístico permanece o mesmo; o grafo exige pesquisa concluída antes da decisão na condição experimental.

## Evidência e proveniência

Fontes externas ficam separadas das citações literais da questão. Os registros recebem IDs `S-xxxxxxxxxxxx`; o parecer pode citá-los nas justificativas, e IDs inexistentes são rejeitados. O uso efetivo fica em `research.sourcesUsed`.

O envelope do adaptador identifica seu produtor e o hash dos **metadados retornados**. Ele não representa hash do texto legal integral. Resultados da busca são `metadata_only`; URNs geradas offline são marcadas como não verificadas na rede. A data de corte continua `2026-10-16` e não se presume vigência a partir da data de recuperação.

O adaptador do servidor original mantém compatibilidade de schemas no cliente, mas não pôde ser validado em execução real porque aquela fonte não foi obtida. A integração real de stdio foi realizada com o adaptador restrito do MCP alternativo.

## Situação do piloto

`npm run mcp:pilot` exige `mcp:check` com busca bem-sucedida nos últimos trinta minutos. O último resultado foi `challenge`, logo os dois braços ficaram bloqueados antes de consumir inferências. O registro está em `output/integration/lexml-mcp/pilot-status.json`.

Para retomar, execute uma nova verificação em uma próxima tentativa manual. Se o portal fornecer XML válido e os documentos esperados, o mesmo piloto poderá prosseguir com a coorte congelada. Não há repetição automática de desafio HTML nem tentativa de contornar a verificação do portal.

Os resultados e limitações estão em [relatório de execução](../output/integration/lexml-mcp/relatorio.md). Não há resultado de qualidade jurídica ou precisão publicável deste experimento ainda.
