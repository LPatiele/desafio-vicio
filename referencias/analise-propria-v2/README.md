# Referência provisória v2

Congelada em 2026-10-17T16:46:32.747505-03:00, com 359 IDs e corte jurídico em 16/10/2026.

**Escopo:** nova conferência legislativa/editorial de Q0001–Q0050. Nos outros 309, a análise v1 foi herdada e recebeu vinculação às fontes documentais disponíveis; não se declara nova revisão jurídica integral. Pendências doutrinárias e materiais insuficientes permanecem explícitas.

Foram preservadas a v1 e suas limitações. A v2 não é gabarito oficial nem revisão humana independente. Nenhum novo julgamento OpenRouter foi usado para preencher seus rótulos. Os 50 itens já tiveram exposição a resultados anteriores e são de desenvolvimento.

## Correções registradas

| ID | Alternativa antes/depois | Tema antes/depois | Motivo |
| --- | --- | --- | --- |
| Q0001 | C → C | 5527 → 5524 | A questão reúne desaforamento e decisões da primeira fase; nenhum filho isolado representa todo o comando. CPP 416, 419, 427 e 428. |
| Q0004 | None → None | 5484 → 5480 | Há critérios territorial/domicílio, matéria federal e prerrogativa de função. O pai Competência cobre o conjunto; a alternativa continua indeterminada por ressalvas temporais/semânticas. |
| Q0006 | A → A | 5160 → 5157 | O conjunto cobra furto e roubo. O pai patrimonial é mais abrangente de modo necessário; não escolher Roubo apenas por ser o tema da assertiva remanescente. |
| Q0023 | B → B | 5527 → 5524 | Bifasicidade, prisão na pronúncia, impronúncia, defensor e oitiva em plenário exigem o rito do Júri como conjunto; CPP 413, 414, 456 e 473. |
| Q0028 | E → C | 5526 → 5524 | Correção expressa do prazo na v1 e enquadramento no conjunto de etapas do rito; não apenas pronúncia nem uma troca automática para acompanhar modelo. |

A mudança de tema é decisão editorial sobre a taxonomia; a legislação fundamenta os institutos, não determina IDs. A Q0040 continua com ressalva e alternativa temática plausível, sem transformar o resultado anterior do modelo em resposta de referência.

## Evidências e reprodução

[Fontes e capturas verificadas](fontes-v2.json), [registro completo de fontes](fontes.json), [alterações](alteracoes.json), [manifesto e hashes](manifesto.json).

A correção da Q0028 se apoia no [CPP oficial, art. 409](https://www2.camara.leg.br/legin/fed/declei/1940-1949/decreto-lei-3689-3-outubro-1941-322206-normaatualizada-pe.html): cinco dias, não três. Os arts. 406 e 421, § 1º, confirmam os outros trechos.

O construtor é `scripts/referencia-v2.py`. Ele não refaz o raciocínio nem pesquisa automaticamente: consolida as notas editoriais e as consultas oficiais registradas nesta sessão. Recusa sobrescrever a versão já congelada.

A referência permanece exclusiva da avaliação. A base consultável pelos modelos contém documentos jurídicos, sem gabaritos, temas corrigidos ou notas por questão desta versão.
