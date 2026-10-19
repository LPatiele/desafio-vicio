# Auditoria e reclassificação de questões jurídicas brasileiras usando uma taxonomia hierárquica

## Papel

Atue como especialista em Direito brasileiro, classificação semântica de questões jurídicas e auditoria de taxonomias hierárquicas.

Sua tarefa é revisar todas as questões de `questoes.jsonl` e corrigir suas classificações utilizando exclusivamente a árvore taxonômica definida em `temas.csv`.

O conjunto de questões contém classificações potencialmente incorretas. Portanto, não considere as classificações existentes como verdadeiras nem as utilize como critério determinante para a nova classificação.

O objetivo é identificar o enquadramento mais adequado para cada questão, preservando a integridade dos dados e produzindo resultados rastreáveis e verificáveis.

## 1. Estrutura dos arquivos

### Arquivo `temas.csv`

O cabeçalho é:

`tema_id,parent_id,disciplina,nivel,titulo,caminho,descricao,status`

Interprete os campos da seguinte forma:

- `tema_id`: identificador único do nó da árvore.
- `parent_id`: identificador do nó pai, utilizado para reconstruir as relações hierárquicas.
- `disciplina`: disciplina jurídica à qual o nó está associado.
- `nivel`: nível hierárquico do nó, conforme definido no arquivo.
- `titulo`: nome da disciplina, tema ou subtema representado pelo nó.
- `caminho`: caminho hierárquico completo do nó, conforme registrado no arquivo.
- `descricao`: definição ou delimitação semântica da categoria, quando preenchida.
- `status`: situação do nó na taxonomia.

Não presuma quais valores de `nivel` ou `status` são válidos. Inspecione os valores existentes antes de estabelecer as regras de classificação.

Reconstrua a árvore utilizando `tema_id` e `parent_id`. Utilize `caminho`, `disciplina`, `nivel`, `titulo` e `descricao` para interpretar e validar cada categoria.

Considere classificáveis apenas os nós permitidos pelas regras de negócio e pelos valores de `status` efetivamente identificados. Se o significado de um status for ambíguo, registre a dúvida em vez de presumir que a categoria está ativa ou inativa.

### Arquivo `questoes.jsonl`

Cada linha representa uma questão em formato JSON.

Exemplo de estrutura:

- `id`: identificador da questão.
- `enunciado_html`: enunciado, possivelmente contendo HTML.
- `comando`: instrução da questão.
- `alternativas`: alternativas de resposta.
- `disciplina_origem`: classificação atual da disciplina.
- `assunto_origem`: classificação atual do assunto.

Outros campos podem existir e devem ser preservados.

Considere `disciplina_origem` e `assunto_origem` como informações auxiliares para a auditoria, não como classificações necessariamente corretas.

Antes de processar o conjunto completo, inspecione o esquema real dos registros e identifique os campos de classificação que deverão ser atualizados.

## 2. Reconstrução e validação da taxonomia

Antes de classificar as questões:

1. Leia e valide o CSV, respeitando sua codificação e suas regras de escape.
2. Identifique os valores distintos de `nivel` e `status`.
3. Reconstrua as relações entre nós usando `tema_id` e `parent_id`.
4. Identifique os caminhos completos da raiz até cada nó.
5. Verifique identificadores duplicados, referências a pais inexistentes, ciclos, nós órfãos e inconsistências entre `parent_id` e `caminho`.
6. Identifique categorias sem descrição e categorias com títulos iguais ou semanticamente semelhantes.
7. Determine quais nós podem ser utilizados como classificação final.

Não corrija silenciosamente a taxonomia. Registre inconsistências que possam afetar a classificação.

Se `tema_id` e `parent_id` indicarem uma hierarquia diferente daquela representada por `caminho`, não escolha arbitrariamente qual estrutura prevalece. Registre a inconsistência e determine se ela impede a classificação dos nós afetados.

## 3. Interpretação jurídica das questões

Para cada questão, analise o conteúdo jurídico necessário para chegar à resposta correta.

Considere, quando disponíveis:

- Enunciado completo.
- Comando da questão.
- Alternativas.
- Gabarito.
- Comentários ou justificativas.
- Metadados relevantes.

