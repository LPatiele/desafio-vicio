# Catálogo da base desafio359-v5

Banco SQLite: `output/knowledge/snapshots/desafio359-v5/corpus.sqlite`.

42 diplomas/atos normativos, 27 capturas de buscas no BNP (uma vazia), 5.380 trechos e 359 questões no escopo. Nenhum livro de Criminologia foi incorporado até esta versão.

## Normas e atos

| ID | Referência | Trechos | Texto capturado |
| --- | --- | ---: | --- |
| cp | Código Penal | 438 | [Fonte](https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-2848-7-dezembro-1940-412868-normaatualizada-pe.html) |
| cpp | Código de Processo Penal | 829 | [Fonte](https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-3689-3-outubro-1941-322206-normaatualizada-pe.html) |
| cf | Constituição Federal | 267 | [Fonte](https://normas.leg.br/api/public/normas?urn=urn%3Alex%3Abr%3Afederal%3Aconstituicao%3A1988-10-05%3B1988&tipo_documento=maior-detalhe) |
| lep | Lei de Execução Penal | 221 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1980-1987/lei-7210-11-julho-1984-356938-normaatualizada-pl.html) |
| drogas | Lei de Drogas | 100 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/2006/lei-11343-23-agosto-2006-545399-normaatualizada-pl.html) |
| maria-penha | Lei Maria da Penha | 57 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/2006/lei-11340-7-agosto-2006-545133-normaatualizada-pl.html) |
| ambientais | Crimes ambientais | 87 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1998/lei-9605-12-fevereiro-1998-365397-normaatualizada-pl.html) |
| lavagem | Lavagem de dinheiro | 29 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1998/lei-9613-3-marco-1998-372359-normaatualizada-pl.html) |
| juizados | Juizados Especiais | 99 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1995/lei-9099-26-setembro-1995-348608-normaatualizada-pl.html) |
| eca | Estatuto da Criança e do Adolescente | 335 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8069-13-julho-1990-372211-normaatualizada-pl.html) |
| abuso | Abuso de autoridade | 45 | [Fonte](https://normas.leg.br/api/public/normas?urn=urn%3Alex%3Abr%3Afederal%3Alei%3A2019-09-05%3B13869&tipo_documento=maior-detalhe) |
| terrorismo | Lei Antiterrorismo | 20 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/2016/lei-13260-16-marco-2016-782561-publicacaooriginal-149752-pl.html) |
| ordem-economica | Crimes contra a ordem econômica | 24 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8137-27-dezembro-1990-367271-normaatualizada-pl.html) |
| organizacoes | Organizações criminosas — Lei 12.850/2013 | 38 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/2013/lei-12850-2-agosto-2013-776714-normaatualizada-pl.html) |
| armas | Estatuto do Desarmamento | 42 | [Fonte](https://legis.senado.leg.br/norma/552702/publicacao/34620860) |
| hediondos | Crimes hediondos | 20 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8072-25-julho-1990-372192-normaatualizada-pl.html) |
| temporaria | Prisão temporária | 7 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1989/lei-7960-21-dezembro-1989-365581-normaatualizada-pl.html) |
| interceptacao | Interceptação de comunicações | 14 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1996/lei-9296-24-julho-1996-349049-normaatualizada-pl.html) |
| genocidio | Genocídio | 7 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1950-1959/lei-2889-1-outubro-1956-355184-publicacaooriginal-1-pl.html) |
| tortura | Crimes de tortura | 4 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1997/lei-9455-7-abril-1997-349431-normaatualizada-pl.html) |
| racismo | Crimes de racismo | 27 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1989/lei-7716-5-janeiro-1989-356354-normaatualizada-pl.html) |
| idoso | Estatuto da Pessoa Idosa | 118 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/2003/lei-10741-1-outubro-2003-497511-normaatualizada-pl.html) |
| esporte | Lei Geral do Esporte | 220 | [Fonte](https://normas.leg.br/api/public/normas?urn=urn%3Alex%3Abr%3Afederal%3Alei%3A2023-06-14%3B14597&tipo_documento=maior-detalhe) |
| discriminacao-trabalho | Práticas discriminatórias no trabalho | 6 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1995/lei-9029-13-abril-1995-348798-normaatualizada-pl.html) |
| software | Proteção de programas de computador | 7 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1998/lei-9609-19-fevereiro-1998-364738-normaatualizada-pl.html) |
| investigacao | Investigação criminal pelo delegado de polícia | 4 | [Fonte](https://legis.senado.leg.br/norma/591278/publicacao/15636365) |
| identificacao | Identificação criminal | 13 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/2009/lei-12037-1-outubro-2009-591435-normaatualizada-pl.html) |
| protecao-testemunhas | Proteção de vítimas e testemunhas | 13 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1999/lei-9807-13-julho-1999-378063-normaatualizada-pl.html) |
| saude-mental | Proteção das pessoas com transtornos mentais | 4 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/2001/lei-10216-6-abril-2001-364458-normaatualizada-pl.html) |
| deficiencia | Estatuto da Pessoa com Deficiência | 132 | [Fonte](https://legis.senado.leg.br/norma/584958/publicacao/34619049) |
| transito | Código de Trânsito Brasileiro | 404 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1997/lei-9503-23-setembro-1997-372348-normaatualizada-pl.html) |
| licitacoes | Lei de Licitações e Contratos Administrativos | 205 | [Fonte](https://normas.leg.br/api/public/normas?urn=urn%3Alex%3Abr%3Afederal%3Alei%3A2021-04-01%3B14133&tipo_documento=maior-detalhe) |
| improbidade | Improbidade administrativa | 35 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1992/lei-8429-2-junho-1992-357452-normaatualizada-pl.html) |
| marco-civil | Marco Civil da Internet | 32 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/2014/lei-12965-23-abril-2014-778630-normaatualizada-pl.html) |
| acesso-informacao | Lei de Acesso à Informação | 47 | [Fonte](https://normas.leg.br/api/public/normas?urn=urn%3Alex%3Abr%3Afederal%3Alei%3A2011-11-18%3B12527&tipo_documento=maior-detalhe) |
| drogas-historica | Lei 6.368/1976 — histórica, revogada | 47 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1970-1979/lei-6368-21-outubro-1976-357249-publicacaooriginal-1-pl.html) |
| abuso-historico | Lei 4.898/1965 — histórica, revogada | 29 | [Fonte](https://www2.camara.leg.br/legin/fed/lei/1960-1969/lei-4898-9-dezembro-1965-368996-normaatualizada-pl.html) |
| contravencoes | Lei das Contravenções Penais | 72 | [Fonte](https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-3688-3-outubro-1941-413573-normaatualizada-pe.html) |
| cpm | Código Penal Militar | 412 | [Fonte](https://www2.camara.leg.br/legin/fed/declei/1960-1969/decreto-lei-1001-21-outubro-1969-376258-normaatualizada-pe.html) |
| cppm | Código de Processo Penal Militar | 716 | [Fonte](https://www2.camara.leg.br/legin/fed/declei/1960-1969/decreto-lei-1002-21-outubro-1969-376259-normaatualizada-pe.html) |
| cnj-427 | Resolução CNJ 427/2021 — proteção de vítimas e testemunhas | 6 | [Fonte](https://atos.cnj.jus.br/atos/detalhar/4190) |
| cnj-467 | Resolução CNJ 467/2022 — porte de armas da Polícia Judicial | 18 | [Fonte](https://atos.cnj.jus.br/atos/detalhar/4650) |

## Buscas de precedentes

Cada linha é uma consulta ao BNP, não um precedente único nem validação de pertinência. Os 130 trechos preservam tribunal, tipo, número e situação quando fornecidos.

| ID | Consulta | Trechos |
| --- | --- | ---: |
| bnp-c3e2cb83fa | Tribunal do Júri | 5 |
| bnp-162248d73a | absolvição sumária apelação | 5 |
| bnp-9a5831f435 | competência prefeito crime federal | 5 |
| bnp-22ccb7f62a | reincidência regime livramento condicional | 5 |
| bnp-a66ff71116 | furto roubo consumação | 5 |
| bnp-6f98b8a1b9 | mutatio libelli | 0 |
| bnp-d342401dab | progressão regime reparação dano administração pública | 5 |
| bnp-efb937e1c3 | furto escusa absolutória idoso | 5 |
| bnp-deeca2e657 | crime ambiental pessoa jurídica insignificância | 5 |
| bnp-51a9e2d99b | lavagem de dinheiro corrupção | 5 |
| bnp-42aa3de90d | juiz das garantias | 5 |
| bnp-a449e37e33 | habeas corpus adolescente internação | 5 |
| bnp-5ba17870eb | prisão preventiva de ofício | 5 |
| bnp-2767bdb8fa | defesa preliminar funcionário público | 5 |
| bnp-750d8b7045 | juizado especial criminal conexão complexidade | 5 |
| bnp-7052420595 | ação civil ex delicto | 5 |
| bnp-2c860794df | concurso crimes armazenamento divulgação pornografia infantil | 5 |
| bnp-0992e576bb | Lei Maria da Penha âmbito aplicação | 5 |
| bnp-08bb6a4dc0 | habeas corpus cabimento | 5 |
| bnp-dac55f9c55 | lesão corporal violência doméstica ação penal | 5 |
| bnp-c794eb71a9 | cartel ordem econômica | 5 |
| bnp-9fe2169e4a | Tribunal do Júri execução imediata efeito suspensivo | 5 |
| bnp-214f118684 | medida de segurança duração | 5 |
| bnp-201e5550e7 | dosimetria pena | 5 |
| bnp-b232386f6a | citação intimação processo penal | 5 |
| bnp-d9981c5255 | nulidade processo penal prejuízo | 5 |
| bnp-1574906966 | indulto comutação pena | 5 |

## Alcance e pendências

- Escopo: 359/359; busca diagnóstica retornou candidatos para 359/359.
- Candidatos de alguma fonte associada no plano: 350/359. Os nove sem esse cruzamento são: Q0002, Q0066, Q0074, Q0088, Q0091, Q0094, Q0139, Q0153, Q0217.
- 38 questões têm pendência de material doutrinário, incluindo as 31 rotuladas originalmente como Criminologia e sete itens teóricos adicionais. Essa seleção preliminar não é classificação de referência.
- Q0142: falta o texto estadual específico das isenções de ITCD; a Constituição só delimita a matéria.
- Não se declara suficiência jurídica de 100%; presença de candidatos não demonstra relevância.
- Diplomas históricos revogados foram identificados no título. As capturas de HTML não reconstroem automaticamente a redação vigente no corte histórico.
- Mudanças não foram avaliadas com novas inferências.
