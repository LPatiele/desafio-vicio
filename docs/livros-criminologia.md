# Livros de Criminologia na base local

Os dois arquivos fornecidos foram incorporados ao snapshot imutável `desafio359-v6-livros`, preservando `desafio359-v5`, `penal50-v3`, referências de avaliação, configurações e experimentos anteriores. Esta etapa não executou inferência nem chamadas externas.

Em termos técnicos, a importação extrai texto de PDF e EPUB, gera segmentos com sobreposição e os indexa no SQLite FTS5/BM25. Em termos práticos, os agentes agora podem encontrar passagens dos livros e conferir de qual autor e lugar vieram.

## Conteúdo e proveniência

| Arquivo | Material efetivamente indexado | Trechos | Localização |
| --- | --- | ---: | --- |
| Juarez Cirino dos Santos, *Criminologia: contribuição para crítica da economia da punição*, Tirant lo Blanch, 2021 | 24 capítulos, 400 páginas com texto; PDF completo com 420 páginas | 779 | Página física do PDF, capítulo e parte |
| *Criminologia no Brasil: história e aplicações clínicas e sociológicas*, Elsevier | 12 capítulos na ordem do EPUB, 108 unidades de seção | 376 | Autor do capítulo, título, seção, caminho XHTML e parte |

O título completo da coletânea foi conferido na folha de rosto interna; o metadado OPF traz o título abreviado. O expediente informa copyright 2011, ISBN impresso 978-85-352-4370-3 e ISBN eletrônico 978-85-352-7057-0; o OPF registra data 2013-06-11. Não tratar a data do arquivo eletrônico como atualização do conteúdo. Os coordenadores indicados são Alvino Augusto de Sá, Davi de Paiva Costa Tangerino e Sérgio Salomão Shecaira. Cada passagem preserva a autoria do respectivo capítulo.

No EPUB, o número no localizador é a posição sequencial entre os 12 capítulos extraídos, não uma página impressa nem necessariamente a numeração interna da parte do livro. Título, seção e caminho XHTML permitem localizar a passagem sem depender dessa numeração.

Pré-textuais, listas finais de referências e formulários editoriais ficaram fora do índice. Notas presentes no corpo podem permanecer. Quatro ocorrências de imagens/figuras do EPUB foram registradas como não extraídas, sem OCR. No PDF, os títulos de capítulos foram transcritos do sumário/cabeçalhos para corrigir espaços de versaletes; o texto das passagens continua sendo o texto extraído, com normalização de espaços e hífens opcionais. Palavras quebradas por hífen de fim de linha ainda podem prejudicar consultas lexicais exatas. As páginas físicas 7 e 268 do PDF foram renderizadas e conferidas visualmente por amostragem; não houve auditoria visual de cada página.

As cópias de trabalho e extrações estão em `referencias/livros/`, ignorada pelo Git. O snapshot guarda também os bytes originais, a extração JSON, seus hashes e o hash do extrator. Um `file://` é a proveniência do arquivo local; não representa uma fonte oficial na internet. O importador não segue instruções presentes nos livros.

Hashes SHA-256 dos originais:

- Juarez: `5f618c9654cb6f6b476a9a9e34b7d57d55f392950d54e75d76cd30a405a885c1`.
- Coletânea: `e170274ef2d5d0d31898d8b6debb7b5f3df3808394a6108c81cbc07013dba1bd`.

## Cobertura: o que avançou e o que falta

A revisão documental das 38 questões que aguardavam doutrina encontrou **18 com apoio temático localizado, 13 com apoio parcial e 7 sem tratamento específico suficiente localizado nas consultas realizadas**. O registro auditável, com IDs de passagens e ressalvas por questão, está em [knowledge/reviews/desafio359-v6-livros.json](../knowledge/reviews/desafio359-v6-livros.json). Não foram usados os rótulos da referência de autoavaliação. A revisão não resolveu todas as alternativas nem validou gabaritos.

Foram retiradas 18 lacunas provisórias de “aguarda livros” e substituídas as demais por limitações específicas. Restam **21 questões com lacunas declaradas**: 20 entre as examinadas nesta importação e a questão Q0142, que ainda exige fonte estadual de ITCD. Isso não impede publicação por regra automática; só uma incerteza material no enquadramento deve afetar o parecer e a decisão.

Há apoio claro para anomia, associação diferencial, Escola de Chicago, método empírico, escolas criminológicas, etiquetamento, controle social e objeto/interdisciplinaridade da Criminologia. A passagem sobre Foucault no capítulo de Baratta fornece contexto, mas o prefácio informa que o capítulo dedicado a Foucault ficou para edição futura; a formulação exata de Q0217 continua com ressalva.

Os livros ainda não bastam, na revisão realizada, para vitimologia (Q0088), teoria agnóstica (Q0117), domínio do fato e da organização (Q0131/Q0198), prevenção secundária (Q0179), ofendículos (Q0188) e garantismo de Ferrajoli (Q0269). Há também apoio parcial para justiça restaurativa, velocidades do direito penal, determinadas atribuições autorais e teoria geral do delito. Dados contemporâneos de seletividade, encarceramento e letalidade precisam de fontes empíricas próprias. Uma simples nota que cita um autor não foi tratada como comprovação da posição atribuída a ele.