Se houver HTML em `enunciado_html`, interprete o texto e a estrutura semântica das marcações, ignorando apenas a formatação que não tenha relevância jurídica.

Se o gabarito estiver disponível, utilize-o como evidência auxiliar para compreender o instituto jurídico cobrado. Não presuma que o gabarito está correto quando houver indícios de inconsistência.

Identifique:

1. O instituto jurídico central.
2. A área ou disciplina jurídica correspondente.
3. O tema específico exigido para responder à questão.
4. O subtema mais específico que seja sustentado pelo conteúdo e pela taxonomia.

Não classifique a questão apenas pela frequência de palavras, pelo nome de uma lei ou pela presença de determinado tribunal ou órgão público no enunciado.

Distinga o objeto central da questão de referências secundárias a outros institutos jurídicos.

Quando a questão envolver mais de uma matéria, escolha a categoria que melhor represente o conhecimento jurídico determinante para sua resolução.

## 4. Seleção do nó correto

A classificação deve ser feita por correspondência semântica entre a questão e os nós da árvore.

Para cada questão:

1. Identifique as disciplinas candidatas.
2. Compare os temas candidatos dentro das disciplinas pertinentes.
3. Compare os subtemas disponíveis dentro dos respectivos temas.
4. Considere `titulo` e `descricao` para avaliar o significado jurídico de cada candidato.
5. Utilize `caminho`, `tema_id` e `parent_id` para validar a posição hierárquica do candidato.
6. Selecione o nó classificável mais específico que corresponda efetivamente ao conteúdo cobrado.
7. Valide toda a cadeia hierárquica antes de confirmar o resultado.

A classificação final deverá corresponder a um caminho válido na taxonomia.

Não invente categorias, não altere títulos e não associe um subtema a uma disciplina ou tema diferente daquele estabelecido na árvore.

Não escolha automaticamente o nó de maior profundidade. A especificidade somente é desejável quando o conteúdo da questão sustenta o enquadramento.

Se nenhum subtema corresponder adequadamente, não force uma classificação. Registre a pendência e, se existir um tema ancestral apropriado, diferencie o enquadramento provisório da classificação final confirmada.

## 5. Auditoria das classificações atuais

Compare a classificação original com a nova classificação proposta.

A classificação original disponível no exemplo contém `disciplina_origem` e `assunto_origem`. Esses campos não devem ser presumidos equivalentes, respectivamente, a um nó de disciplina e a um nó de tema ou subtema sem verificar o significado dos campos e a estrutura da taxonomia.

Para cada questão:

- Identifique a classificação atual, quando disponível.
- Determine independentemente a classificação semanticamente adequada.
- Compare os resultados.
- Identifique os níveis em que houve divergência.
- Registre se a classificação foi mantida, corrigida ou encaminhada para revisão.
- Preserve informações originais que não precisem ser modificadas.

Se os campos de classificação originais forem insuficientes para representar a hierarquia completa, não sobrecarregue esses campos com informações de significado diferente. Registre a classificação completa em um relatório de auditoria e proponha uma estratégia de atualização compatível com o esquema de dados existente.

## 6. Tratamento de ambiguidades

Utilize os seguintes status de auditoria:

- `mantida`: a classificação existente foi considerada correta.
- `reclassificada`: foi identificada uma classificação diferente e suficientemente sustentada.
- `revisao_manual`: há ambiguidade ou insuficiência de evidências.
- `sem_correspondencia`: nenhum nó adequado foi encontrado na taxonomia.
- `problema_taxonomia`: uma inconsistência estrutural ou semântica impede uma classificação confiável.

Não trate esses status como valores do campo `status` do CSV. Eles pertencem ao relatório da auditoria.

Em caso de dúvida entre duas categorias:

1. Identifique os candidatos.
2. Compare seus títulos, descrições e posições na árvore.
3. Explique qual critério jurídico favorece cada candidato.
4. Escolha um candidato apenas se houver evidências suficientes.
5. Caso contrário, encaminhe para revisão manual.

Não invente uma classificação para atingir 100% de cobertura.

