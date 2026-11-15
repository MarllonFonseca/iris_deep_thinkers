# Especificação do motor de regras (`motor/`). Para o Edilson e o Claude dele

> **Estado: IMPLEMENTADO e testado (9/9 ✅).** `motor/regras.js`, `motor/motor.js`, `motor/testes.js` e `motor/teste.html` já existem e seguem esta especificação. A tarefa do Edilson passa a ser **rever, perceber e manter** o motor (ver secção 7).
>
> **Lê primeiro o `CLAUDE.md` na raiz do repositório.** Tem as regras que valem para todo o projecto (sem internet, sem fetch, sem frameworks).

## 1. Contexto em 1 minuto
Em missões longas, a microgravidade faz os líquidos subirem para a cabeça e a retina à volta do nervo óptico engrossa (SANS). Muitas vezes o astronauta não sente nada.
A nossa app faz um teste rápido (grelha de Amsler, acuidade de perto, 4 perguntas) e regista o OCT (espessura da retina, em µm). O **motor** decide a cor do semáforo:

- **verde**: dentro do esperado → próximo teste numa semana
- **amarelo**: vigiar → repetir daqui a 3 dias, óculos de reserva, confirmar CO₂
- **vermelho**: avisar já o médico de voo → pacote pronto + plano enquanto espera

Cada sinal (OCT, Amsler, acuidade) recebe uma cor; **a cor final é a pior das três**.

## 2. O que tens de entregar (tudo dentro de `motor/`)
| Ficheiro | O que é |
|---|---|
| `motor.js` | As funções abaixo, num objecto global `window.Motor`. JavaScript puro, sem dependências |
| `regras.js` | `window.REGRAS = {...}`: limites e textos. A equipa de saúde edita só este ficheiro |
| `testes.js` | Os 9 testes da secção 6 numa função `correrTestes(Motor, FAIXAS, REGRAS, ASTRONAUTAS)` |
| `teste.html` | Página que carrega `../app/dados.js`, `regras.js`, `motor.js`, `testes.js` e mostra ✅/❌ |

Porquê `.js` e não `.json`: a app abre do disco (`file://`) e aí o browser bloqueia `fetch()` de ficheiros. Um `<script src="...">` funciona sempre.

## 3. Os dados que recebes (já existem, gerados pelo simulador)
`app/dados.js` define:

**`window.FAIXAS`**
```js
{
  p10: [/*181 números, índice = dia 0..180*/], p50: [...], p90: [...], p97: [...], // Δ% esperado por dia
  subida_rapida: [ {de: 0, ate: 10, taxa_p97_pct_dia: 0.6069}, {de: 10, ate: 30, ...}, ... ],
  calendario_oct: [0, 10, 30, 60, 90, 120, 150],
  s_min_um: 5.0
}
```
Exemplo ao dia 90: `p10=4.614, p50=9.185, p90=15.033, p97=16.99`.

**`window.ASTRONAUTAS`**: um registo por astronauta e dia com teste:
```js
{ astronauta_id: "DEMO_C", perfil: "demo_vermelho", dia: 91, oct_um: null,
  amsler_zonas: [2, 4, 5], amsler_centro: 1, acuidade_linha: 8, melhora_com_oculos: 0,
  perg_focar: 2, perg_contraste: 3, perg_dor_cabeca: 3, perg_visao_dupla: 3 }
```
- `oct_um` só existe nos dias 0, 10, 30, 60, 90, 120, 150 (senão `null`). **Dia 0 = linha de base (antes do voo).**
- Teste rápido (Amsler, acuidade, perguntas) nos dias múltiplos de 7 (senão `null`).
- `amsler_zonas`: grelha 3×3 numerada `0 1 2 / 3 4 5 / 6 7 8`; **4 = centro**. `[]` = sem distorções.
- `acuidade_linha`: linha mais pequena lida (10 = normal; **menor = pior**).

## 4. Funções do `motor.js` (assinaturas exactas: a app do Marllon vai chamá-las assim)

### 4.1 `Motor.corOCT(medicoes, faixas)`
- `medicoes`: array `[{dia, oct_um}, ...]` **ordenado por dia**, só com OCTs. O **primeiro** é a linha de base. O último é a medição a avaliar.
- Devolve `{cor, delta_pct, z, motivo}`.

