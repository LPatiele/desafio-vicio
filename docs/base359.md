# Base ampliada e retirada do veto por lacunas

Atualização em 18/10/2026. Base nova: `desafio359-v5`. Configuração nova: [individual-v12-base359.json](../config/individual-v12-base359.json), com os mesmos modelos do piloto v11 (Gemini 3.1 Flash-Lite classificador e Gemini 3.8 Flash juiz). As configurações, bases e resultados anteriores foram preservados.

## O que mudou no motor

Foi removido de `src/retrieval/decision.ts` o veto automático de publicação por lacuna ou recuperação local vazia. Os campos de lacuna continuam no contexto e nos registros. O juiz pode marcar incerteza quando essa falta realmente impede distinguir temas; o motor continua encaminhando esse parecer para revisão.

As regras de tema alternativo, rubricas não sustentadas, alertas materiais, incertezas do classificador, extras não sustentados e raízes continuam valendo. Falha de integridade/checkpoint não foi convertida em aprovação. O veto histórico da integração remota LexML não foi alterado, pois pertence a outra configuração.

`requireContextForPublication` foi mantido no esquema apenas para carregar configurações históricas, mas não controla mais o veto local. Na nova configuração seu valor é `false`. Resultados antigos não foram recalculados nem reescritos; qualquer nova inferência deve usar outro experimento.

Os prompts [classificador v10](../src/agents/classificador.v10-local359.md) e [juiz v9](../src/agents/juiz.v9-local359.md) removem as referências ao limite de cinquenta questões e ao veto automático, preservando o restante dos critérios temáticos.

## Conteúdo e alcance efetivamente verificados

- **359/359 IDs** presentes no plano e na tabela `questions` do SQLite, sem restrição ao recorte inicial.
- **5.380 trechos**, contra 492 na base anterior. Os textos já capturados foram reaproveitados; a seleção agora inclui os artigos completos disponíveis dos diplomas, respeitando os limites dos extratores.
- **42 diplomas/atos normativos:** 40 diplomas federais e duas resoluções do CNJ. Além de CP, CPP, Constituição e leis do primeiro recorte, foram acrescentados organizações criminosas, armas, hediondos, prisão temporária, interceptação, genocídio, tortura, racismo, pessoa idosa, esporte, discriminação no trabalho, software, investigação pelo delegado, identificação criminal, proteção de testemunhas, saúde mental, deficiência, trânsito, licitações, improbidade, Marco Civil, acesso à informação, contravenções e códigos militares. Duas leis históricas revogadas permanecem identificadas no título. As resoluções CNJ 427 e 467 atendem a menções explícitas do conjunto.
- **27 capturas de buscas no BNP**, das quais 26 têm texto (130 trechos). Uma consulta vazia permanece registrada. Consultas diferentes podem trazer o mesmo precedente; quantidade de capturas não equivale a precedentes distintos.
- A busca diagnóstica encontrou candidatos para **359/359 questões**, mas somente 350 tiveram entre esses candidatos alguma fonte associada no plano preliminar. Nenhuma dessas contagens prova relevância jurídica.

[Catálogo completo, com fontes, contagens e limitações](catalogo-base359.md).

**A meta de 100% de suficiência documental ainda não está concluída.** Há 39 questões com lacunas declaradas: 38 aguardam material doutrinário (31 com origem Criminologia e sete itens teóricos adicionais, seleção preliminar); Q0142 ainda precisa da norma estadual específica sobre isenções de ITCD. A Constituição delimita o assunto, mas não fornece essas isenções. O usuário informou que fornecerá livros de Juarez e Vanessa Chiari; títulos e edições ainda precisam ser confirmados. Nenhum dos dois foi indexado nesta versão.

Em linguagem direta: todas as questões agora podem consultar o banco, mas ainda não podemos afirmar que o banco contém tudo de que cada uma precisa. Esses dois indicadores são apresentados separadamente. Os livros deverão ser mapeados por capítulo/página aos conceitos necessários antes de se declarar a cobertura da doutrina.

Não foram utilizados rótulos da referência de avaliação para preencher o plano ou os documentos. A associação de fontes foi feita a partir do conteúdo dos anexos, de menções a diplomas e de termos jurídicos; os rótulos de origem servem somente como pistas declaradas na curadoria de material doutrinário.

## Inspeção direta

- [Banco SQLite](../output/knowledge/snapshots/desafio359-v5/corpus.sqlite)
- [Consulta offline](../output/knowledge/inspection/desafio359-v5/index.html): busca por texto, título, artigo e ID; filtros por fonte/tipo; abas de fontes e questões; texto completo e proveniência dos trechos. Exporta registros reais do SQLite e não edita o banco.
- [Manifesto e hashes](../output/knowledge/snapshots/desafio359-v5/manifest.json)
- [Cobertura por questão e candidatos recuperados](../output/knowledge/checks/desafio359-v5-coverage.json)
- [Validação técnica e preservação](../output/knowledge/base359-validacao.json)