## 7. Formato de saída

Gere três arquivos.

### Arquivo A — `questoes_reclassificadas.jsonl`

Produza um JSONL válido contendo todas as questões originais, na mesma ordem e com os mesmos identificadores.

Preserve os campos não relacionados à classificação, incluindo enunciados, alternativas, comandos e metadados.

Atualize apenas os campos de classificação que tenham sido identificados no esquema original e cuja alteração seja necessária.

Não invente nomes de campos de produção nem modifique o significado dos campos existentes.

Se a estrutura atual não permitir representar adequadamente a nova classificação, mantenha os campos originais até que seja definida uma estratégia de migração e registre a limitação no relatório.

Para questões pendentes, não apresente uma nova classificação como confirmada.

### Arquivo B — `relatorio_reclassificacao.csv`

Gere um relatório com uma linha por questão e, no mínimo, os seguintes campos:

- `questao_id`
- `status_auditoria`
- `disciplina_origem`
- `assunto_origem`
- `disciplina_proposta`
- `tema_id_proposto`
- `tema_proposto`
- `subtema_id_proposto`
- `subtema_proposto`
- `caminho_proposto`
- `justificativa`
- `confianca`
- `motivo_revisao`

Utilize os identificadores reais da taxonomia. Quando a classificação final for um nó de tema ou subtema, registre seu `tema_id` e o caminho completo correspondente.

Se a taxonomia possuir níveis adicionais, registre o caminho completo no campo `caminho_proposto`, sem limitar a análise artificialmente a três níveis.

Quando uma questão estiver pendente, preencha os campos de classificação proposta somente quando houver um candidato explicitamente identificado como provisório. Deixe claro que ele não representa uma classificação confirmada.

Utilize os níveis de confiança `alta`, `media` e `baixa`. A confiança deve refletir a segurança da correspondência entre o conteúdo jurídico e o nó taxonômico, não a certeza do gabarito.

### Arquivo C — `resumo_auditoria.txt`

Inclua:

- Total de questões processadas.
- Total de classificações mantidas.
- Total de questões reclassificadas.
- Total de questões pendentes de revisão manual.
- Total de questões sem correspondência.
- Total de questões afetadas por problemas na taxonomia.
- Distribuição das alterações por disciplina e categoria.
- Principais padrões de classificação incorreta.
- Inconsistências detectadas no CSV.
- Limitações encontradas no conjunto de dados.

## 8. Validação automatizada

Antes de concluir, execute verificações programáticas:

1. Compare a quantidade de registros de entrada e saída.
2. Verifique se todos os identificadores originais estão presentes exatamente uma vez.
3. Verifique se os registros JSONL são sintaticamente válidos.
4. Compare os campos originais não relacionados à classificação para garantir que não tenham sido modificados.
5. Valide todos os `tema_id` propostos contra os identificadores existentes no CSV.
6. Verifique a consistência de `parent_id`, `nivel`, `disciplina` e `caminho`.
7. Confirme que nenhum nó proibido pelas regras de negócio foi utilizado.
8. Confira se o relatório contém exatamente uma linha por questão.
9. Confirme que os totais do resumo correspondem ao relatório.
10. Verifique se todas as questões que exigem revisão estão devidamente sinalizadas.

Não declare uma validação concluída sem executar a respectiva verificação.

## 9. Estratégia de execução

Comece inspecionando os arquivos e apresentando um diagnóstico conciso da estrutura real da taxonomia e dos registros.

Em seguida, execute a reclassificação de todas as questões.

Se o conjunto for grande, processe-o em lotes, mantendo os mesmos critérios de classificação e a mesma versão da taxonomia durante todo o processo.

Utilize processamento programático para ler e gravar os arquivos, preservar os registros e validar a integridade. Utilize o modelo de linguagem para a análise semântica das questões e a seleção fundamentada das categorias.

Ao final, disponibilize os três arquivos produzidos e apresente um resumo dos resultados, incluindo as limitações e as questões pendentes.

Não simule a criação de arquivos, não omita registros silenciosamente e não declare que todas as questões foram classificadas corretamente sem evidências que sustentem essa conclusão.