Algoritmo:
```
se medicoes.length < 2 → { cor: "a_calibrar", delta_pct: 0, z: 0, motivo: "Primeiro OCT guardado como linha de base." }
b = medicoes[0].oct_um ; x = último.oct_um ; d = min(último.dia, 180)
delta = (x − b) / b × 100
cor = delta > p97[d] ? "vermelho" : delta > p90[d] ? "amarelo" : "verde"

// subida rápida (só agrava amarelo → vermelho; evita alarmes por ruído do OCT)
ant = penúltima medição ; d0 = ant.dia
taxa = (delta − (ant.oct_um − b)/b×100) / (d − d0)        // pontos percentuais por dia
lim = faixas.subida_rapida.find(t => t.de <= d0 && d <= t.ate)?.taxa_p97_pct_dia
se cor == "amarelo" e lim existe e taxa > lim → cor = "vermelho", motivo = "Subida rápida desde o último OCT."

// z = distância ao esperado nesse dia (informativo, para mostrar no ecrã)
desvio = max((p90[d] − p10[d]) / 2.563, 0.5)
z = (delta − p50[d]) / desvio
```
Arredondar `delta_pct` e `z` a 1 casa decimal. `motivo` em português, ex.: `"Retina +16.0% (esperado até +15.0% ao dia 90)."`

### 4.2 `Motor.corAmsler(zonasBase, zonasHoje, regras)`
- Arrays de inteiros 0–8. Para um utilizador novo, `zonasBase = []`.
- `novas = zonasHoje − zonasBase` (diferença de conjuntos).
- `novas` contém `regras.amsler.zona_centro` (4) → **vermelho**; `novas` não vazio → **amarelo**; senão **verde**.
- Devolve `{cor, zonas_novas, motivo}`.

### 4.3 `Motor.corAcuidade(linhaBase, linhaHoje, melhoraComOculos, regras)`
- `perda = linhaBase − linhaHoje`.
- `perda >= regras.acuidade.perda_amarelo_linhas` (1) e `melhoraComOculos === 0` → **vermelho**
- `perda >= regras.acuidade.perda_amarelo_linhas` → **amarelo**; senão **verde**.
- Devolve `{cor, perda, motivo}`.

### 4.4 `Motor.piorCor(cores)`
Ordem: `a_calibrar` < `verde` < `amarelo` < `vermelho`. Devolve a pior.

### 4.5 `Motor.avaliar(registos, dia, faixas, regras)`: a função que a app usa
- `registos`: todos os registos de **um** astronauta (formato de `ASTRONAUTAS`).
- Usa só registos com `dia <= dia`.
  - OCT: todos os `oct_um != null` → `corOCT`.
  - Teste rápido: **base** = primeiro registo com `acuidade_linha != null`; **hoje** = o último até `dia`. Se só existir um (o próprio), a acuidade dá `verde` (é a linha de base) e o Amsler é comparado com uma grelha sem distorções (`corAmsler([], zonas)`): distorções no 1.º teste dão amarelo ou vermelho.
- Devolve:
```js
{ cor_final, sinais: { oct: {...}, amsler: {...}, acuidade: {...} },
  texto: regras.textos[cor_final].mensagem,            // frase para o astronauta
  proximo_teste_dias: regras.textos[cor_final].proximo_teste_dias,
  motivos: [ /* motivos dos sinais que não são verdes */ ] }
```
- Se `cor_final` for `a_calibrar`, usar `regras.textos.a_calibrar`.

### 4.7 `Motor.prontidao(respostas, regras)`
Estado do questionário pré-exame (VISION GUARD), separado da cor clínica. Regras em `REGRAS.prontidao` (pergunta → opção → `e`: verde/amarelo/vermelho, `m`: ressalva; a pergunta `alteracao_visual` é de escolha múltipla e só gera `alerta_clinico`). Estado final = o pior. Testes 21 e 22.

### 4.6 `Motor.registosDe(astronautaId, astronautas)`
Filtra e ordena por dia. Atalho para a app.

