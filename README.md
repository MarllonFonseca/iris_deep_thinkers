# IRIS · Integrated Remote Intelligence for Spaceflight

Monitor de visão para astronautas (SANS), da equipa Deep Thinkers.

NASA Space Apps Challenge 2026, Maputo. Desafio: *Create Health Monitoring Software for Astronauts on Space Missions*.

App de tablet que detecta os primeiros sinais de SANS (Síndrome Neuro-Ocular Associada ao Voo Espacial) entre os exames formais, compara cada astronauta com o seu próprio normal e diz-lhe o que fazer. Ciclo: **teste → comparação → semáforo → acção**.

Regras para quem programa (pessoas e Claude): ver [`CLAUDE.md`](CLAUDE.md).

## Estrutura

| Pasta | Conteúdo | Responsável |
|---|---|---|
| `simulador/` | `simulador.py`: gera os astronautas simulados, as faixas esperadas e `app/dados.js` | Lukanga |
| `dados/` | Saída do simulador: `astronautas_simulados.csv`, `faixas.json`, `validacao.png` | gerado automaticamente |
| `motor/` | `motor.js` (regras do semáforo, corre no browser), `regras.js` (limites e textos) e `teste.html` | Edilson (+ Sheinaze e Neyde no `regras.js`) |
| `app/` | Web app offline (telemóvel, tablet ou PC), 5 ecrãs. `app/dados.js` é gerado pelo simulador | Marllon (+ Chandy no design) |
| `docs/` | Especificações (`EDILSON.md` = motor de regras) | todos |

## Como correr o simulador

```bash
pip install numpy matplotlib
python3 simulador/simulador.py
```

Os ficheiros em `dados/` e `app/dados.js` são reescritos. A seed é fixa, por isso os resultados repetem-se.

## Contrato entre as peças (não mudar sem avisar a equipa)

**`dados/astronautas_simulados.csv`**: uma linha por astronauta e dia com teste.

`astronauta_id, perfil, dia, oct_um, amsler_zonas, amsler_centro, acuidade_linha, melhora_com_oculos, perg_focar, perg_contraste, perg_dor_cabeca, perg_visao_dupla`

- `perfil`: `populacao`, `demo_verde` (DEMO_A), `demo_amarelo` (DEMO_B), `demo_vermelho` (DEMO_C)
- `oct_um`: vazio nos dias sem OCT (OCT nos dias 0, 10, 30, 60, 90, 120, 150; dia 0 = antes do voo)
- `amsler_zonas`: zonas com linhas tortas, separadas por `;` (grelha 3×3, zonas 0–8, centro = 4)
- `acuidade_linha`: linha mais pequena lida (maior = melhor; linha de base = 10)

**`dados/faixas.json`**: por dia (0–180), percentis `p10`, `p50`, `p90`, `p97` da variação da espessura da retina (Δ%), limites de `subida_rapida` por intervalo entre OCTs, `s_min_um` e a fórmula do `z_score`.

## Regras do semáforo (provisórias até validação pela equipa de saúde)

Linha de base = primeiro OCT do astronauta. `Δ% = (x − base) / base × 100`.

| Sinal | Verde | Amarelo | Vermelho |
|---|---|---|---|
| OCT | Δ% ≤ P90(dia) | P90 < Δ% ≤ P97 | Δ% > P97, ou amarelo + subida rápida |
| Amsler | sem zona nova | zona nova fora do centro | zona nova no centro |
| Acuidade | igual à base | pior ≥ 1 linha | não melhora com óculos de reserva |

Cor final = a pior das três. Referência do OCT: função `cor_oct()` em `simulador/simulador.py`.

Funciona com novos astronautas: a faixa é em variação percentual, e cada pessoa cria a sua linha de base no primeiro teste.

## Dados e fontes

- Calibração: Macias et al. 2020, JAMA Ophthalmology (362 µm antes do voo, ~+10% ao dia 150; caso grave 401 → 613 µm ao dia 84)
- Prova no pitch (não entra no cálculo): NASA OSDR, missão RR-9, tonometria de ratinhos (OSD-583)
- Os dados individuais de olhos de astronautas não são públicos; a demo usa astronautas simulados calibrados com números publicados.
