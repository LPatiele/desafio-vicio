# Inventário dos experimentos

Retrato iniciado em 2026-10-18T21:40:33.805592-03:00. Conclusão da coleta: 2026-10-18T21:40:34.170618-03:00. Horário de Fortaleza.

Leitura offline. Comparação de tema central com referências próprias v1 e v2: exato ou ancestral/descendente; irmãos rejeitados. Nenhuma inferência, reexecução de decisão ou alteração de checkpoint. Registros ativos podem avançar após a leitura. Métricas calculadas das decisões salvas, sem validar novamente a política histórica.

As contagens vêm de todos os registros da condição; `last-run.json` pode conter somente a última retomada. Pendência não equivale a revisão nem a erro de tema. Cobertura usa o total selecionado (registros); para o case integral, o denominador é 359. Ensaios interrompidos v8 estão listados e não devem ser somados às versões r2.

| Condição | N | Propostas | Pareceres | Decisões | Publicar | Revisar | Fora | Pendentes | Ramo v1 | Ramo v2 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| piloto-v1 | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 30 | — | — |
| piloto-20-v3 | 20 | 0 | 0 | 0 | 0 | 0 | 0 | 20 | — | — |
| piloto-20-v3-sem-raciocinio | 20 | 20 | 20 | 20 | 20 | 0 | 0 | 0 | 13/20 | 14/20 |
| piloto-2x10-v3-raciocinio | 20 | 20 | 20 | 19 | 19 | 0 | 0 | 1 | 13/19 | 13/19 |
| piloto-5x10-v3-juiz-nemotron35 | 50 | 50 | 50 | 49 | 39 | 9 | 1 | 1 | 30/39 | 30/39 |
| piloto-5x10-v3-invertido-nemotron35 | 50 | 50 | 50 | 50 | 45 | 5 | 0 | 0 | 35/45 | 35/45 |
| piloto-5x10-v2-invertido-nemotron35 | 50 | 39 | 39 | 39 | 11 | 27 | 1 | 11 | 9/11 | 9/11 |
| piloto-5x10-v2-juiz-nemotron35 | 50 | 49 | 49 | 48 | 38 | 10 | 0 | 2 | 29/38 | 29/38 |
| individual-v3-invertido-50 | 50 | 50 | 49 | 49 | 38 | 8 | 3 | 1 | 28/38 | 28/38 |
| contexto-api-v5-q0001 | 1 | 1 | 1 | 1 | 0 | 1 | 0 | 0 | — | — |
| local-penal50-v7 | 50 | 50 | 50 | 49 | 28 | 20 | 1 | 1 | 24/28 | 24/28 |
| local-penal50-v8-auto | 50 | 50 | 2 | 2 | 1 | 1 | 0 | 48 | 1/1 | 1/1 |
| local-penal50-v8-tools | 50 | 50 | 2 | 2 | 1 | 1 | 0 | 48 | 1/1 | 1/1 |
| local-penal50-v8-tools-r2 | 50 | 50 | 49 | 47 | 36 | 11 | 0 | 3 | 29/36 | 29/36 |
| local-penal50-v8-auto-r2 | 50 | 50 | 49 | 48 | 27 | 19 | 2 | 2 | 23/27 | 23/27 |
| local-penal50-v9-classifier-tools | 50 | 50 | 49 | 49 | 31 | 17 | 1 | 1 | 26/31 | 26/31 |
| local-penal50-v9-control | 50 | 50 | 50 | 50 | 27 | 20 | 3 | 0 | 23/27 | 23/27 |
| pagos-v10-gemini-openai | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | — | — |
| pagos-v10-juiz-isolado | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | — | — |
| gemini-flash-v11-piloto | 10 | 10 | 10 | 10 | 7 | 3 | 0 | 0 | 7/7 | 7/7 |
| gemini-flash-v13-livros-359 | 359 | 11 | 10 | 10 | 9 | 1 | 0 | 349 | 7/9 | 8/9 |
| gemini35-v15-livros-359 | 359 | 2 | 1 | 1 | 1 | 0 | 0 | 358 | 1/1 | 1/1 |
| gemini35-v16-projeto2-359 | 359 | 181 | 180 | 180 | 152 | 26 | 2 | 179 | 130/152 | 130/152 |
| paid-v17/paid-v17-359/b30 | 359 | 161 | 161 | 161 | 131 | 30 | 0 | 198 | 111/131 | 112/131 |
| paid-v17/paid-v17-359/b20 | 359 | 46 | 27 | 27 | 22 | 5 | 0 | 332 | 20/22 | 20/22 |
| vertex-v18/vertex-v18-piloto-10/b10 | 10 | 10 | 10 | 10 | 7 | 3 | 0 | 0 | 5/7 | 6/7 |
| vertex-v18/vertex-v18-359/b20 | 359 | 123 | 122 | 122 | 96 | 26 | 0 | 237 | 83/96 | 83/96 |

