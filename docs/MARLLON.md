# Como ligar a interface (UI) ao backend. Para o Marllon e o Claude dele

> **ACTUALIZAÇÃO (14 Nov): a tua interface já está integrada em `app/visao/`.** Lê `app/visao/README.md`: diz que ecrãs usam dados reais, quais continuam com exemplos e o que falta desenhar (questionário pré-exame, calibração da distância, criar perfil). O que se segue abaixo é a referência das funções do backend.
>
> Lê primeiro o `CLAUDE.md` na raiz. O backend está pronto e testado; a UI só precisa de **chamar estas funções**. Não é preciso reescrever lógica nenhuma.

## 1. Scripts a carregar no teu HTML (por esta ordem, caminhos relativos a `app/`)
```html
<script src="dados.js"></script>                          <!-- FAIXAS, ASTRONAUTAS (simulados) -->
<script src="../motor/regras.js"></script>                <!-- REGRAS (limites e frases) -->
<script src="../motor/motor.js"></script>                 <!-- Motor  (cor do semáforo) -->
<script src="../motor/modelo.js"></script>                <!-- Modelo (previsão que aprende com cada exame) -->
<script src="armazenamento.js"></script>                  <!-- Armazem (perfis e testes guardados no aparelho) -->
<script src="camara/vendor/mediapipe/face_detection.js"></script>
<script src="camara/distancia.js"></script>               <!-- Distancia (câmara) -->
<script src="camara/vendor/faceapi/face-api.js"></script>
<script src="camara/rosto.js"></script>                   <!-- Rosto (entrar com a cara) -->
```
Sem `fetch`, sem CDN. A câmara só funciona abrindo com `abrir_app.command` / `abrir_app.bat` (http://localhost).

## 2. Perfis e dados (`Armazem`)
| Chamada | Devolve |
|---|---|
| `Armazem.perfis()` | `[{id, testes, ultimo_dia, tem_oct}]` dos astronautas reais guardados |
| `Armazem.registosDe(id)` | registos ordenados por dia |
| `Armazem.guardar({astronauta_id, dia, ...campos})` | guarda; junta com o registo do mesmo dia. Campos: `oct_um`, `amsler_od`, `amsler_oe`, `amsler_zonas`, `amsler_centro`, `acuidade_linha`, `acuidade_com_oculos`, `melhora_com_oculos`, `perg_focar`, `perg_contraste`, `perg_dor_cabeca`, `perg_visao_dupla`, `distancia_cm`, `sem_camara` |
| `Armazem.apagarPerfil(id)` | apaga o perfil |
| `Armazem.avaliar(id, dia)` | `{semaforo, modelo}` (ver abaixo) |
| `Armazem.normalizarId(nome)` | `"  marllon "` → `"MARLLON"` |

Astronautas **simulados** (demo A, B, C): `Motor.avaliar(Motor.registosDe("DEMO_B", ASTRONAUTAS), 90, FAIXAS, REGRAS)` e `Modelo.treinar(Motor.registosDe("DEMO_B", ASTRONAUTAS), FAIXAS, 90)`.

## 3. O que mostrar no ecrã de resultado
`semaforo` (de `Motor.avaliar`):
```js
{ cor_final: "verde"|"amarelo"|"vermelho"|"a_calibrar",
  texto: "Repete daqui a 3 dias. ...",      // frase para o astronauta
  proximo_teste_dias: 3,
  motivos: ["Retina +16%, acima do esperado ...", ...],
  sinais: { oct: {cor, delta_pct, z, motivo}, amsler: {cor, zonas_novas, motivo}, acuidade: {cor, perda, motivo} } }
```
`modelo` (de `Modelo.treinar`): `{ texto, avisos: [...], previsao: {dia: 150, delta_pct, min, max}, dia_amarelo, dia_vermelho }`. É informativo: **não muda a cor**.

## 3b. OCT: só nos simulados
A equipa decidiu **não ter registo de OCT** para astronautas reais (não há aparelho na demo). Não criar ecrã de OCT. O sinal de OCT e a previsão da retina aparecem só nos astronautas simulados (DEMO_A, DEMO_B, DEMO_C). Para perfis reais, `sinais.oct.cor` é `"a_calibrar"` e não pesa na cor final; `modelo.previsao` é `null` e `modelo.avisos` traz os avisos do padrão pessoal.

## 4. Gráfico (ecrã 4, astronautas simulados)
- Faixa esperada: `FAIXAS.p10[dia]`, `p90[dia]`, `p97[dia]` (dias 0..180), em % de variação.
- Curva do astronauta: para cada registo com `oct_um`, `(oct_um − base) / base × 100`, onde `base` = primeiro `oct_um`.
- Previsão: `Modelo.prever(estado, dia)` para dias futuros (`estado` = `Modelo.treinar(...).estado`).

## 5. Câmara
```js
Distancia.iniciar(videoEl, { minCm: 30, maxCm: 45, pastaModelo: "camara/vendor/mediapipe/",
  aoMudar: function (r) { /* r.estado: ok | perto | longe | sem_cara | indisponivel ; r.cm ; r.mensagem */ } });
Distancia.calibrar(40);  Distancia.parar();
```

## 5b. Entrar com a cara (`Rosto`)
```js
Rosto.definirPasta("camara/vendor/faceapi/");
Rosto.identificar(videoEl).then(r => { if (r.ok) /* entrar no perfil r.id */; else /* mostrar r.mensagem e a lista */ });
Rosto.registar(videoEl, "MARLLON").then(r => /* r.ok, r.mensagem */);   // só a própria pessoa, com consentimento
Rosto.registados();  Rosto.apagar("MARLLON");
```
Guarda só um código numérico da cara, no aparelho. A lista de perfis tem de continuar disponível (a cara é um atalho, não uma obrigação). Parar `Distancia` antes de usar `Rosto` (partilham a câmara).

## 5c. Perfis da equipa e questionário pré-exame
- `Armazem.perfis()` já devolve CHANDY, EDILSON, LUKANGA, MARLLON, NEYDE e SHEINAZE (`Armazem.EQUIPA`); `Armazem.criarPerfil(nome)` cria outros.
- Questionário (VISION GUARD): as perguntas e opções estão em `REGRAS.prontidao.perguntas`; desenha-as a partir daí. `Motor.prontidao(respostas, REGRAS)` → `{estado: verde|amarelo|vermelho, ressalvas, alerta_clinico, sintomas, texto, texto_alerta}`. Vermelho = não avançar para o teste. `alerta_clinico` = mostrar `texto_alerta` sempre, mesmo sem teste. Guardar com o teste: `pre_exame`, `prontidao`, `ressalvas`, `alerta_clinico`.

## 6. Exemplo completo a funcionar
`app/camara/teste_visao.html` + `teste_visao.js`: perfis, entrada pela cara, questionário pré-exame, distância, Amsler por olho, leitura de perto, óculos de reserva, 4 perguntas, semáforo e avisos do modelo. Podes copiar os blocos de lógica e mudar só o HTML/CSS. Marcadores `window.__passo`, `window.__resultado` e `window.__modelo` servem para testes automáticos: mantém-nos se puderes.

## 7. Prompt para colar no teu Claude
> Lê `CLAUDE.md` e `docs/MARLLON.md`. Tenho a minha UI em `app/` (diz-lhe os ficheiros). Liga-a ao backend existente usando só as funções descritas em `docs/MARLLON.md` (`Armazem`, `Motor`, `Modelo`, `Distancia`), sem reescrever lógica e sem alterar ficheiros em `motor/`, `simulador/`, `dados/` nem `app/camara/vendor/`. Usa `app/camara/teste_visao.js` como referência de como chamar cada função. No fim, confirma que funciona sem internet.