A consulta offline não tem acesso de rede nem usa modelos. Sua busca local filtra os registros exportados; os agentes continuam usando SQLite FTS5/BM25. A abertura automática de `file://` pelo navegador da ferramenta foi bloqueada pela política de protocolos; o arquivo está disponível para abertura manual. Não foi criado servidor HTTP para contornar esse bloqueio.

Para consultar o SQLite em um cliente de banco, as tabelas são `sources`, `chunks`, `questions` e `metadata`. Exemplos somente de leitura:

```sql
SELECT id, json_extract(data, '$.title') AS titulo,
       json_extract(data, '$.kind') AS tipo FROM sources;

SELECT id, source_id, locator, title, body FROM chunks
WHERE source_id = 'cp' AND locator LIKE '%!art155%';

SELECT id, json_extract(data, '$.gaps') AS lacunas
FROM questions WHERE id = 'Q0142';
```

## Comandos sem inferência

```sh
npm run knowledge:search -- --query "desaforamento Tribunal do Júri"
npm run knowledge:coverage
npm run knowledge:inspect
node --import tsx src/index.ts run --config config/individual-v12-base359.json --experiment base359-v12 --dry-run
```

Os comandos de conhecimento agora usam a base ampliada por padrão. Para consultar a anterior, passar `--snapshot output/knowledge/snapshots/penal50-v3/manifest.json`. A CLI principal de classificação preserva seu padrão anterior; a condição ampliada é selecionada explicitamente por `--config`.

O `dry-run` carregou os 359 IDs e o novo banco sem erro de escopo; não chamou provedores. O mínimo nominal é 1.077 envios (consulta e proposta do classificador, parecer do juiz), podendo crescer com rodadas e falhas. Foram preservados os limites financeiros do piloto: 500 envios e US$ 10. Antes de executar as 359, é necessário dimensionar e autorizar o orçamento; esta tarefa não executou classificações nem aumentou os limites.

## Fontes, coleta e reprodução

Os planos [rascunho v4](../knowledge/plans/desafio359-v4.json) e [versão v5](../knowledge/plans/desafio359-v5.json) foram preservados. O primeiro registra a tentativa de obter uma obra aberta da UFBA, que não chegou a ser incorporada. A tentativa por HTTP não foi autorizada; os downloads autorizados por HTTPS falharam por conexão, endereço indisponível ou proteção. Nenhuma verificação de segurança foi contornada. A versão v5 aguarda os livros indicados pelo usuário.

Na legislação, a API do Congresso retornou metadados, mas vários links binários retornaram 404. As conexões do Planalto foram interrompidas. Os textos foram obtidos na Câmara e, nos casos necessários, nas publicações do Senado e no portal do CNJ. As falhas estão nos metadados de estágio; os textos incorporados têm URL, bytes preservados e hash. Não foram substituídos por resumos gerados.

Os scripts `scripts/planejar-base359.ts` e `scripts/finalizar-base359.ts` registram a construção do plano e a reutilização das capturas; recusam sobrescrever os planos/estágios existentes. A coleta e a publicação são etapas separadas:

```sh
node --import tsx src/knowledge/cli.ts fetch --plan knowledge/plans/desafio359-v5.json
node --import tsx src/knowledge/cli.ts fetch-html camara --plan knowledge/plans/desafio359-v5.json
node --import tsx src/knowledge/cli.ts build --plan knowledge/plans/desafio359-v5.json
```

Em checkout novo sem as capturas reaproveitadas, pode ser necessário usar os outros provedores documentados no importador. Indisponibilidade dos serviços pode impedir reconstrução idêntica. Para reproduzir exatamente esta base, conservar o snapshot e suas capturas; `build` recusa sobrescrever uma versão publicada. Capturas HTML compiladas não garantem reconstrução automática da legislação vigente no corte de 16/10/2026, especialmente quando coletadas depois.

Validação: TypeScript sem diagnósticos e **96 testes aprovados**, incluindo retirada do veto, manutenção de revisão por dúvida/alternativa, compatibilidade com 50 e 359 IDs, inspeção offline e proveniência de páginas doutrinárias. Os hashes de manifesto, plano, banco e trechos da base v3 anterior permaneceram iguais. Não houve inferência real nesta tarefa.


## Atualização com os livros

A versão v5 descrita acima foi preservada. A incorporação dos dois livros está documentada em [livros-criminologia.md](livros-criminologia.md), no snapshot `desafio359-v6-livros`. Os comandos de conhecimento passam a selecionar v6 por padrão; para reproduzir esta versão histórica, informar explicitamente `--plan knowledge/plans/desafio359-v5.json` e/ou `--snapshot output/knowledge/snapshots/desafio359-v5/manifest.json`.