## Modelos e versões por condição

### output/experiments/piloto-v1
- Classificador: `nvidia/nemotron-3-super-120b-a12b:free`; juiz: `dots-studio/dots-3-note-preview:free`.
- Prompts: `None` / `None`; lote registrado: 30.
- [Registros originais](../output/experiments/piloto-v1/records.json); SHA-256: `7aa0128f356a4ff52196e0ba1b60331ff89157866924282b707c34fdbb7ccb50`.

### output/experiments/piloto-20-v3
- Classificador: `nvidia/nemotron-3-super-120b-a12b:free`; juiz: `dots-studio/dots-3-note-preview:free`.
- Prompts: `classificador.v3.md` / `juiz.v3.md`; lote registrado: 20.
- [Registros originais](../output/experiments/piloto-20-v3/records.json); SHA-256: `78051c690de3f5affbbf5c8b3968600255e141a101637e9bd2096269bc083994`.

### output/experiments/piloto-20-v3-sem-raciocinio
- Classificador: `nvidia/nemotron-3-super-120b-a12b:free`; juiz: `dots-studio/dots-3-note-preview:free`.
- Prompts: `classificador.v3.md` / `juiz.v3.md`; lote registrado: 20.
- [Registros originais](../output/experiments/piloto-20-v3-sem-raciocinio/records.json); SHA-256: `e32d94fc14c11dae9fd6774b82830df064200431df8f2874d459a4a2eb4fe944`.

### output/experiments/piloto-2x10-v3-raciocinio
- Classificador: `nvidia/nemotron-3-super-120b-a12b:free`; juiz: `dots-studio/dots-3-note-preview:free`.
- Prompts: `classificador.v3.md` / `juiz.v3.md`; lote registrado: 10.
- [Registros originais](../output/experiments/piloto-2x10-v3-raciocinio/records.json); SHA-256: `183059188945fc891097129fd4dd728cefc7412b4795560f62a433ec6c8c8033`.

### output/experiments/piloto-5x10-v3-juiz-nemotron35
- Classificador: `nvidia/nemotron-3-super-120b-a12b:free`; juiz: `nvidia/nemotron-3.5-super-vl:free`.
- Prompts: `classificador.v3.md` / `juiz.v3.md`; lote registrado: 10.
- [Registros originais](../output/experiments/piloto-5x10-v3-juiz-nemotron35/records.json); SHA-256: `73ae5727ac242e300665699901c5d8cff836cb81c7b042c444aaac39448d2897`.

### output/experiments/piloto-5x10-v3-invertido-nemotron35
- Classificador: `nvidia/nemotron-3.5-super-vl:free`; juiz: `nvidia/nemotron-3-super-120b-a12b:free`.
- Prompts: `classificador.v3.md` / `juiz.v3.md`; lote registrado: 10.
- [Registros originais](../output/experiments/piloto-5x10-v3-invertido-nemotron35/records.json); SHA-256: `fa76924e7cf95e22fc8445198cd6970726b7787ffa536d8172ed2859e46e96d7`.

### output/experiments/piloto-5x10-v2-invertido-nemotron35
- Classificador: `nvidia/nemotron-3.5-super-vl:free`; juiz: `nvidia/nemotron-3-super-120b-a12b:free`.
- Prompts: `classificador.v2.md` / `juiz.v2.md`; lote registrado: 10.
- [Registros originais](../output/experiments/piloto-5x10-v2-invertido-nemotron35/records.json); SHA-256: `b5c0398fab57461d8a53d977a1763d69876a310296851497e6cc647a37e32d1c`.

### output/experiments/piloto-5x10-v2-juiz-nemotron35
- Classificador: `nvidia/nemotron-3-super-120b-a12b:free`; juiz: `nvidia/nemotron-3.5-super-vl:free`.
- Prompts: `classificador.v2.md` / `juiz.v2.md`; lote registrado: 10.
- [Registros originais](../output/experiments/piloto-5x10-v2-juiz-nemotron35/records.json); SHA-256: `3f9b759552382a92194f1540aa93586f6dbabd192355413457c50118d0fca4a5`.

