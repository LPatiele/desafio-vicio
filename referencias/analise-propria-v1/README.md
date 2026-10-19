# Respostas e reclassificação próprias — referência provisória v1

Foram analisadas **359 questões**, com **342 alternativas propostas**, **17 alternativas indeterminadas**, **357 temas principais propostos** e **2 itens fora da árvore**. Corte escolhido: direito vigente em **16/10/2026**, com ressalvas temporais e respeito à data expressa dos fatos e à irretroatividade prejudicial.

Esta é a análise do próprio assistente, produzida pela leitura dos itens e das alternativas. Código apenas organiza e valida as notas. Não houve nova inferência no OpenRouter. As consultas jurídicas utilizaram legislação e páginas institucionais, mas a verificação não é exaustiva e as fontes pendentes são declaradas. Não é revisão humana qualificada, gabarito oficial ou prova da meta de 95%.

## Como ler

Cada item separa alternativa, fundamento jurídico e tema principal. A classificação considera o conhecimento que determina a solução, evitando escolher um tema só pela menção no enunciado. Uma alternativa indeterminada não torna automaticamente o assunto indeterminado ou fora da taxonomia. “Fora” significa ausência de ramo adequado: Q0113 trata de prescrição administrativa disciplinar e Q0142 de isenção de ITCD.

“Proposta fundamentada” significa apenas que há indicação de fonte consultada e nenhuma ressalva individual registrada; não significa resposta verificada ou certeza. A consulta de um código ou índice de súmulas não prova que todos os argumentos foram auditados. “Fonte pendente” identifica conceito, obra ou precedente ainda sem conferência primária individual. As categorias são alertas documentais, não notas de confiança.

Há 142 itens com ressalva jurídica, 58 com alguma referência primária pendente e 6 rótulos principais em nível raiz. Esses grupos podem se sobrepor. 0 rótulos principais usam nós sem descrição; seus títulos e posição foram preservados.

## Arquivos

- [Respostas e temas resumidos](respostas-e-temas.json).
- [Registros completos para comparação](referencia.jsonl).
- [Fontes, limites e pendências](fontes.json).
- [Protocolo e exposição prévia](protocolo.json).
- [Manifesto, contagens e hashes](manifesto.json).
- [Ajustes da conferência antes do congelamento](ajustes-conferencia.json).

- [Leitura comentada de Q0001 a Q0060](leitura/Q0001-Q0060.md).
- [Leitura comentada de Q0061 a Q0120](leitura/Q0061-Q0120.md).
- [Leitura comentada de Q0121 a Q0180](leitura/Q0121-Q0180.md).
- [Leitura comentada de Q0181 a Q0240](leitura/Q0181-Q0240.md).
- [Leitura comentada de Q0241 a Q0300](leitura/Q0241-Q0300.md).
- [Leitura comentada de Q0301 a Q0359](leitura/Q0301-Q0359.md).

## Exemplo de efeito temporal