A base contém **71 capturas de fontes: 42 normativas, 27 de buscas no BNP e 2 livros; 6.535 trechos; 359 IDs no escopo**. Continua existindo uma busca BNP vazia, herdada da versão anterior. O diagnóstico automático encontrou candidatos para 359/359 questões e candidatos de fontes planejadas para 348/359, ante 350/359 na v5. Essa pequena queda mostra que adicionar documentos altera o ranking; não demonstra queda de precisão nem autoriza concluir melhora. O diagnóstico usa consultas próprias e não reproduz todas as consultas que os agentes escolherão.

**Não foi demonstrada suficiência jurídica de 100% das questões, nem precisão de 95% entre publicadas.** Ter candidatos em todas as buscas é cobertura operacional. O impacto dos livros sobre precisão e cobertura de publicação depende de experimento posterior com as mesmas questões e comparação com o controle.

## Uso pelos agentes

A condição explícita [individual-v13-livros.json](../config/individual-v13-livros.json) mantém Gemini 3.1 Flash-Lite como classificador com ferramentas e Gemini 3.8 Flash como juiz com recuperação automática. Os novos prompts são [classificador.v11-livros.md](../src/agents/classificador.v11-livros.md) e [juiz.v10-livros.md](../src/agents/juiz.v10-livros.md). Ambos distinguem doutrina de lei e precedente, preservam autoria e proíbem inventar paginação ou fundamentar uma atribuição em mera referência bibliográfica.

A ferramenta `buscar_referencias` aceita `tipo="doutrina"`. O filtro agora acontece no banco antes do limite do ranking, para evitar que as normas ocupem todas as posições antes de procurar livros. As consultas automáticas do juiz continuam pesquisando os tipos em conjunto. A referência de autoavaliação permanece fora do corpus e das consultas.

O padrão histórico da CLI de classificação foi preservado; para usar esta condição, informar `--config config/individual-v13-livros.json`. O limite de 500 chamadas da configuração foi mantido: o dry-run das 359 questões estima no mínimo 1.077 chamadas considerando a consulta do classificador; portanto esse teto não comporta um ciclo completo desse volume. Ajustar orçamento e quantidade de questões antes de um experimento integral.

## Examinar a base

Abra manualmente [o inspetor gerado](../output/knowledge/inspection/desafio359-v6-livros/index.html) no navegador e filtre o tipo `doutrina`, ou escolha uma das duas fontes. A página permite buscar palavras, consultar o texto e abrir os metadados de cada passagem. Ela contém as linhas reais exportadas do SQLite, funciona offline e não altera o banco. Sua sintaxe JavaScript foi validada; a interface não foi verificada visualmente nesta etapa, pois a abertura automatizada de `file://` foi recusada pela política do navegador. Não é necessário abrir o template `src/knowledge/inspect.html`, que não contém o corpus.

Banco real: [corpus.sqlite](../output/knowledge/snapshots/desafio359-v6-livros/corpus.sqlite). Manifesto: [manifest.json](../output/knowledge/snapshots/desafio359-v6-livros/manifest.json). Catálogo completo: [catalogo-base359-livros.md](catalogo-base359-livros.md).

Consultas somente de leitura, por exemplo em DB Browser for SQLite:

```sql
SELECT id, title, body, json_extract(data, '$.metadata.author') AS autor
FROM chunks
WHERE json_extract(data, '$.kind') = 'doutrina'
LIMIT 20;
```

Para exportar novamente a visualização: `npm run knowledge:inspect`. Os comandos de conhecimento passam a usar v6 por padrão; snapshots antigos continuam acessíveis por `--snapshot` e planos antigos por `--plan`.

## Reproduzir e verificar

O extrator `scripts/extrair-livros.py` tem regras específicas para estas duas edições. Uma nova edição ou outro livro requer conferência do importador; não é um extrator genérico validado para qualquer PDF/EPUB. Ele exige arquivos legíveis e rejeita entidades XML personalizadas; não executa scripts do documento.

```sh
# PYTHON deve apontar para um Python com pypdf instalado.
# Usar novos nomes para as saídas; o extrator recusa sobrescrita.
"$PYTHON" scripts/extrair-livros.py referencias/livros/juarez-cirino-2021.pdf /tmp/juarez-extraido.json
"$PYTHON" scripts/extrair-livros.py referencias/livros/criminologia-no-brasil.epub /tmp/coletanea-extraida.json

# Para importar novamente, criar outro plano/ID de snapshot, mantendo os anteriores.
npm run knowledge:import-book -- --plan knowledge/plans/NOVO-PLANO.json --source juarez-cirino-2021 --file referencias/livros/juarez-cirino-2021.pdf --extraction /tmp/juarez-extraido.json
npm run knowledge:coverage
node --import tsx src/index.ts run --config config/individual-v13-livros.json --experiment validacao-v13-livros --dry-run
```

**Validação:** 99 testes passaram; TypeScript sem erros; base aberta somente para leitura; hashes dos 57 artefatos anteriores conferidos; todos os 5.380 trechos anteriores preservados byte a byte na representação JSON; IDs e hashes das evidências da revisão conferidos; ferramenta retornou doutrina real com autoria; citação de fonte não entregue foi rejeitada. Nenhuma chamada real de modelo ou de rede foi realizada. Foram descartadas 17 caudas redundantes de segmentos dos livros antes de congelar a versão, conservando 1.155 trechos úteis.

Resultados verificáveis: [validação](../output/knowledge/base359-livros-validacao.json) e [diagnóstico de cobertura](../output/knowledge/checks/desafio359-v6-livros-coverage.json).