### output/experiments/individual-v3-invertido-50
- Classificador: `nvidia/nemotron-3.5-super-vl:free`; juiz: `nvidia/nemotron-3-super-120b-a12b:free`.
- Prompts: `classificador.v3.md` / `juiz.v3.md`; lote registrado: 1.
- [Registros originais](../output/experiments/individual-v3-invertido-50/records.json); SHA-256: `c85c7cd5ff321825ba92faccce5c0921f7c09ea137594b8b7721c4bf615811ab`.

### output/experiments/contexto-api-v5-q0001
- Classificador: `nvidia/nemotron-3.5-super-vl:free`; juiz: `nvidia/nemotron-3-super-120b-a12b:free`.
- Prompts: `classificador.v3.md` / `juiz.v5-contexto.md`; lote registrado: 1.
- [Registros originais](../output/experiments/contexto-api-v5-q0001/records.json); SHA-256: `99040d5596f0f772b02afb4bd8571072aa7af5bc2a8701070b353472cecb189c`.

### output/experiments/local-penal50-v7
- Classificador: `nvidia/nemotron-3.5-super-vl:free`; juiz: `nvidia/nemotron-3-super-120b-a12b:free`.
- Prompts: `classificador.v3.md` / `juiz.v7-local.md`; lote registrado: 1.
- [Registros originais](../output/experiments/local-penal50-v7/records.json); SHA-256: `1abb674fab1a9a415df969b0a4440cdf97c179c2eb474c40216e0bae46fb99df`.

### output/experiments/local-penal50-v8-auto
- Classificador: `nvidia/nemotron-3.5-super-vl:free`; juiz: `nvidia/nemotron-3-super-120b-a12b:free`.
- Prompts: `classificador.v3.md` / `juiz.v8-local.md`; lote registrado: 1.
- [Registros originais](../output/experiments/local-penal50-v8-auto/records.json); SHA-256: `e3a75a494106b98a588d0ee7e4507261400cc6a6e6d141cd2d3929bb6b00df9e`.

### output/experiments/local-penal50-v8-tools
- Classificador: `nvidia/nemotron-3.5-super-vl:free`; juiz: `nvidia/nemotron-3-super-120b-a12b:free`.
- Prompts: `classificador.v3.md` / `juiz.v8-local.md`; lote registrado: 1.
- [Registros originais](../output/experiments/local-penal50-v8-tools/records.json); SHA-256: `d3a47fa66250f2705be36da845d067f4d244bdfc09acc1d32b72a0742c46d31d`.

### output/experiments/local-penal50-v8-tools-r2
- Classificador: `nvidia/nemotron-3.5-super-vl:free`; juiz: `nvidia/nemotron-3-super-120b-a12b:free`.
- Prompts: `classificador.v3.md` / `juiz.v8-local.md`; lote registrado: 1.
- [Registros originais](../output/experiments/local-penal50-v8-tools-r2/records.json); SHA-256: `5ed5bd438f12377bbe6f585c7166b9db4ffc095139b9e6e1da692aef9808f7db`.

### output/experiments/local-penal50-v8-auto-r2
- Classificador: `nvidia/nemotron-3.5-super-vl:free`; juiz: `nvidia/nemotron-3-super-120b-a12b:free`.
- Prompts: `classificador.v3.md` / `juiz.v8-local.md`; lote registrado: 1.
- [Registros originais](../output/experiments/local-penal50-v8-auto-r2/records.json); SHA-256: `8131374c24759df309dd8c0dacbbfe0201a328b24d553082d8568f2b6b908adc`.

### output/experiments/local-penal50-v9-classifier-tools
- Classificador: `nvidia/nemotron-3.5-super-vl:free`; juiz: `nvidia/nemotron-3-super-120b-a12b:free`.
- Prompts: `classificador.v9-local.md` / `juiz.v8-local.md`; lote registrado: 1.
- [Registros originais](../output/experiments/local-penal50-v9-classifier-tools/records.json); SHA-256: `77af4c1e65f7e4c7840e17e4be75849685ad817af4e68d7e3ba2e116b33f244d`.

### output/experiments/local-penal50-v9-control
- Classificador: `nvidia/nemotron-3.5-super-vl:free`; juiz: `nvidia/nemotron-3-super-120b-a12b:free`.
- Prompts: `classificador.v3.md` / `juiz.v8-local.md`; lote registrado: 1.
- [Registros originais](../output/experiments/local-penal50-v9-control/records.json); SHA-256: `b6ea5edde6c1fbede6c1f6fde398fe1d81f5c46af824288b1d0a8c2860beb29e`.