Q0359 recebe **E** no critério atual. A Lei 15.163/2025 alterou o art. 94 do Estatuto da Pessoa Idosa e afastou a Lei 9.099 para os crimes ali previstos e crimes violentos contra pessoa idosa. O item reproduz a distinção anterior entre procedimento e benefícios. Seu tema principal é **4696 — Estatuto de Idoso — Crimes** (grafia do caminho original preservada no JSON); JECRIM é assunto adicional. [Lei vigente](https://www.planalto.gov.br/ccivil_03/leis/2003/l10.741.htm).

## Uso na avaliação

1. Congele esta versão antes de comparar os modelos. Registre o hash da referência indicado no manifesto. Os 12 itens com exposição prévia não formam um teste independente. Se usar os demais para ajustar prompts, eles também passam a ser dados de desenvolvimento.
2. Meça concordância de **tema** separadamente de acerto de **alternativa**. Uma resposta jurídica errada pode acompanhar um tema correto; ambos os critérios devem aparecer separados. Os pilotos anteriores classificavam temas e não forneceram gabarito de alternativas, portanto ainda não medem resolução jurídica.
3. Para temas, compare ID igual, ancestral ou descendente conforme a árvore. Irmãos não são equivalentes. Registre separadamente coincidência exata, ancestralidade, descendência e ramos distintos. Não transforme extras em respostas aceitas automaticamente.
4. Faça uma análise de sensibilidade excluindo temas raiz amplos, rótulos com limitações e enunciados incompletos; só comparar com raízes pode mascarar erros finos. Para alternativas, deixe indeterminadas e propostas com fonte pendente fora do subconjunto mais restrito; informe o denominador e mostre também o resultado com as demais. Essa triagem não cria um subconjunto validado.
5. Reporte o resultado como **concordância com referência provisória**. Sem referência externa confiável ou suposições adicionais validadas, não é possível identificar a precisão jurídica real nem assegurar 95%. Intervalo binomial calculado sobre esta concordância não corrige erros da própria referência nem dependência entre modelos.

Sem revisão humana, esta referência acrescenta um sinal útil: divergências podem ser confrontadas com dispositivos verificáveis, mudanças legislativas, consistência hierárquica e testes com perturbações de redação. Concordância entre assistente, classificador e juiz continua sujeita a erro comum. Devemos mostrar cenários e pendências, não converter votação ou nota de juiz em garantia estatística.

## Índice por questão

| Questão | Alternativa proposta | Tema principal | Situação da resposta |
|---|---|---|---|
| [Q0001](leitura/Q0001-Q0060.md#q0001) | C | 5527 — Processo Penal > Procedimento do Tribunal do Júri > Impronúncia, Desclassificação, Absolvição Sumária e Pronúncia | proposta_com_ressalva |
| [Q0002](leitura/Q0001-Q0060.md#q0002) | E | 4378 — Criminologia > Processos de Criminalização e Cifras Criminais > Criminalização Primária e Secundária | proposta_fundamentada |
| [Q0003](leitura/Q0001-Q0060.md#q0003) | B | 5562 — Processo Penal > Recursos em Espécies > Apelação | proposta_fundamentada |
| [Q0004](leitura/Q0001-Q0060.md#q0004) | indeterminada | 5484 — Processo Penal > Competência > Competência por Prerrogativa de Função | alternativa_indeterminada |
| [Q0005](leitura/Q0001-Q0060.md#q0005) | D | 5203 — Penal > Teoria da Pena > Segunda Fase da Dosimetria: Agravantes e Atenuantes | proposta_com_ressalva |
| [Q0006](leitura/Q0001-Q0060.md#q0006) | A | 5160 — Penal > Dos Crimes Contra o Patrimônio > Roubo | proposta_com_ressalva |
| [Q0007](leitura/Q0001-Q0060.md#q0007) | C | 5468 — Processo Penal > Ação Penal > Classificação da Ação Penal | proposta_com_ressalva |
| [Q0008](leitura/Q0001-Q0060.md#q0008) | C | 5201 — Penal > Teoria da Pena > Penas Privativas de Liberdade | proposta_fundamentada |
| [Q0009](leitura/Q0001-Q0060.md#q0009) | B | 5159 — Penal > Dos Crimes Contra o Patrimônio > Furto | proposta_fundamentada |
| [Q0010](leitura/Q0001-Q0060.md#q0010) | B | 4688 — Direito Penal - Legislação Especial > Crimes contra o meio ambiente | proposta_com_ressalva |
| [Q0011](leitura/Q0001-Q0060.md#q0011) | C | 4702 — Direito Penal - Legislação Especial > Lavagem de Dinheiro | proposta_fundamentada |
| [Q0012](leitura/Q0001-Q0060.md#q0012) | A | 5569 — Processo Penal > Recursos em Espécies > Recursos no Âmbito dos Juizados Especiais | proposta_fundamentada |
| [Q0013](leitura/Q0001-Q0060.md#q0013) | B | 5503 — Processo Penal > Inquérito Policial > Juiz das Garantias | proposta_com_ressalva |
| [Q0014](leitura/Q0001-Q0060.md#q0014) | E | 5477 — Processo Penal > Ações Autônomas de Impugnação > Habeas Corpus | proposta_fundamentada |
| [Q0015](leitura/Q0001-Q0060.md#q0015) | D | 5500 — Processo Penal > Inquérito Policial > Procedimento do Inquérito Policial | proposta_fundamentada |
| [Q0016](leitura/Q0001-Q0060.md#q0016) | C | 5584 — Processo Penal > Teoria Geral das Prisões | proposta_fundamentada |
| [Q0017](leitura/Q0001-Q0060.md#q0017) | D | 5465 — Processo Penal | proposta_com_ressalva |
| [Q0018](leitura/Q0001-Q0060.md#q0018) | C | 5540 — Processo Penal > Procedimento Sumaríssimo > Competência dos Juizados Especiais Criminais | proposta_fundamentada |
| [Q0019](leitura/Q0001-Q0060.md#q0019) | D | 5475 — Processo Penal > Ação Penal > Ação Civil Ex Delicto | proposta_fundamentada |
| [Q0020](leitura/Q0001-Q0060.md#q0020) | E | 5062 — Penal | proposta_com_ressalva |
| [Q0021](leitura/Q0001-Q0060.md#q0021) | E | 5503 — Processo Penal > Inquérito Policial > Juiz das Garantias | proposta_fundamentada |
| [Q0022](leitura/Q0001-Q0060.md#q0022) | D | 5089 — Penal > Dos Crimes Contra a Administração Pública > Peculato e Peculato Mediante Erro de Outrem | proposta_fundamentada |
| [Q0023](leitura/Q0001-Q0060.md#q0023) | B | 5527 — Processo Penal > Procedimento do Tribunal do Júri > Impronúncia, Desclassificação, Absolvição Sumária e Pronúncia | proposta_com_ressalva |
| [Q0024](leitura/Q0001-Q0060.md#q0024) | A | 4388 — Criminologia > Teorias Sociológicas Explicativas da Criminalidade > Teorias Criminológicas em Espécie | proposta_com_fonte_pendente |
| [Q0025](leitura/Q0001-Q0060.md#q0025) | E | 5101 — Penal > Dos Crimes Contra a Administração Pública > Tráfico de Influência | proposta_fundamentada |
| [Q0026](leitura/Q0001-Q0060.md#q0026) | C | 4704 — Direito Penal - Legislação Especial > Lei Maria da Penha | proposta_fundamentada |
| [Q0027](leitura/Q0001-Q0060.md#q0027) | C | 5488 — Processo Penal > Comunicação dos Atos Processuais > Citação e Contagem dos Prazos | proposta_fundamentada |
| [Q0028](leitura/Q0001-Q0060.md#q0028) | E | 5526 — Processo Penal > Procedimento do Tribunal do Júri > Procedimento Bifásico do Tribunal do Júri | proposta_fundamentada |
| [Q0029](leitura/Q0001-Q0060.md#q0029) | B | 4684 — Direito Penal - Legislação Especial > Abuso de Autoridade | proposta_fundamentada |
| [Q0030](leitura/Q0001-Q0060.md#q0030) | C | 5135 — Penal > Dos Crimes contra a Organização do Trabalho, a Propriedade Imaterial e ao Sentimento Religioso > Dos Crimes Contra a Organização do Trabalho | proposta_fundamentada |
| [Q0031](leitura/Q0001-Q0060.md#q0031) | C | 4388 — Criminologia > Teorias Sociológicas Explicativas da Criminalidade > Teorias Criminológicas em Espécie | proposta_com_fonte_pendente |
| [Q0032](leitura/Q0001-Q0060.md#q0032) | C | 5497 — Processo Penal > Das Questões e Processos Incidentes > Incidente de Falsidade e de Insanidade Mental | proposta_fundamentada |
| [Q0033](leitura/Q0001-Q0060.md#q0033) | E | 5519 — Processo Penal > Prisões em Espécie > Prisão Preventiva | proposta_fundamentada |
| [Q0034](leitura/Q0001-Q0060.md#q0034) | D | 5477 — Processo Penal > Ações Autônomas de Impugnação > Habeas Corpus | proposta_com_ressalva |
| [Q0035](leitura/Q0001-Q0060.md#q0035) | A | 4706 — Direito Penal - Legislação Especial > Terrorismo | proposta_fundamentada |
| [Q0036](leitura/Q0001-Q0060.md#q0036) | D | 4704 — Direito Penal - Legislação Especial > Lei Maria da Penha | proposta_com_ressalva |
| [Q0037](leitura/Q0001-Q0060.md#q0037) | D | 5118 — Penal > Dos Crimes Contra a Fé Pública e de Falsidade Documental > Da Falsidade Documental | proposta_com_ressalva |
| [Q0038](leitura/Q0001-Q0060.md#q0038) | B | 5549 — Processo Penal > Provas em Espécies > Declaração do Ofendido | proposta_fundamentada |
| [Q0039](leitura/Q0001-Q0060.md#q0039) | C | 4683 — Direito Penal - Legislação Especial | proposta_com_ressalva |
| [Q0040](leitura/Q0001-Q0060.md#q0040) | E | 5515 — Processo Penal > Parte Geral dos Recursos > Efeito dos Recursos | proposta_com_ressalva |
| [Q0041](leitura/Q0001-Q0060.md#q0041) | A | 5184 — Penal > Medida de Segurança | proposta_com_ressalva |
| [Q0042](leitura/Q0001-Q0060.md#q0042) | B | 5222 — Penal > Teoria do Crime: Fato Típico > Crime Doloso e Culposo | proposta_fundamentada |
| [Q0043](leitura/Q0001-Q0060.md#q0043) | D | 5201 — Penal > Teoria da Pena > Penas Privativas de Liberdade | proposta_fundamentada |
| [Q0044](leitura/Q0001-Q0060.md#q0044) | C | 5488 — Processo Penal > Comunicação dos Atos Processuais > Citação e Contagem dos Prazos | proposta_fundamentada |
| [Q0045](leitura/Q0001-Q0060.md#q0045) | E | 5091 — Penal > Dos Crimes Contra a Administração Pública > Concussão e Excesso de Exação | proposta_fundamentada |
| [Q0046](leitura/Q0001-Q0060.md#q0046) | A | 5510 — Processo Penal > Nulidades > Nulidade Absoluta e Relativa | proposta_fundamentada |
| [Q0047](leitura/Q0001-Q0060.md#q0047) | D | 5164 — Penal > Dos Crimes Contra o Patrimônio > Dano | proposta_fundamentada |
| [Q0048](leitura/Q0001-Q0060.md#q0048) | A | 5193 — Penal > Punibilidade > Anistia, Graça e Indulto | proposta_com_ressalva |
| [Q0049](leitura/Q0001-Q0060.md#q0049) | B | 5152 — Penal > Dos Crimes Contra a Vida > Induzimento, Instigação ou Auxílio ao Suicídio | proposta_com_ressalva |
| [Q0050](leitura/Q0001-Q0060.md#q0050) | A | 5557 — Processo Penal > Provas em Espécies > Colaboração Premiada | proposta_com_ressalva |
| [Q0051](leitura/Q0001-Q0060.md#q0051) | E | 5182 — Penal > Lei Penal no Tempo e no Espaço > Lei penal no Espaço | proposta_com_ressalva |
| [Q0052](leitura/Q0001-Q0060.md#q0052) | C | 4703 — Direito Penal - Legislação Especial > Lei de Execução Penal | proposta_fundamentada |
| [Q0053](leitura/Q0001-Q0060.md#q0053) | E | 5541 — Processo Penal > Procedimento Sumaríssimo > Transação Penal | proposta_fundamentada |
| [Q0054](leitura/Q0001-Q0060.md#q0054) | A | 5174 — Penal > Introdução ao Estudo do Direito Penal > Classificações dos Crimes | proposta_fundamentada |
| [Q0055](leitura/Q0001-Q0060.md#q0055) | A | 5550 — Processo Penal > Provas em Espécies > Prova Testemunhal | proposta_com_ressalva |
| [Q0056](leitura/Q0001-Q0060.md#q0056) | E | 5070 — Penal > Concurso de Crimes > Pena de Multa no Concurso de Crimes | proposta_fundamentada |
| [Q0057](leitura/Q0001-Q0060.md#q0057) | D | 5176 — Penal > Iter Criminis > Fases do Iter Criminis | proposta_com_fonte_pendente |
| [Q0058](leitura/Q0001-Q0060.md#q0058) | B | 4390 — Criminologia > Vitimologia > Processo de Vitimização | proposta_fundamentada |
| [Q0059](leitura/Q0001-Q0060.md#q0059) | D | 4370 — Criminologia > Criminologia no Estado Democrático de Direito > Modelos de Reação ao Delito | proposta_com_fonte_pendente |
| [Q0060](leitura/Q0001-Q0060.md#q0060) | D | 5093 — Penal > Dos Crimes Contra a Administração Pública > Corrupção Ativa | proposta_fundamentada |
| [Q0061](leitura/Q0061-Q0120.md#q0061) | A | 4703 — Direito Penal - Legislação Especial > Lei de Execução Penal | proposta_fundamentada |
| [Q0062](leitura/Q0061-Q0120.md#q0062) | E | 5182 — Penal > Lei Penal no Tempo e no Espaço > Lei penal no Espaço | proposta_fundamentada |
| [Q0063](leitura/Q0061-Q0120.md#q0063) | C | 4704 — Direito Penal - Legislação Especial > Lei Maria da Penha | proposta_com_ressalva |
| [Q0064](leitura/Q0061-Q0120.md#q0064) | B | 5165 — Penal > Dos Crimes Contra o Patrimônio > Apropriação indébita | proposta_com_ressalva |
| [Q0065](leitura/Q0061-Q0120.md#q0065) | A | 5161 — Penal > Dos Crimes Contra o Patrimônio > Extorsão | proposta_fundamentada |
| [Q0066](leitura/Q0061-Q0120.md#q0066) | E | 4373 — Criminologia > Etapas Evolutivas e Escolas Criminológicas > Escolas Crimonológicas | proposta_com_fonte_pendente |
| [Q0067](leitura/Q0061-Q0120.md#q0067) | D | 5091 — Penal > Dos Crimes Contra a Administração Pública > Concussão e Excesso de Exação | proposta_com_ressalva |
| [Q0068](leitura/Q0061-Q0120.md#q0068) | B | 5096 — Penal > Dos Crimes Contra a Administração Pública > Condescendência Criminosa | proposta_fundamentada |
| [Q0069](leitura/Q0061-Q0120.md#q0069) | D | 5173 — Penal > Introdução ao Estudo do Direito Penal > Interpretação da Norma Penal | proposta_com_fonte_pendente |
| [Q0070](leitura/Q0061-Q0120.md#q0070) | A | 5193 — Penal > Punibilidade > Anistia, Graça e Indulto | proposta_com_ressalva |
| [Q0071](leitura/Q0061-Q0120.md#q0071) | C | 4688 — Direito Penal - Legislação Especial > Crimes contra o meio ambiente | proposta_fundamentada |
| [Q0072](leitura/Q0061-Q0120.md#q0072) | B | 5592 — Processo Penal > Teoria Geral das Provas > Sistemas de Avaliação da Prova | proposta_fundamentada |
| [Q0073](leitura/Q0061-Q0120.md#q0073) | B | 5093 — Penal > Dos Crimes Contra a Administração Pública > Corrupção Ativa | proposta_fundamentada |
| [Q0074](leitura/Q0061-Q0120.md#q0074) | E | 5181 — Penal > Lei Penal no Tempo e no Espaço > Lei penal no Tempo | proposta_fundamentada |
| [Q0075](leitura/Q0061-Q0120.md#q0075) | E | 5191 — Penal > Punibilidade | proposta_fundamentada |
| [Q0076](leitura/Q0061-Q0120.md#q0076) | A | 4373 — Criminologia > Etapas Evolutivas e Escolas Criminológicas > Escolas Crimonológicas | proposta_com_fonte_pendente |
| [Q0077](leitura/Q0061-Q0120.md#q0077) | D | 5174 — Penal > Introdução ao Estudo do Direito Penal > Classificações dos Crimes | proposta_fundamentada |
| [Q0078](leitura/Q0061-Q0120.md#q0078) | E | 4697 — Direito Penal - Legislação Especial > Estatuto do Desarmamento | proposta_com_ressalva |
| [Q0079](leitura/Q0061-Q0120.md#q0079) | E | 5581 — Processo Penal > Sistemas e Princípios Processuais Penais > Sistemas Processuais Penais | proposta_com_fonte_pendente |
| [Q0080](leitura/Q0061-Q0120.md#q0080) | E | 4370 — Criminologia > Criminologia no Estado Democrático de Direito > Modelos de Reação ao Delito | proposta_com_fonte_pendente |
| [Q0081](leitura/Q0061-Q0120.md#q0081) | D | 4373 — Criminologia > Etapas Evolutivas e Escolas Criminológicas > Escolas Crimonológicas | proposta_com_fonte_pendente |
| [Q0082](leitura/Q0061-Q0120.md#q0082) | D | 5100 — Penal > Dos Crimes Contra a Administração Pública > Resistência, Desobediência e Desacato | proposta_fundamentada |
| [Q0083](leitura/Q0061-Q0120.md#q0083) | E | 5150 — Penal > Dos Crimes Contra a Vida > Homicídio | proposta_com_fonte_pendente |
| [Q0084](leitura/Q0061-Q0120.md#q0084) | E | 4704 — Direito Penal - Legislação Especial > Lei Maria da Penha | proposta_fundamentada |
| [Q0085](leitura/Q0061-Q0120.md#q0085) | D | 5076 — Penal > Concurso de Pessoas > Comunicabilidade de Circunstâncias, Condições e Elementares | proposta_fundamentada |
| [Q0086](leitura/Q0061-Q0120.md#q0086) | B | 5092 — Penal > Dos Crimes Contra a Administração Pública > Corrupção Passiva | proposta_fundamentada |
| [Q0087](leitura/Q0061-Q0120.md#q0087) | E | 4703 — Direito Penal - Legislação Especial > Lei de Execução Penal | proposta_com_fonte_pendente |
| [Q0088](leitura/Q0061-Q0120.md#q0088) | C | 4389 — Criminologia > Vitimologia | proposta_com_fonte_pendente |
| [Q0089](leitura/Q0061-Q0120.md#q0089) | B | 5172 — Penal > Introdução ao Estudo do Direito Penal > Princípios do Direito Penal | proposta_com_fonte_pendente |
| [Q0090](leitura/Q0061-Q0120.md#q0090) | C | 5526 — Processo Penal > Procedimento do Tribunal do Júri > Procedimento Bifásico do Tribunal do Júri | proposta_com_ressalva |
| [Q0091](leitura/Q0061-Q0120.md#q0091) | C | 5201 — Penal > Teoria da Pena > Penas Privativas de Liberdade | proposta_fundamentada |
| [Q0092](leitura/Q0061-Q0120.md#q0092) | E | 5511 — Processo Penal > Nulidades > Nulidades em Espécie | proposta_fundamentada |
| [Q0093](leitura/Q0061-Q0120.md#q0093) | A | 5223 — Penal > Teoria do Crime: Fato Típico > Crimes Omissivos e Comissivos | proposta_fundamentada |
| [Q0094](leitura/Q0061-Q0120.md#q0094) | E | 4388 — Criminologia > Teorias Sociológicas Explicativas da Criminalidade > Teorias Criminológicas em Espécie | proposta_com_fonte_pendente |
| [Q0095](leitura/Q0061-Q0120.md#q0095) | D | 5197 — Penal > Punibilidade > Perdão Judicial | proposta_fundamentada |
| [Q0096](leitura/Q0061-Q0120.md#q0096) | E | 5486 — Processo Penal > Competência > Prorrogação, Perpetuação e Modificação de Competência | proposta_fundamentada |
| [Q0097](leitura/Q0061-Q0120.md#q0097) | E | 4705 — Direito Penal - Legislação Especial > Organizações Criminosas | proposta_com_ressalva |
| [Q0098](leitura/Q0061-Q0120.md#q0098) | A | 5548 — Processo Penal > Provas em Espécies > Confissão | proposta_com_fonte_pendente |
| [Q0099](leitura/Q0061-Q0120.md#q0099) | D | 5100 — Penal > Dos Crimes Contra a Administração Pública > Resistência, Desobediência e Desacato | proposta_fundamentada |
| [Q0100](leitura/Q0061-Q0120.md#q0100) | A | 5224 — Penal > Teoria do Crime: Fato Típico > Erro de Tipo | proposta_com_ressalva |
| [Q0101](leitura/Q0061-Q0120.md#q0101) | B | 4704 — Direito Penal - Legislação Especial > Lei Maria da Penha | proposta_fundamentada |
| [Q0102](leitura/Q0061-Q0120.md#q0102) | C | 5574 — Processo Penal > Sentença Penal > Sentença Absolutória | proposta_fundamentada |
| [Q0103](leitura/Q0061-Q0120.md#q0103) | C | 5478 — Processo Penal > Ações Autônomas de Impugnação > Revisão Criminal | proposta_fundamentada |
| [Q0104](leitura/Q0061-Q0120.md#q0104) | indeterminada | 5499 — Processo Penal > Inquérito Policial > Conceito, Finalidade e Caractéristas do Inquérito Policial | alternativa_indeterminada |
| [Q0105](leitura/Q0061-Q0120.md#q0105) | C | 4388 — Criminologia > Teorias Sociológicas Explicativas da Criminalidade > Teorias Criminológicas em Espécie | proposta_com_fonte_pendente |
| [Q0106](leitura/Q0061-Q0120.md#q0106) | indeterminada | 5157 — Penal > Dos Crimes Contra o Patrimônio | alternativa_indeterminada |
| [Q0107](leitura/Q0061-Q0120.md#q0107) | C | 5119 — Penal > Dos Crimes Contra a Fé Pública e de Falsidade Documental > De outras falsidades | proposta_fundamentada |
| [Q0108](leitura/Q0061-Q0120.md#q0108) | C | 5561 — Processo Penal > Recursos em Espécies > Recurso em sentido estrito (RESE) | proposta_fundamentada |
| [Q0109](leitura/Q0061-Q0120.md#q0109) | D | 4708 — Direito Penal - Legislação Especial > Tráfico de Drogas | proposta_fundamentada |
| [Q0110](leitura/Q0061-Q0120.md#q0110) | D | 5484 — Processo Penal > Competência > Competência por Prerrogativa de Função | proposta_com_ressalva |
| [Q0111](leitura/Q0061-Q0120.md#q0111) | B | 4373 — Criminologia > Etapas Evolutivas e Escolas Criminológicas > Escolas Crimonológicas | proposta_com_fonte_pendente |
| [Q0112](leitura/Q0061-Q0120.md#q0112) | C | 4705 — Direito Penal - Legislação Especial > Organizações Criminosas | proposta_fundamentada |
| [Q0113](leitura/Q0061-Q0120.md#q0113) | E | fora | proposta_com_ressalva |
| [Q0114](leitura/Q0061-Q0120.md#q0114) | indeterminada | 5507 — Processo Penal > Lei Processual no Tempo e no Espaço > Lei processual no Tempo | alternativa_indeterminada |
| [Q0115](leitura/Q0061-Q0120.md#q0115) | C | 4388 — Criminologia > Teorias Sociológicas Explicativas da Criminalidade > Teorias Criminológicas em Espécie | proposta_com_fonte_pendente |
| [Q0116](leitura/Q0061-Q0120.md#q0116) | A | 4708 — Direito Penal - Legislação Especial > Tráfico de Drogas | proposta_com_fonte_pendente |
| [Q0117](leitura/Q0061-Q0120.md#q0117) | E | 4384 — Criminologia > Teorias Legitimidoras da Pena | proposta_com_fonte_pendente |
| [Q0118](leitura/Q0061-Q0120.md#q0118) | E | 5507 — Processo Penal > Lei Processual no Tempo e no Espaço > Lei processual no Tempo | proposta_com_ressalva |
| [Q0119](leitura/Q0061-Q0120.md#q0119) | B | 5194 — Penal > Punibilidade > Abolitio Criminis | proposta_fundamentada |
| [Q0120](leitura/Q0061-Q0120.md#q0120) | C | 5547 — Processo Penal > Provas em Espécies > Interrogatório Judicial | proposta_fundamentada |
| [Q0121](leitura/Q0121-Q0180.md#q0121) | C | 5472 — Processo Penal > Ação Penal > Ação Penal de Iniciativa Privada | proposta_fundamentada |
| [Q0122](leitura/Q0121-Q0180.md#q0122) | C | 4703 — Direito Penal - Legislação Especial > Lei de Execução Penal | proposta_fundamentada |
| [Q0123](leitura/Q0121-Q0180.md#q0123) | indeterminada | 4378 — Criminologia > Processos de Criminalização e Cifras Criminais > Criminalização Primária e Secundária | alternativa_indeterminada |
| [Q0124](leitura/Q0121-Q0180.md#q0124) | E | 4384 — Criminologia > Teorias Legitimidoras da Pena | proposta_com_fonte_pendente |
| [Q0125](leitura/Q0121-Q0180.md#q0125) | C | 5181 — Penal > Lei Penal no Tempo e no Espaço > Lei penal no Tempo | proposta_com_ressalva |
| [Q0126](leitura/Q0121-Q0180.md#q0126) | E | 5182 — Penal > Lei Penal no Tempo e no Espaço > Lei penal no Espaço | proposta_fundamentada |
| [Q0127](leitura/Q0121-Q0180.md#q0127) | B | 5575 — Processo Penal > Sentença Penal > Sentença Condenatória | proposta_com_ressalva |
| [Q0128](leitura/Q0121-Q0180.md#q0128) | C | 5184 — Penal > Medida de Segurança | proposta_com_ressalva |
| [Q0129](leitura/Q0121-Q0180.md#q0129) | B | 5550 — Processo Penal > Provas em Espécies > Prova Testemunhal | proposta_fundamentada |
| [Q0130](leitura/Q0121-Q0180.md#q0130) | A | 5160 — Penal > Dos Crimes Contra o Patrimônio > Roubo | proposta_fundamentada |
| [Q0131](leitura/Q0121-Q0180.md#q0131) | E | 5072 — Penal > Concurso de Pessoas > Autores e Partícipes | proposta_com_fonte_pendente |
| [Q0132](leitura/Q0121-Q0180.md#q0132) | A | 5550 — Processo Penal > Provas em Espécies > Prova Testemunhal | proposta_com_ressalva |
| [Q0133](leitura/Q0121-Q0180.md#q0133) | E | 5524 — Processo Penal > Procedimento do Tribunal do Júri | proposta_fundamentada |
| [Q0134](leitura/Q0121-Q0180.md#q0134) | A | 5092 — Penal > Dos Crimes Contra a Administração Pública > Corrupção Passiva | proposta_fundamentada |
| [Q0135](leitura/Q0121-Q0180.md#q0135) | D | 5169 — Penal > Dos Crimes Contra o Patrimônio > Receptação | proposta_fundamentada |
| [Q0136](leitura/Q0121-Q0180.md#q0136) | B | 4704 — Direito Penal - Legislação Especial > Lei Maria da Penha | proposta_fundamentada |
| [Q0137](leitura/Q0121-Q0180.md#q0137) | D | 5500 — Processo Penal > Inquérito Policial > Procedimento do Inquérito Policial | proposta_fundamentada |
| [Q0138](leitura/Q0121-Q0180.md#q0138) | B | 5205 — Penal > Teoria da Pena > Penas Restritivas de Direitos | proposta_fundamentada |
| [Q0139](leitura/Q0121-Q0180.md#q0139) | E | 5217 — Penal > Teoria do Crime: Culpabilidade > Causas Supralegais de Exclusão da Culpabilidade | proposta_com_fonte_pendente |
| [Q0140](leitura/Q0121-Q0180.md#q0140) | E | 5159 — Penal > Dos Crimes Contra o Patrimônio > Furto | proposta_fundamentada |
| [Q0141](leitura/Q0121-Q0180.md#q0141) | E | 4388 — Criminologia > Teorias Sociológicas Explicativas da Criminalidade > Teorias Criminológicas em Espécie | proposta_com_fonte_pendente |
| [Q0142](leitura/Q0121-Q0180.md#q0142) | B | fora | proposta_com_fonte_pendente |
| [Q0143](leitura/Q0121-Q0180.md#q0143) | E | 5507 — Processo Penal > Lei Processual no Tempo e no Espaço > Lei processual no Tempo | proposta_fundamentada |
| [Q0144](leitura/Q0121-Q0180.md#q0144) | A | 5562 — Processo Penal > Recursos em Espécies > Apelação | proposta_fundamentada |
| [Q0145](leitura/Q0121-Q0180.md#q0145) | D | 4702 — Direito Penal - Legislação Especial > Lavagem de Dinheiro | proposta_fundamentada |
| [Q0146](leitura/Q0121-Q0180.md#q0146) | A | 5594 — Processo Penal > Teoria Geral das Provas > Prova Ilegal e Prova Ilícita | proposta_com_ressalva |
| [Q0147](leitura/Q0121-Q0180.md#q0147) | A | 5499 — Processo Penal > Inquérito Policial > Conceito, Finalidade e Caractéristas do Inquérito Policial | proposta_fundamentada |
| [Q0148](leitura/Q0121-Q0180.md#q0148) | indeterminada | 5203 — Penal > Teoria da Pena > Segunda Fase da Dosimetria: Agravantes e Atenuantes | alternativa_indeterminada |
| [Q0149](leitura/Q0121-Q0180.md#q0149) | C | 5500 — Processo Penal > Inquérito Policial > Procedimento do Inquérito Policial | proposta_fundamentada |
| [Q0150](leitura/Q0121-Q0180.md#q0150) | E | 4708 — Direito Penal - Legislação Especial > Tráfico de Drogas | proposta_fundamentada |
| [Q0151](leitura/Q0121-Q0180.md#q0151) | C | 5523 — Processo Penal > Prisões em Espécie > Liberdade Provisória | proposta_fundamentada |
| [Q0152](leitura/Q0121-Q0180.md#q0152) | B | 5472 — Processo Penal > Ação Penal > Ação Penal de Iniciativa Privada | proposta_fundamentada |
| [Q0153](leitura/Q0121-Q0180.md#q0153) | A | 5222 — Penal > Teoria do Crime: Fato Típico > Crime Doloso e Culposo | proposta_com_fonte_pendente |
| [Q0154](leitura/Q0121-Q0180.md#q0154) | B | 5135 — Penal > Dos Crimes contra a Organização do Trabalho, a Propriedade Imaterial e ao Sentimento Religioso > Dos Crimes Contra a Organização do Trabalho | proposta_com_ressalva |
| [Q0155](leitura/Q0121-Q0180.md#q0155) | B | 4703 — Direito Penal - Legislação Especial > Lei de Execução Penal | proposta_com_ressalva |
| [Q0156](leitura/Q0121-Q0180.md#q0156) | D | 4688 — Direito Penal - Legislação Especial > Crimes contra o meio ambiente | proposta_fundamentada |
| [Q0157](leitura/Q0121-Q0180.md#q0157) | E | 5520 — Processo Penal > Prisões em Espécie > Prisão Temporária | proposta_fundamentada |
| [Q0158](leitura/Q0121-Q0180.md#q0158) | A | 4707 — Direito Penal - Legislação Especial > Tortura | proposta_fundamentada |
| [Q0159](leitura/Q0121-Q0180.md#q0159) | B | 5226 — Penal > Teoria do Crime: Fato Típico > Nexo Causal e Imputação Objetiva | proposta_fundamentada |
| [Q0160](leitura/Q0121-Q0180.md#q0160) | E | 5205 — Penal > Teoria da Pena > Penas Restritivas de Direitos | proposta_fundamentada |
| [Q0161](leitura/Q0121-Q0180.md#q0161) | A | 5594 — Processo Penal > Teoria Geral das Provas > Prova Ilegal e Prova Ilícita | proposta_fundamentada |
| [Q0162](leitura/Q0121-Q0180.md#q0162) | C | 4381 — Criminologia > Teoria Geral da Criminologia > Conceito e objeto da Criminologia | proposta_com_fonte_pendente |
| [Q0163](leitura/Q0121-Q0180.md#q0163) | E | 4703 — Direito Penal - Legislação Especial > Lei de Execução Penal | proposta_com_ressalva |
| [Q0164](leitura/Q0121-Q0180.md#q0164) | A | 4703 — Direito Penal - Legislação Especial > Lei de Execução Penal | proposta_fundamentada |
| [Q0165](leitura/Q0121-Q0180.md#q0165) | A | 4705 — Direito Penal - Legislação Especial > Organizações Criminosas | proposta_com_ressalva |
| [Q0166](leitura/Q0121-Q0180.md#q0166) | E | 4703 — Direito Penal - Legislação Especial > Lei de Execução Penal | proposta_com_ressalva |
| [Q0167](leitura/Q0121-Q0180.md#q0167) | D | 5524 — Processo Penal > Procedimento do Tribunal do Júri | proposta_fundamentada |
| [Q0168](leitura/Q0121-Q0180.md#q0168) | A | 4683 — Direito Penal - Legislação Especial | proposta_com_ressalva |
| [Q0169](leitura/Q0121-Q0180.md#q0169) | C | 5492 — Processo Penal > Das Questões e Processos Incidentes > Exceção de Suspeição, de Impedimento ou de Incompatibilidade | proposta_fundamentada |
| [Q0170](leitura/Q0121-Q0180.md#q0170) | D | 5203 — Penal > Teoria da Pena > Segunda Fase da Dosimetria: Agravantes e Atenuantes | proposta_fundamentada |
| [Q0171](leitura/Q0121-Q0180.md#q0171) | B | 4693 — Direito Penal - Legislação Especial > Crimes Hediondos | proposta_fundamentada |
| [Q0172](leitura/Q0121-Q0180.md#q0172) | D | 5484 — Processo Penal > Competência > Competência por Prerrogativa de Função | proposta_fundamentada |
| [Q0173](leitura/Q0121-Q0180.md#q0173) | C | 4703 — Direito Penal - Legislação Especial > Lei de Execução Penal | proposta_com_ressalva |
| [Q0174](leitura/Q0121-Q0180.md#q0174) | B | 5133 — Penal > Dos Crimes Contra a Liberdade Pessoal > Dos Crimes contra a Inviolabilidade do Domicílio, Contra a Inviolabilidade da Correspondência e Contra a Inviolabilidade dos Segredos | proposta_com_ressalva |
| [Q0175](leitura/Q0121-Q0180.md#q0175) | C | 5092 — Penal > Dos Crimes Contra a Administração Pública > Corrupção Passiva | proposta_fundamentada |
| [Q0176](leitura/Q0121-Q0180.md#q0176) | A | 5081 — Penal > Dos Crimes Contra a Administração Judicial > Falso Testemunha ou Falsa Perícia e Corrupção Ativa de Testemunha ou Perito | proposta_com_ressalva |
| [Q0177](leitura/Q0121-Q0180.md#q0177) | A | 5547 — Processo Penal > Provas em Espécies > Interrogatório Judicial | proposta_fundamentada |
| [Q0178](leitura/Q0121-Q0180.md#q0178) | D | 4697 — Direito Penal - Legislação Especial > Estatuto do Desarmamento | proposta_com_ressalva |
| [Q0179](leitura/Q0121-Q0180.md#q0179) | C | 4369 — Criminologia > Criminologia no Estado Democrático de Direito > Sistemas de Prevenção | proposta_com_fonte_pendente |
| [Q0180](leitura/Q0121-Q0180.md#q0180) | E | 5594 — Processo Penal > Teoria Geral das Provas > Prova Ilegal e Prova Ilícita | proposta_fundamentada |
| [Q0181](leitura/Q0181-Q0240.md#q0181) | B | 4695 — Direito Penal - Legislação Especial > Crimes Tributários | proposta_fundamentada |
| [Q0182](leitura/Q0181-Q0240.md#q0182) | indeterminada | 5062 — Penal | alternativa_indeterminada |
| [Q0183](leitura/Q0181-Q0240.md#q0183) | C | 5561 — Processo Penal > Recursos em Espécies > Recurso em sentido estrito (RESE) | proposta_com_ressalva |
| [Q0184](leitura/Q0181-Q0240.md#q0184) | E | 4708 — Direito Penal - Legislação Especial > Tráfico de Drogas | proposta_fundamentada |
| [Q0185](leitura/Q0181-Q0240.md#q0185) | E | 4703 — Direito Penal - Legislação Especial > Lei de Execução Penal | proposta_fundamentada |
| [Q0186](leitura/Q0181-Q0240.md#q0186) | B | 5202 — Penal > Teoria da Pena > Primeira Fase da Dosimetria: Circunstâncias Judiciais | proposta_fundamentada |
| [Q0187](leitura/Q0181-Q0240.md#q0187) | C | 5201 — Penal > Teoria da Pena > Penas Privativas de Liberdade | proposta_fundamentada |
| [Q0188](leitura/Q0181-Q0240.md#q0188) | A | 5229 — Penal > Teoria do Crime: Ilicitude > Conceito e Elementos da Ilicitude | proposta_com_ressalva |
| [Q0189](leitura/Q0181-Q0240.md#q0189) | C | 5472 — Processo Penal > Ação Penal > Ação Penal de Iniciativa Privada | proposta_com_ressalva |
| [Q0190](leitura/Q0181-Q0240.md#q0190) | A | 5540 — Processo Penal > Procedimento Sumaríssimo > Competência dos Juizados Especiais Criminais | proposta_fundamentada |
| [Q0191](leitura/Q0181-Q0240.md#q0191) | D | 5567 — Processo Penal > Recursos em Espécies > Carta Testemunhavel | proposta_fundamentada |
| [Q0192](leitura/Q0181-Q0240.md#q0192) | A | 5091 — Penal > Dos Crimes Contra a Administração Pública > Concussão e Excesso de Exação | proposta_fundamentada |
| [Q0193](leitura/Q0181-Q0240.md#q0193) | C | 5557 — Processo Penal > Provas em Espécies > Colaboração Premiada | proposta_fundamentada |
| [Q0194](leitura/Q0181-Q0240.md#q0194) | A | 5089 — Penal > Dos Crimes Contra a Administração Pública > Peculato e Peculato Mediante Erro de Outrem | proposta_fundamentada |
| [Q0195](leitura/Q0181-Q0240.md#q0195) | D | 4373 — Criminologia > Etapas Evolutivas e Escolas Criminológicas > Escolas Crimonológicas | proposta_com_fonte_pendente |
| [Q0196](leitura/Q0181-Q0240.md#q0196) | A | 4388 — Criminologia > Teorias Sociológicas Explicativas da Criminalidade > Teorias Criminológicas em Espécie | proposta_com_fonte_pendente |
| [Q0197](leitura/Q0181-Q0240.md#q0197) | E | 5482 — Processo Penal > Competência > Competência em Razão da Matéria | proposta_fundamentada |
| [Q0198](leitura/Q0181-Q0240.md#q0198) | D | 5073 — Penal > Concurso de Pessoas > Autoria Mediata, Colateral e Coautoria | proposta_com_fonte_pendente |
| [Q0199](leitura/Q0181-Q0240.md#q0199) | B | 5219 — Penal > Teoria do Crime: Fato Típico > Conceito, Sujeito e Objeto do Crime | proposta_com_fonte_pendente |
| [Q0200](leitura/Q0181-Q0240.md#q0200) | E | 4705 — Direito Penal - Legislação Especial > Organizações Criminosas | proposta_com_ressalva |
| [Q0201](leitura/Q0181-Q0240.md#q0201) | C | 5103 — Penal > Dos Crimes Contra a Dignidade Sexual > Estupro e Estupro de Vulnerável | proposta_com_ressalva |
| [Q0202](leitura/Q0181-Q0240.md#q0202) | C | 5224 — Penal > Teoria do Crime: Fato Típico > Erro de Tipo | proposta_fundamentada |
| [Q0203](leitura/Q0181-Q0240.md#q0203) | C | 4702 — Direito Penal - Legislação Especial > Lavagem de Dinheiro | proposta_fundamentada |
| [Q0204](leitura/Q0181-Q0240.md#q0204) | C | 5507 — Processo Penal > Lei Processual no Tempo e no Espaço > Lei processual no Tempo | proposta_com_ressalva |
| [Q0205](leitura/Q0181-Q0240.md#q0205) | A | 5567 — Processo Penal > Recursos em Espécies > Carta Testemunhavel | proposta_com_ressalva |
| [Q0206](leitura/Q0181-Q0240.md#q0206) | B | 5583 — Processo Penal > Sujeitos do Processo | proposta_com_ressalva |
| [Q0207](leitura/Q0181-Q0240.md#q0207) | C | 4703 — Direito Penal - Legislação Especial > Lei de Execução Penal | proposta_com_ressalva |
| [Q0208](leitura/Q0181-Q0240.md#q0208) | E | 5074 — Penal > Concurso de Pessoas > Participação | proposta_fundamentada |
| [Q0209](leitura/Q0181-Q0240.md#q0209) | C | 5500 — Processo Penal > Inquérito Policial > Procedimento do Inquérito Policial | proposta_fundamentada |
| [Q0210](leitura/Q0181-Q0240.md#q0210) | B | 4697 — Direito Penal - Legislação Especial > Estatuto do Desarmamento | proposta_com_ressalva |
| [Q0211](leitura/Q0181-Q0240.md#q0211) | A | 5583 — Processo Penal > Sujeitos do Processo | proposta_fundamentada |
| [Q0212](leitura/Q0181-Q0240.md#q0212) | E | 5488 — Processo Penal > Comunicação dos Atos Processuais > Citação e Contagem dos Prazos | proposta_fundamentada |
| [Q0213](leitura/Q0181-Q0240.md#q0213) | C | 4708 — Direito Penal - Legislação Especial > Tráfico de Drogas | proposta_fundamentada |
| [Q0214](leitura/Q0181-Q0240.md#q0214) | D | 5494 — Processo Penal > Das Questões e Processos Incidentes > Exceção de Litispendência e de Coisa Julgada | proposta_fundamentada |
| [Q0215](leitura/Q0181-Q0240.md#q0215) | A | 5201 — Penal > Teoria da Pena > Penas Privativas de Liberdade | proposta_fundamentada |
| [Q0216](leitura/Q0181-Q0240.md#q0216) | A | 4701 — Direito Penal - Legislação Especial > Juizado Especial Criminal | proposta_fundamentada |
| [Q0217](leitura/Q0181-Q0240.md#q0217) | D | 4372 — Criminologia > Etapas Evolutivas e Escolas Criminológicas > Etapas Evolutivas da Criminologia (Antiguidade, Idade Média e Idade Moderna) | proposta_com_fonte_pendente |
| [Q0218](leitura/Q0181-Q0240.md#q0218) | E | 5518 — Processo Penal > Prisões em Espécie > Prisão em Flagrante | proposta_fundamentada |
| [Q0219](leitura/Q0181-Q0240.md#q0219) | indeterminada | 5074 — Penal > Concurso de Pessoas > Participação | alternativa_indeterminada |
| [Q0220](leitura/Q0181-Q0240.md#q0220) | C | 5501 — Processo Penal > Inquérito Policial > Conclusão e Arquivamento do Inquérito Policial | proposta_fundamentada |
| [Q0221](leitura/Q0181-Q0240.md#q0221) | indeterminada | 5199 — Penal > Teoria da Pena | alternativa_indeterminada |
| [Q0222](leitura/Q0181-Q0240.md#q0222) | C | 4375 — Criminologia > Política Criminal > Correntes da Política Criminal | proposta_com_fonte_pendente |
| [Q0223](leitura/Q0181-Q0240.md#q0223) | E | 5086 — Penal > Dos Crimes Contra a Administração Judicial > Outros crimes contra a Administração Judicial | proposta_fundamentada |
| [Q0224](leitura/Q0181-Q0240.md#q0224) | C | 5203 — Penal > Teoria da Pena > Segunda Fase da Dosimetria: Agravantes e Atenuantes | proposta_fundamentada |
| [Q0225](leitura/Q0181-Q0240.md#q0225) | E | 5478 — Processo Penal > Ações Autônomas de Impugnação > Revisão Criminal | proposta_fundamentada |
| [Q0226](leitura/Q0181-Q0240.md#q0226) | D | 5544 — Processo Penal > Provas em Espécies > Cadeia de Custódia | proposta_fundamentada |
| [Q0227](leitura/Q0181-Q0240.md#q0227) | D | 5103 — Penal > Dos Crimes Contra a Dignidade Sexual > Estupro e Estupro de Vulnerável | proposta_fundamentada |
| [Q0228](leitura/Q0181-Q0240.md#q0228) | D | 4703 — Direito Penal - Legislação Especial > Lei de Execução Penal | proposta_fundamentada |
| [Q0229](leitura/Q0181-Q0240.md#q0229) | C | 5519 — Processo Penal > Prisões em Espécie > Prisão Preventiva | proposta_fundamentada |
| [Q0230](leitura/Q0181-Q0240.md#q0230) | B | 5214 — Penal > Teoria do Crime: Culpabilidade > Erro de Proibição | proposta_fundamentada |
| [Q0231](leitura/Q0181-Q0240.md#q0231) | A | 5224 — Penal > Teoria do Crime: Fato Típico > Erro de Tipo | proposta_fundamentada |
| [Q0232](leitura/Q0181-Q0240.md#q0232) | A | 5080 — Penal > Dos Crimes Contra a Administração Judicial > Denunciação Caluniosa, Comunicação Falsa de Crime ou Contravenção e Autoacusação Falsa | proposta_fundamentada |
| [Q0233](leitura/Q0181-Q0240.md#q0233) | B | 5178 — Penal > Iter Criminis > Desistência Voluntária, Arrependimento Eficaz e Arrependimento posterior | proposta_fundamentada |
| [Q0234](leitura/Q0181-Q0240.md#q0234) | B | 4382 — Criminologia > Teoria Geral da Criminologia > Métodos e funções da Criminologia | proposta_com_fonte_pendente |
| [Q0235](leitura/Q0181-Q0240.md#q0235) | E | 5561 — Processo Penal > Recursos em Espécies > Recurso em sentido estrito (RESE) | proposta_fundamentada |
| [Q0236](leitura/Q0181-Q0240.md#q0236) | indeterminada | 5582 — Processo Penal > Sistemas e Princípios Processuais Penais > Princípios do Processo Penal | alternativa_indeterminada |
| [Q0237](leitura/Q0181-Q0240.md#q0237) | A | 5178 — Penal > Iter Criminis > Desistência Voluntária, Arrependimento Eficaz e Arrependimento posterior | proposta_fundamentada |
| [Q0238](leitura/Q0181-Q0240.md#q0238) | C | 5523 — Processo Penal > Prisões em Espécie > Liberdade Provisória | proposta_fundamentada |
| [Q0239](leitura/Q0181-Q0240.md#q0239) | D | 5207 — Penal > Teoria da Pena > Suspensão Condicional da Pena | proposta_com_ressalva |
| [Q0240](leitura/Q0181-Q0240.md#q0240) | A | 5500 — Processo Penal > Inquérito Policial > Procedimento do Inquérito Policial | proposta_com_ressalva |
| [Q0241](leitura/Q0241-Q0300.md#q0241) | E | 5224 — Penal > Teoria do Crime: Fato Típico > Erro de Tipo | proposta_com_ressalva |
| [Q0242](leitura/Q0241-Q0300.md#q0242) | D | 5514 — Processo Penal > Parte Geral dos Recursos > Pressupostos Objetivos e Subjetivos de Admissibilidade Recursal | proposta_fundamentada |
| [Q0243](leitura/Q0241-Q0300.md#q0243) | A | 5178 — Penal > Iter Criminis > Desistência Voluntária, Arrependimento Eficaz e Arrependimento posterior | proposta_fundamentada |
| [Q0244](leitura/Q0241-Q0300.md#q0244) | B | 5091 — Penal > Dos Crimes Contra a Administração Pública > Concussão e Excesso de Exação | proposta_fundamentada |
| [Q0245](leitura/Q0241-Q0300.md#q0245) | A | 5187 — Penal > Prescrição > Contagem dos Prazos e Causas Suspensivas e Interruptivas da Prescrição | proposta_com_ressalva |
| [Q0246](leitura/Q0241-Q0300.md#q0246) | A | 5527 — Processo Penal > Procedimento do Tribunal do Júri > Impronúncia, Desclassificação, Absolvição Sumária e Pronúncia | proposta_fundamentada |
| [Q0247](leitura/Q0241-Q0300.md#q0247) | E | 5502 — Processo Penal > Inquérito Policial > Acordo de Não Persecução Penal | proposta_com_ressalva |
| [Q0248](leitura/Q0241-Q0300.md#q0248) | C | 5087 — Penal > Dos Crimes Contra a Administração Pública | proposta_fundamentada |
| [Q0249](leitura/Q0241-Q0300.md#q0249) | C | 5492 — Processo Penal > Das Questões e Processos Incidentes > Exceção de Suspeição, de Impedimento ou de Incompatibilidade | proposta_fundamentada |
| [Q0250](leitura/Q0241-Q0300.md#q0250) | D | 5201 — Penal > Teoria da Pena > Penas Privativas de Liberdade | proposta_com_ressalva |
| [Q0251](leitura/Q0241-Q0300.md#q0251) | D | 5191 — Penal > Punibilidade | proposta_fundamentada |
| [Q0252](leitura/Q0241-Q0300.md#q0252) | B | 5206 — Penal > Teoria da Pena > Pena de Multa | proposta_fundamentada |
| [Q0253](leitura/Q0241-Q0300.md#q0253) | B | 4373 — Criminologia > Etapas Evolutivas e Escolas Criminológicas > Escolas Crimonológicas | proposta_com_fonte_pendente |
| [Q0254](leitura/Q0241-Q0300.md#q0254) | C | 4704 — Direito Penal - Legislação Especial > Lei Maria da Penha | proposta_com_ressalva |
| [Q0255](leitura/Q0241-Q0300.md#q0255) | C | 5213 — Penal > Teoria do Crime: Culpabilidade > Inimputabilidade | proposta_fundamentada |
| [Q0256](leitura/Q0241-Q0300.md#q0256) | E | 5224 — Penal > Teoria do Crime: Fato Típico > Erro de Tipo | proposta_fundamentada |
| [Q0257](leitura/Q0241-Q0300.md#q0257) | D | 5227 — Penal > Teoria do Crime: Fato Típico > Tipicidade | proposta_fundamentada |
| [Q0258](leitura/Q0241-Q0300.md#q0258) | E | 5545 — Processo Penal > Provas em Espécies > Exame de Corpo de Delito | proposta_fundamentada |
| [Q0259](leitura/Q0241-Q0300.md#q0259) | C | 5183 — Penal > Lei Penal no Tempo e no Espaço > Conflito Aparente de Normas | proposta_com_fonte_pendente |
| [Q0260](leitura/Q0241-Q0300.md#q0260) | E | 4375 — Criminologia > Política Criminal > Correntes da Política Criminal | proposta_com_fonte_pendente |
| [Q0261](leitura/Q0241-Q0300.md#q0261) | A | 5136 — Penal > Dos Crimes contra a Organização do Trabalho, a Propriedade Imaterial e ao Sentimento Religioso > Dos Crimescontra a Propriedade Imaterial | proposta_com_ressalva |
| [Q0262](leitura/Q0241-Q0300.md#q0262) | E | 4703 — Direito Penal - Legislação Especial > Lei de Execução Penal | proposta_com_fonte_pendente |
| [Q0263](leitura/Q0241-Q0300.md#q0263) | C | 5492 — Processo Penal > Das Questões e Processos Incidentes > Exceção de Suspeição, de Impedimento ou de Incompatibilidade | proposta_fundamentada |
| [Q0264](leitura/Q0241-Q0300.md#q0264) | C | 5108 — Penal > Dos Crimes Contra a Dignidade Sexual > Corrupção de Menores | proposta_com_ressalva |
| [Q0265](leitura/Q0241-Q0300.md#q0265) | C | 5186 — Penal > Prescrição > Conceito, Regras Gerais e Fundamentos da Prescrição | proposta_fundamentada |
| [Q0266](leitura/Q0241-Q0300.md#q0266) | A | 5482 — Processo Penal > Competência > Competência em Razão da Matéria | proposta_com_ressalva |
| [Q0267](leitura/Q0241-Q0300.md#q0267) | A | 4708 — Direito Penal - Legislação Especial > Tráfico de Drogas | proposta_fundamentada |
| [Q0268](leitura/Q0241-Q0300.md#q0268) | indeterminada | 5118 — Penal > Dos Crimes Contra a Fé Pública e de Falsidade Documental > Da Falsidade Documental | alternativa_indeterminada |
| [Q0269](leitura/Q0241-Q0300.md#q0269) | C | 4375 — Criminologia > Política Criminal > Correntes da Política Criminal | proposta_com_fonte_pendente |
| [Q0270](leitura/Q0241-Q0300.md#q0270) | D | 5091 — Penal > Dos Crimes Contra a Administração Pública > Concussão e Excesso de Exação | proposta_fundamentada |
| [Q0271](leitura/Q0241-Q0300.md#q0271) | B | 5562 — Processo Penal > Recursos em Espécies > Apelação | proposta_fundamentada |
| [Q0272](leitura/Q0241-Q0300.md#q0272) | A | 4703 — Direito Penal - Legislação Especial > Lei de Execução Penal | proposta_com_ressalva |
| [Q0273](leitura/Q0241-Q0300.md#q0273) | A | 5089 — Penal > Dos Crimes Contra a Administração Pública > Peculato e Peculato Mediante Erro de Outrem | proposta_fundamentada |
| [Q0274](leitura/Q0241-Q0300.md#q0274) | C | 5160 — Penal > Dos Crimes Contra o Patrimônio > Roubo | proposta_fundamentada |
| [Q0275](leitura/Q0241-Q0300.md#q0275) | D | 5540 — Processo Penal > Procedimento Sumaríssimo > Competência dos Juizados Especiais Criminais | proposta_fundamentada |
| [Q0276](leitura/Q0241-Q0300.md#q0276) | E | 5554 — Processo Penal > Provas em Espécies > Busca e Apreensão | proposta_com_ressalva |
| [Q0277](leitura/Q0241-Q0300.md#q0277) | A | 4696 — Direito Penal - Legislação Especial > Estaturo de Idoso - Crimes | proposta_com_ressalva |
| [Q0278](leitura/Q0241-Q0300.md#q0278) | E | 5542 — Processo Penal > Procedimento Sumaríssimo > Suspensão Condicional do Processo | proposta_fundamentada |
| [Q0279](leitura/Q0241-Q0300.md#q0279) | C | 5188 — Penal > Prescrição > Prescrição da Pretensão Punitiva | proposta_com_ressalva |
| [Q0280](leitura/Q0241-Q0300.md#q0280) | C | 5122 — Penal > Dos Crimes Contra a Honra > Calúnia | proposta_com_ressalva |
| [Q0281](leitura/Q0241-Q0300.md#q0281) | B | 5555 — Processo Penal > Provas em Espécies > Interceptação Telefônica e Quebra do Sigilo de Dados Telefônicos | proposta_fundamentada |
| [Q0282](leitura/Q0241-Q0300.md#q0282) | E | 4704 — Direito Penal - Legislação Especial > Lei Maria da Penha | proposta_fundamentada |
| [Q0283](leitura/Q0241-Q0300.md#q0283) | E | 5496 — Processo Penal > Das Questões e Processos Incidentes > Medidas Assecuratórias: Sequestro, Hipoteca Legal e Arresto | proposta_fundamentada |
| [Q0284](leitura/Q0241-Q0300.md#q0284) | D | 5224 — Penal > Teoria do Crime: Fato Típico > Erro de Tipo | proposta_com_ressalva |
| [Q0285](leitura/Q0241-Q0300.md#q0285) | A | 4376 — Criminologia > Política Criminal > Direito Penal do Inimigo | proposta_com_fonte_pendente |
| [Q0286](leitura/Q0241-Q0300.md#q0286) | C | 5202 — Penal > Teoria da Pena > Primeira Fase da Dosimetria: Circunstâncias Judiciais | proposta_fundamentada |
| [Q0287](leitura/Q0241-Q0300.md#q0287) | B | 5230 — Penal > Teoria do Crime: Ilicitude > Estado de Necessidade | proposta_fundamentada |
| [Q0288](leitura/Q0241-Q0300.md#q0288) | C | 5062 — Penal | proposta_com_ressalva |
| [Q0289](leitura/Q0241-Q0300.md#q0289) | E | 4704 — Direito Penal - Legislação Especial > Lei Maria da Penha | proposta_com_ressalva |
| [Q0290](leitura/Q0241-Q0300.md#q0290) | A | 4701 — Direito Penal - Legislação Especial > Juizado Especial Criminal | proposta_fundamentada |
| [Q0291](leitura/Q0241-Q0300.md#q0291) | C | 4708 — Direito Penal - Legislação Especial > Tráfico de Drogas | proposta_com_ressalva |
| [Q0292](leitura/Q0241-Q0300.md#q0292) | B | 4374 — Criminologia > Política Criminal | proposta_com_fonte_pendente |
| [Q0293](leitura/Q0241-Q0300.md#q0293) | indeterminada | 5189 — Penal > Prescrição > Prescrição da Pretensão Executória | alternativa_indeterminada |
| [Q0294](leitura/Q0241-Q0300.md#q0294) | C | 5212 — Penal > Teoria do Crime: Culpabilidade > Conceito e Elementos da Culpabilidade | proposta_com_fonte_pendente |
| [Q0295](leitura/Q0241-Q0300.md#q0295) | A | 5489 — Processo Penal > Comunicação dos Atos Processuais > Intimação e Contagem dos Prazos | proposta_com_fonte_pendente |
| [Q0296](leitura/Q0241-Q0300.md#q0296) | E | 5472 — Processo Penal > Ação Penal > Ação Penal de Iniciativa Privada | proposta_fundamentada |
| [Q0297](leitura/Q0241-Q0300.md#q0297) | E | 4695 — Direito Penal - Legislação Especial > Crimes Tributários | proposta_com_fonte_pendente |
| [Q0298](leitura/Q0241-Q0300.md#q0298) | E | 4694 — Direito Penal - Legislação Especial > Crimes previstos no CDC | proposta_fundamentada |
| [Q0299](leitura/Q0241-Q0300.md#q0299) | D | 4388 — Criminologia > Teorias Sociológicas Explicativas da Criminalidade > Teorias Criminológicas em Espécie | proposta_com_fonte_pendente |
| [Q0300](leitura/Q0241-Q0300.md#q0300) | A | 5084 — Penal > Dos Crimes Contra a Administração Judicial > Favorecimento Pessoal e Real | proposta_com_ressalva |
| [Q0301](leitura/Q0301-Q0359.md#q0301) | D | 5197 — Penal > Punibilidade > Perdão Judicial | proposta_fundamentada |
| [Q0302](leitura/Q0301-Q0359.md#q0302) | A | 5224 — Penal > Teoria do Crime: Fato Típico > Erro de Tipo | proposta_fundamentada |
| [Q0303](leitura/Q0301-Q0359.md#q0303) | D | 5182 — Penal > Lei Penal no Tempo e no Espaço > Lei penal no Espaço | proposta_fundamentada |
| [Q0304](leitura/Q0301-Q0359.md#q0304) | D | 4701 — Direito Penal - Legislação Especial > Juizado Especial Criminal | proposta_fundamentada |
| [Q0305](leitura/Q0301-Q0359.md#q0305) | E | 5471 — Processo Penal > Ação Penal > Ação Penal Pública Condicionada | proposta_com_ressalva |
| [Q0306](leitura/Q0301-Q0359.md#q0306) | B | 5146 — Penal > Dos Crimes Contra a Saúde Pública e Dos Crimes Contra à Paz Pública > Crimes Contra à Paz Pública | proposta_fundamentada |
| [Q0307](leitura/Q0301-Q0359.md#q0307) | E | 4707 — Direito Penal - Legislação Especial > Tortura | proposta_com_ressalva |
| [Q0308](leitura/Q0301-Q0359.md#q0308) | D | 5501 — Processo Penal > Inquérito Policial > Conclusão e Arquivamento do Inquérito Policial | proposta_fundamentada |
| [Q0309](leitura/Q0301-Q0359.md#q0309) | C | 4688 — Direito Penal - Legislação Especial > Crimes contra o meio ambiente | proposta_fundamentada |
| [Q0310](leitura/Q0301-Q0359.md#q0310) | D | 5507 — Processo Penal > Lei Processual no Tempo e no Espaço > Lei processual no Tempo | proposta_fundamentada |
| [Q0311](leitura/Q0301-Q0359.md#q0311) | C | 5488 — Processo Penal > Comunicação dos Atos Processuais > Citação e Contagem dos Prazos | proposta_com_ressalva |
| [Q0312](leitura/Q0301-Q0359.md#q0312) | C | 4384 — Criminologia > Teorias Legitimidoras da Pena | proposta_com_fonte_pendente |
| [Q0313](leitura/Q0301-Q0359.md#q0313) | C | 5209 — Penal > Teoria da Pena > Efeitos da Condenação Penais e Extrapenais | proposta_fundamentada |
| [Q0314](leitura/Q0301-Q0359.md#q0314) | A | 5477 — Processo Penal > Ações Autônomas de Impugnação > Habeas Corpus | proposta_fundamentada |
| [Q0315](leitura/Q0301-Q0359.md#q0315) | C | 5189 — Penal > Prescrição > Prescrição da Pretensão Executória | proposta_com_ressalva |
| [Q0316](leitura/Q0301-Q0359.md#q0316) | A | 5224 — Penal > Teoria do Crime: Fato Típico > Erro de Tipo | proposta_fundamentada |
| [Q0317](leitura/Q0301-Q0359.md#q0317) | C | 5198 — Penal > Punibilidade > Decadência | proposta_com_ressalva |
| [Q0318](leitura/Q0301-Q0359.md#q0318) | C | 5150 — Penal > Dos Crimes Contra a Vida > Homicídio | proposta_fundamentada |
| [Q0319](leitura/Q0301-Q0359.md#q0319) | D | 5073 — Penal > Concurso de Pessoas > Autoria Mediata, Colateral e Coautoria | proposta_com_fonte_pendente |
| [Q0320](leitura/Q0301-Q0359.md#q0320) | B | 5550 — Processo Penal > Provas em Espécies > Prova Testemunhal | proposta_com_fonte_pendente |
| [Q0321](leitura/Q0301-Q0359.md#q0321) | A | 5073 — Penal > Concurso de Pessoas > Autoria Mediata, Colateral e Coautoria | proposta_fundamentada |
| [Q0322](leitura/Q0301-Q0359.md#q0322) | B | 5569 — Processo Penal > Recursos em Espécies > Recursos no Âmbito dos Juizados Especiais | proposta_com_ressalva |
| [Q0323](leitura/Q0301-Q0359.md#q0323) | indeterminada | 5543 — Processo Penal > Provas em Espécies | alternativa_indeterminada |
| [Q0324](leitura/Q0301-Q0359.md#q0324) | indeterminada | 5199 — Penal > Teoria da Pena | alternativa_indeterminada |
| [Q0325](leitura/Q0301-Q0359.md#q0325) | D | 5467 — Processo Penal > Ação Penal > Características e Condições da Ação Penal | proposta_com_ressalva |
| [Q0326](leitura/Q0301-Q0359.md#q0326) | C | 4708 — Direito Penal - Legislação Especial > Tráfico de Drogas | proposta_fundamentada |
| [Q0327](leitura/Q0301-Q0359.md#q0327) | A | 5203 — Penal > Teoria da Pena > Segunda Fase da Dosimetria: Agravantes e Atenuantes | proposta_com_ressalva |
| [Q0328](leitura/Q0301-Q0359.md#q0328) | E | 4382 — Criminologia > Teoria Geral da Criminologia > Métodos e funções da Criminologia | proposta_com_fonte_pendente |
| [Q0329](leitura/Q0301-Q0359.md#q0329) | A | 5557 — Processo Penal > Provas em Espécies > Colaboração Premiada | proposta_com_ressalva |
| [Q0330](leitura/Q0301-Q0359.md#q0330) | A | 5501 — Processo Penal > Inquérito Policial > Conclusão e Arquivamento do Inquérito Policial | proposta_fundamentada |
| [Q0331](leitura/Q0301-Q0359.md#q0331) | indeterminada | 5477 — Processo Penal > Ações Autônomas de Impugnação > Habeas Corpus | alternativa_indeterminada |
| [Q0332](leitura/Q0301-Q0359.md#q0332) | A | 5541 — Processo Penal > Procedimento Sumaríssimo > Transação Penal | proposta_com_ressalva |
| [Q0333](leitura/Q0301-Q0359.md#q0333) | indeterminada | 4373 — Criminologia > Etapas Evolutivas e Escolas Criminológicas > Escolas Crimonológicas | alternativa_indeterminada |
| [Q0334](leitura/Q0301-Q0359.md#q0334) | C | 4381 — Criminologia > Teoria Geral da Criminologia > Conceito e objeto da Criminologia | proposta_com_fonte_pendente |
| [Q0335](leitura/Q0301-Q0359.md#q0335) | A | 5222 — Penal > Teoria do Crime: Fato Típico > Crime Doloso e Culposo | proposta_com_fonte_pendente |
| [Q0336](leitura/Q0301-Q0359.md#q0336) | D | 5159 — Penal > Dos Crimes Contra o Patrimônio > Furto | proposta_fundamentada |
| [Q0337](leitura/Q0301-Q0359.md#q0337) | D | 4684 — Direito Penal - Legislação Especial > Abuso de Autoridade | proposta_fundamentada |
| [Q0338](leitura/Q0301-Q0359.md#q0338) | D | 5595 — Processo Penal > Teoria Geral das Provas > Princípios Relativos à Prova Penal | proposta_fundamentada |
| [Q0339](leitura/Q0301-Q0359.md#q0339) | B | 5527 — Processo Penal > Procedimento do Tribunal do Júri > Impronúncia, Desclassificação, Absolvição Sumária e Pronúncia | proposta_fundamentada |
| [Q0340](leitura/Q0301-Q0359.md#q0340) | C | 5071 — Penal > Concurso de Pessoas | proposta_fundamentada |
| [Q0341](leitura/Q0301-Q0359.md#q0341) | D | 5166 — Penal > Dos Crimes Contra o Patrimônio > Estelionato | proposta_fundamentada |
| [Q0342](leitura/Q0301-Q0359.md#q0342) | D | 5546 — Processo Penal > Provas em Espécies > Perícia | proposta_fundamentada |
| [Q0343](leitura/Q0301-Q0359.md#q0343) | B | 5195 — Penal > Punibilidade > Perempção | proposta_com_ressalva |
| [Q0344](leitura/Q0301-Q0359.md#q0344) | D | 4688 — Direito Penal - Legislação Especial > Crimes contra o meio ambiente | proposta_fundamentada |
| [Q0345](leitura/Q0301-Q0359.md#q0345) | D | 5103 — Penal > Dos Crimes Contra a Dignidade Sexual > Estupro e Estupro de Vulnerável | proposta_com_ressalva |
| [Q0346](leitura/Q0301-Q0359.md#q0346) | E | 5583 — Processo Penal > Sujeitos do Processo | proposta_fundamentada |
| [Q0347](leitura/Q0301-Q0359.md#q0347) | B | 5207 — Penal > Teoria da Pena > Suspensão Condicional da Pena | proposta_com_ressalva |
| [Q0348](leitura/Q0301-Q0359.md#q0348) | indeterminada | 5093 — Penal > Dos Crimes Contra a Administração Pública > Corrupção Ativa | alternativa_indeterminada |
| [Q0349](leitura/Q0301-Q0359.md#q0349) | C | 5178 — Penal > Iter Criminis > Desistência Voluntária, Arrependimento Eficaz e Arrependimento posterior | proposta_fundamentada |
| [Q0350](leitura/Q0301-Q0359.md#q0350) | C | 4702 — Direito Penal - Legislação Especial > Lavagem de Dinheiro | proposta_fundamentada |
| [Q0351](leitura/Q0301-Q0359.md#q0351) | E | 5118 — Penal > Dos Crimes Contra a Fé Pública e de Falsidade Documental > Da Falsidade Documental | proposta_fundamentada |
| [Q0352](leitura/Q0301-Q0359.md#q0352) | A | 5515 — Processo Penal > Parte Geral dos Recursos > Efeito dos Recursos | proposta_fundamentada |
| [Q0353](leitura/Q0301-Q0359.md#q0353) | B | 5535 — Processo Penal > Procedimento Ordinário > Audiência de Instrução e Julgamento | proposta_fundamentada |
| [Q0354](leitura/Q0301-Q0359.md#q0354) | C | 5227 — Penal > Teoria do Crime: Fato Típico > Tipicidade | proposta_com_fonte_pendente |
| [Q0355](leitura/Q0301-Q0359.md#q0355) | E | 4708 — Direito Penal - Legislação Especial > Tráfico de Drogas | proposta_com_ressalva |
| [Q0356](leitura/Q0301-Q0359.md#q0356) | D | 5066 — Penal > Concurso de Crimes | proposta_fundamentada |
| [Q0357](leitura/Q0301-Q0359.md#q0357) | A | 5135 — Penal > Dos Crimes contra a Organização do Trabalho, a Propriedade Imaterial e ao Sentimento Religioso > Dos Crimes Contra a Organização do Trabalho | proposta_fundamentada |
| [Q0358](leitura/Q0301-Q0359.md#q0358) | C | 5133 — Penal > Dos Crimes Contra a Liberdade Pessoal > Dos Crimes contra a Inviolabilidade do Domicílio, Contra a Inviolabilidade da Correspondência e Contra a Inviolabilidade dos Segredos | proposta_com_ressalva |
| [Q0359](leitura/Q0301-Q0359.md#q0359) | E | 4696 — Direito Penal - Legislação Especial > Estaturo de Idoso - Crimes | proposta_com_ressalva |
