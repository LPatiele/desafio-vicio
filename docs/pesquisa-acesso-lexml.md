# Pesquisa de canais oficiais de acesso ao LexML

Consulta realizada em 17/10/2026. Escopo: canais publicados pela própria fonte, sem alterar o pipeline ou consumir inferências OpenRouter. Evidência do teste HTTP: `output/integration/lexml-mcp/research/source-channels.json`.

## Conclusão

O SRU utilizado pelo MCP já é uma API oficialmente publicada no catálogo de Dados Abertos do Senado. O desafio JavaScript observado não permite concluir que toda consulta automatizada é proibida. Há uma dificuldade operacional entre o canal documentado e o acesso observado; a causa e os requisitos atuais devem ser confirmados com o responsável.

Não foi encontrada, nas fontes consultadas, uma segunda API pública do acervo central cuja operação pudesse ser confirmada como substituta imediata. Isso não demonstra que nenhum outro canal exista.

## Canais encontrados

| Canal | Evidência oficial | Utilidade e limite |
| --- | --- | --- |
| SRU/XML | [Acervo do portal LexML — Dados Abertos do Senado](https://www12.senado.leg.br/dados-abertos/legislativo/legislacao/acervo-do-portal-lexml) | Pesquisa de metadados. O link oficial do serviço aponta para `https://www.lexml.gov.br/busca/SRU`, usado pelo MCP. O acesso anterior recebeu desafio HTML. |
| JSON-LD / Schema.org Legislation | [Anúncio do LexML](https://projeto.lexml.gov.br/institucional/noticias/portal-lexml-disponibiliza-metadados-das-normas-juridicas-federais-com-marcacao-schema-org-legislation-1), publicado em 2019 e atualizado em 2020 | Metadados no código HTML das páginas individuais de normas federais, em blocos `application/ld+json`. Não é uma API de pesquisa equivalente ao SRU nem uma garantia de texto integral. |
| OAI-PMH | [Parte 4 — Coleta de Metadados](https://projeto.lexml.gov.br/documentacao/Parte-4-Coleta-de-Metadados.pdf), dezembro de 2008 | Arquitetura de intercâmbio e coleta automatizada entre provedores, agregadores e serviço LexML. Não foi confirmado endpoint público atual do acervo central para consumo por terceiros. |

A existência de documentação histórica não comprova disponibilidade operacional atual.

## Verificação direta do JSON-LD

Foi consultada a [página da Lei Maria da Penha](https://www.lexml.gov.br/urn/urn:lex:br:federal:lei:2006-08-07;11340), vinculada pelo anúncio oficial como exemplo de dados estruturados. A requisição HTTP direta retornou **503**, sem blocos JSON-LD extraíveis nessa resposta. Logo, a alternativa está documentada, mas não ficou operacionalmente validada neste ambiente.

O teste usou o mesmo identificador de cliente da integração, sem cookies, autenticação, execução de JavaScript ou resolução de desafio. Foram lidas também as páginas de documentação do projeto e de catálogo do Senado, ambas com HTTP 200. Respostas acessíveis por indexação ou outro cliente não garantem acesso equivalente pelo processo do MCP.

## Uma API com nome semelhante que não resolve o caso

A página [Open Data do projeto](https://projeto.lexml.gov.br/open-data) documenta `/apidata/cms` e `/apidata/content`. Seu escopo é o CMS Plone do site institucional, incluindo notícias, arquivos e outras páginas. Não foi identificada ali uma API substituta de pesquisa de normas, jurisprudência e proposições do acervo LexML.

Não foi localizado, nas páginas consultadas, procedimento específico de emissão de token ou chave para liberar o SRU. A página de login do CMS não comprova exigência de cadastro na API jurídica.

## Encaminhamento recomendado

O [canal oficial de contato dos Dados Abertos do Senado](https://www12.senado.leg.br/dados-abertos/contato) orienta identificar a manifestação como referente ao site de Dados Abertos. Ele oferece formulário e o telefone 0800 0 61 2211.

Sugestão de consulta técnica, preparada para revisão; nenhuma mensagem foi enviada:

> Estamos integrando a API SRU do LexML para pesquisa de metadados jurídicos. O catálogo de Dados Abertos indica o endpoint `/busca/SRU`, mas as requisições HTTP recebem HTML de verificação de segurança em vez de XML SRU. Qual é o endereço operacional recomendado para clientes automatizados? Há requisitos de identificação, autenticação ou limites de uso? Existe exportação de metadados ou canal OAI-PMH disponível para usuários externos? Podemos fornecer horário, parâmetros e resposta observada para diagnóstico.

Os pontos a confirmar são endereço atual, limites de frequência e volume, requisitos de acesso, disponibilidade de coleta incremental ou exportação e contato técnico responsável. O cenário de cinquenta mil questões semanais exige discutir volume de consultas, cache e atualização incremental; não se deve presumir que a consulta por questão seja o uso recomendado da fonte.

Até essa confirmação, manter a integração experimental bloqueada para pesquisa obrigatória. JSON-LD e OAI-PMH são possibilidades com escopos próprios, não soluções comprovadas para o bloqueio atual. Nenhuma mudança de fonte ou implementação de um novo canal foi realizada nesta pesquisa.