## 5. `regras.js` inicial (valores PROVISÓRIOS do documento do MVP; a Sheinaze e a Neyde validam)
```js
window.REGRAS = {
  versao: 1,
  provisorio: true,                       // a equipa de saúde muda para false quando validar
  amsler: { zona_centro: 4 },
  acuidade: { perda_amarelo_linhas: 1 },
  textos: {
    a_calibrar: { mensagem: "A calibrar o teu normal. Faz o próximo teste daqui a uma semana.", proximo_teste_dias: 7 },
    verde:      { mensagem: "Dentro do esperado. Próximo teste daqui a uma semana.", proximo_teste_dias: 7 },
    amarelo:    { mensagem: "Repete daqui a 3 dias. Usa os óculos de reserva. Confirma o CO₂ na cabine.", proximo_teste_dias: 3 },
    vermelho:   { mensagem: "Avisa já o médico de voo. O pacote com os teus resultados está pronto.", proximo_teste_dias: 1 }
  }
};
```

## 6. Testes obrigatórios (`teste.html` tem de mostrar todos ✅)
Valores tirados dos dados gerados (seed fixa). Tolerância: ±0.1 em `delta_pct`.

| # | Chamada | Esperado |
|---|---|---|
| 1 | `avaliar(DEMO_A, 90)` | `cor_final = "verde"`, `sinais.oct.delta_pct ≈ 8.0` (358.0 → 386.8 µm) |
| 2 | `avaliar(DEMO_B, 90)` | `sinais.oct.cor = "amarelo"`, `delta_pct ≈ 16.0` (365.0 → 423.4 µm), `cor_final = "amarelo"` |
| 3 | `avaliar(DEMO_C, 90)` | `cor_final = "vermelho"`, `delta_pct ≈ 53.9` (401.0 → 617.1 µm) |
| 4 | `avaliar(DEMO_C, 91)` | `sinais.amsler.cor = "vermelho"` (zona 4 nova), `sinais.acuidade.cor = "vermelho"` (8 < 10, não melhora com óculos) |
| 5 | `avaliar(DEMO_B, 91)` | `sinais.amsler.cor = "amarelo"` (zona 2 nova), `sinais.acuidade.cor = "amarelo"` (9 < 10) |
| 6 | `corOCT([{dia:0, oct_um:362}], FAIXAS)` | `cor = "a_calibrar"` |
| 7 | `corAmsler([], [4], REGRAS)` | `"vermelho"` · `corAmsler([], [0], REGRAS)` → `"amarelo"` · `corAmsler([2], [2], REGRAS)` → `"verde"` |
| 8 | Para os 20 astronautas `populacao`, todos os OCT dos dias 10–150 | cerca de **84% verde, 11% amarelo, 5% vermelho** (120 OCTs). Mostrar as percentagens |
| 9 | `piorCor(["verde","vermelho","amarelo"])` | `"vermelho"` |

Referência em Python do OCT (mesma lógica, já testada): função `cor_oct()` em `simulador/simulador.py`.

## 7. Prompt para colar no teu Claude
> Lê `CLAUDE.md` e `docs/EDILSON.md` neste repositório. O motor de regras já está implementado em `motor/` (`regras.js`, `motor.js`, `testes.js`, `teste.html`). Explica-me, função a função, como `motor/motor.js` funciona e confirma que segue a especificação de `docs/EDILSON.md`. Depois ajuda-me a abrir `motor/teste.html` e confirmar que os 9 testes dão ✅. Regras: JavaScript puro, sem dependências, sem fetch, tem de funcionar ao abrir com duplo clique (file://). Não mudes assinaturas de funções sem avisar o Marllon (a app chama-as). Se mudares lógica, acrescenta um teste em `motor/testes.js`.

### Como testar também na linha de comandos (opcional, precisa de Node)
```bash
node -e "global.window=globalThis;require('./app/dados.js');require('./motor/regras.js');const M=require('./motor/motor.js');require('./motor/testes.js')(M,FAIXAS,REGRAS,ASTRONAUTAS).forEach(t=>console.log((t.ok?'OK ':'FALHA ')+t.nome+' | '+t.detalhe))"
```

## 8. Dúvidas
Lógica dos dados/simulador → Lukanga. Limites e textos clínicos → Sheinaze e Neyde. Como a app chama o motor → Marllon.