### output/experiments/pagos-v10-gemini-openai
- Classificador: `gemini-3.1-pro-preview`; juiz: `gpt-5.2-2025-12-11`.
- Prompts: `classificador.v9-local.md` / `juiz.v8-local.md`; lote registrado: 1.
- [Registros originais](../output/experiments/pagos-v10-gemini-openai/records.json); SHA-256: `4a89ffbffafce819ab9ac1b34e06c663e10b6a023a497ca67517b41b313ad768`.

### output/experiments/pagos-v10-juiz-isolado
- Classificador: `gemini-3.1-pro-preview`; juiz: `gpt-5.2-2025-12-11`.
- Prompts: `classificador.v9-local.md` / `juiz.v8-local.md`; lote registrado: 1.
- [Registros originais](../output/experiments/pagos-v10-juiz-isolado/records.json); SHA-256: `3d2d6de6b70ff5843b97137293f1913c1f8758f5e93c569491c0ff1dede8a3cd`.

### output/experiments/gemini-flash-v11-piloto
- Classificador: `gemini-3.1-flash-lite`; juiz: `gemini-3.8-flash`.
- Prompts: `classificador.v9-local.md` / `juiz.v8-local.md`; lote registrado: 1.
- [Registros originais](../output/experiments/gemini-flash-v11-piloto/records.json); SHA-256: `2463d254bed2156e99e683857e20f21944071aaca107938f7fa2adbc6b47c4a4`.

### output/experiments/gemini-flash-v13-livros-359
- Classificador: `gemini-3.1-flash-lite`; juiz: `gemini-3.8-flash`.
- Prompts: `classificador.v11-livros.md` / `juiz.v10-livros.md`; lote registrado: 1.
- [Registros originais](../output/experiments/gemini-flash-v13-livros-359/records.json); SHA-256: `59cf551474b611ccd3bfd72dc248a77e21c6ce4259c34b5555385185ffd74a6f`.

### output/experiments/gemini35-v15-livros-359
- Classificador: `gemini-3.5-flash-lite`; juiz: `gemini-3.8-flash`.
- Prompts: `classificador.v11-livros.md` / `juiz.v10-livros.md`; lote registrado: 1.
- [Registros originais](../output/experiments/gemini35-v15-livros-359/records.json); SHA-256: `a11f42755cbef9f547a4a73fbb38e516dca2e27e2ccfa6d58c2303a1475307fe`.

### output/experiments/gemini35-v16-projeto2-359
- Classificador: `gemini-3.5-flash-lite`; juiz: `gemini-3.8-flash`.
- Prompts: `classificador.v11-livros.md` / `juiz.v10-livros.md`; lote registrado: 1.
- [Registros originais](../output/experiments/gemini35-v16-projeto2-359/records.json); SHA-256: `d17856350fcd375568cae5d2b02bded5e38532dd799705e0d201d58124fbe63c`.

### output/paid-v17/paid-v17-359/b30
- Classificador: `gemini-3.5-flash-lite`; juiz: `gemini-3.8-flash`.
- Prompts: `classificador.v11-livros.md` / `juiz.v10-livros.md`; lote registrado: 30.
- [Registros originais](../output/paid-v17/paid-v17-359/b30/records.json); SHA-256: `58a37429926fb453ec7957320cd679aff23f5d7406befc7a5043c6275feb204b`.

### output/paid-v17/paid-v17-359/b20
- Classificador: `gemini-3.5-flash-lite`; juiz: `gemini-3.8-flash`.
- Prompts: `classificador.v11-livros.md` / `juiz.v10-livros.md`; lote registrado: 20.
- [Registros originais](../output/paid-v17/paid-v17-359/b20/records.json); SHA-256: `7386c41aebe1987717c960e661e35204c685ca82d242aaa6d702d14fabd927b2`.

### output/vertex-v18/vertex-v18-piloto-10/b10
- Classificador: `gemini-3.5-flash-lite`; juiz: `gemini-3.8-flash`.
- Prompts: `classificador.v11-livros.md` / `juiz.v10-livros.md`; lote registrado: 10.
- [Registros originais](../output/vertex-v18/vertex-v18-piloto-10/b10/records.json); SHA-256: `c7b8a3a98364dbc4d8708775a0e14ffb4e36e9d09eeee48d4f262e8f878638ba`.

### output/vertex-v18/vertex-v18-359/b20
- Classificador: `gemini-3.5-flash-lite`; juiz: `gemini-3.8-flash`.
- Prompts: `classificador.v11-livros.md` / `juiz.v10-livros.md`; lote registrado: 20.
- [Registros originais](../output/vertex-v18/vertex-v18-359/b20/records.json); SHA-256: `19520e8d51a73fab77ecc15fb0d30d56012c43be19bbe83fd6947da873c4ec14`.

