# app/visao/ (interface do Marllon, ligada ao backend)

Os 8 ecrãs do Marllon (`Main`, `Hoje`, `TesteRapido`, `Tendencia`, `SANS`, `Alerta`, `Perfil`, `OCT`) com o backend ligado.
Abrir com `abrir_app.command` (Mac) ou `abrir_app.bat` (Windows): começa em `Main.html`, em `http://localhost:8000`.
Com duplo clique no ficheiro tudo funciona, **menos a câmara** (distância e entrada pelo rosto).

## Como está ligado

```
ecrã (.html)  ->  window.Visao (ligacao.js)  ->  Armazem, Motor, Modelo, Distancia, Rosto
```

Cada ecrã carrega, por esta ordem: `../dados.js`, `../../motor/regras.js`, `../../motor/motor.js`, `../../motor/modelo.js`,
`../armazenamento.js`, (`../camara/...` só em `Main` e `TesteRapido`), `ligacao.js`, `runtime.js`.

Há dois tipos de sessão, escolhidos em `Main.html`:

| Sessão | Quem | De onde vêm os dados | Guarda? |
|---|---|---|---|
| **Equipa · dados reais** | CHANDY, EDILSON, LUKANGA, MARLLON, NEYDE, SHEINAZE (`Armazem.EQUIPA`) | Testes feitos no aparelho + `Motor` + `Modelo` | Sim, `localStorage` (`dt_registos`) |
| **Demonstração · fictícios** | Marta (A), Daniel (B), Sofia (C) | Valores de exemplo do Marllon | Não |

A sessão real fica em `localStorage["visao-real"]` (id do perfil) e `visao-dia-<ID>` (dia de missão escolhido ao entrar).
Em cada ecrã, a regra é sempre a mesma: `const R = Visao.algo(); usar R se existir, senão os valores de exemplo`.

## O que cada ecrã usa do backend

| Ecrã | Sessão real | Demonstração |
|---|---|---|
| `Main` | Lista de perfis (`Armazem.perfis`), dia de missão, entrada pelo rosto (`Rosto.identificar`), registo do rosto com consentimento (`Rosto.registar`), ou "Entrar sem câmara" | Face ID e palavra-passe simulados (como antes) |
| `TesteRapido` | Compara com a **base** (1.º teste), guarda o teste (`Visao.guardarTeste`), cor decidida por `Motor.corAmsler` e `Motor.corAcuidade` olho a olho, avisos do `Modelo` | Lógica de exemplo do Marllon |
| `TesteRapido` (os dois) | Distância medida pela câmara em directo (`Distancia`): 35 a 45 cm na acuidade, 28 a 38 cm na grelha | igual |
| `Hoje` | Último teste, estado por olho, recomendação (`Visao.resumoHoje`) | Exemplo |
| `SANS` | Linha temporal dos testes guardados (`Visao.linhaTempo`) | Exemplo |
| `Alerta` | Alertas gerados a partir dos testes (`Visao.alertas`) | Exemplo |
| `Perfil` | Só dados verdadeiros do aparelho (`Visao.fichaPerfil`); "Trocar de perfil" volta ao `Main` | Exemplo |
| `Tendencia` | Para todos: séries `DEMO_A/B/C` do simulador, faixas P10/P90/P97 de `FAIXAS` e cor de `Motor.corOCT` | igual |
| `OCT` | Continua a ser um exemplo simulado (não há OCT a bordo); aparece identificado como "Exemplo simulado" | Exemplo |

## Escalas desta interface (atenção)

- Acuidade: **0 a 5 linhas por olho** (`acuidade_oe`, `acuidade_od`). `acuidade_linha` = a pior das duas (para o `Modelo`).
- Grelha de Amsler: 12x12 por olho (`celulas_od`, `celulas_oe`), convertida para as 9 zonas do motor (`amsler_od`, `amsler_oe`); o bloco central 4x4 é a zona 4.
- Perguntas: Não / Ligeiro / Marcado = 0 / 1 / 3.
- Níveis do ecrã: verde 0, amarelo 1 (condições duvidosas), laranja 2 (= amarelo do motor, ou sintomas), vermelho 3 (= vermelho do motor).
- O ecrã de teste antigo (`app/camara/teste_visao.html`) usa 10 linhas e grelha 3x3. **Não misturar os dois no mesmo perfil.**

## Correcções de 14 Nov (pedido da equipa)

- **«Tela» em vez de «tablet»** em todos os textos.
- **Íris**: a imagem do olho no ecrã inicial muda com o perfil seleccionado; cada perfil guarda a sua íris
  (`visao-iris-<ID>`, escolhida em Perfil). Ver `Visao.irisDe(id)` e `Visao.guardarIris(id, iris)`.
- **Fundo acompanha a íris** (`iris.css`): escuro = preto com o brilho da cor da íris; claro = branco com a cor da íris.
- **Gradiente por baixo da barra de navegação** (cor do fundo: preto no escuro, branco no claro) quando há conteúdo por trás.
- **Instruções antes do teste**: acuidade e grelha de Amsler começam com um ecrã de instruções e o botão «Começar».
- **Voz** (`voz.js`): instruções faladas em português (vozes do sistema, sem internet): «Que letras vês?», «Afasta-te um pouco
  da tela», «Aproxima-te», «Diz seguinte para avançar». Botão «Voz ligada/desligada».
  **Microfone** (opcional): diz as letras, «seguinte», «apagar», «não consigo», «tudo direito». Só funciona se o navegador
  reconhecer a voz **no aparelho** (`processLocally`, Chrome/Edge recentes); o som nunca sai do aparelho.
  O pacote de português descarrega-se uma vez, com internet, em `index.html` → «Preparar voz». Sem isso, usam-se os botões.
- **Indicador de acertos**: em vez de «toca nas letras que reconheces», o astronauta toca na letra que vê num teclado
  (C D E F L O P T Z). Cada letra fica verde (certa) ou vermelha (errada); a linha conta como lida com 60% certas.
  Os acertos ficam guardados (`acertos_oe`, `acertos_od`, ex.: "14/15").
- **Ecrã de acuidade simplificado**: só o olho, a linha, as letras, os acertos e o teclado.
- **Responsividade** (`runtime.js`): ecrãs largos (PC, tablet, TV) mostram o desenho inteiro, ampliado, com o fundo a encher a janela.
  Ecrãs estreitos ou baixos (telemóvel; largura < 820 px ou altura < 520 px) passam a **modo coluna**: os blocos ficam uns por baixo
  dos outros, em tamanho real, com scroll; a barra de navegação fica fixa em baixo; grelhas de cartões passam a uma coluna;
  gráficos com posições fixas (linha temporal SANS) deslizam para o lado. Não há rotação do ecrã.
- **Teste dividido em duas metades** (acuidade e grelha de Amsler): à esquerda o teste; à direita a **imagem da câmara em directo**
  com a distância por cima (cm, «Distância certa / Perto demais / Longe demais», moldura verde ou amarela) e os botões de voz.
  O `<video>` é um só: fica registado em `window.DC_FIXOS.camara` e o `runtime.js` encaixa-o onde o ecrã tiver
  `<div data-fixo="camara">` (o ecrã é redesenhado a cada mudança, por isso o vídeo não pode viver dentro do modelo).
  Nada é gravado: a imagem só é mostrada e usada para medir a distância.
- **Entrada pelo rosto mais rápida** (`../camara/rosto.js`): os modelos são carregados e «aquecidos» ao abrir o `Main`
  (`Rosto.preparar()`, sem ligar a câmara); modelos e câmara arrancam ao mesmo tempo; a análise usa imagens mais pequenas (224);
  basta uma imagem com boa semelhança (distância ≤ 0,46) para entrar; depois de reconhecer, segue sozinho para o `Hoje`.
  O círculo do `Main` mostra a câmara enquanto verifica (`data-fixo="rosto"`).

## Inglês, voz e perfis (14 Nov, noite)

- **Toda a interface em inglês.** Textos do motor traduzidos em `ligacao.js` (`Visao.en`). OE/OD → LE/RE.
- **Responder às letras por voz** (botão «Answer by voice» no teste de acuidade): diz as letras («F P», «tee oh zed»),
  «next», «delete», «can't read», «all straight», «repeat».
  - Chrome/Edge recentes: reconhecimento **no aparelho** (pacote inglês descarregado uma vez em `index.html` → «Prepare voice»).
  - Safari e outros: só reconhecem pela internet (serviço da Apple/Google). A app pede autorização explícita
    («Allow online voice»); a escolha fica em `visao-voz-online`.
- **Perfil AUTRO1** (criado por engano) é removido automaticamente uma vez (`visao-limpo-autro1`). Qualquer perfil
  fora da equipa pode ser removido no `Main` («Remove profile», dois toques). Os da equipa nunca são removidos.
- **Sem cache:** `servidor.py` + versão nos ficheiros (`?v=...`): ao mudar ficheiros, sobe a versão em todos os `.html`.

## Por fazer

- O questionário pré-exame VISION GUARD (9 perguntas, `REGRAS.prontidao`, `Motor.prontidao`) só existe em `app/camara/teste_visao.html`.
  Aqui o passo "Antes de começar" tem a pergunta do movimento da nave e 4 sintomas. Falta o Marllon desenhar esse passo.
- Calibrar a distância (`Distancia.calibrar(40)`) ainda não tem botão nesta interface.
- Criar perfis novos (além da equipa) ainda não tem botão: `Armazem.criarPerfil("NOME")` na consola, ou pelo ecrã de teste antigo.

## Regras

- Sem internet: a fonte Manrope está em `assets/fonte/` (licença OFL). Nada de `<link>` para fora.
- Rosto: só com o acordo da própria pessoa; guarda-se apenas o descritor numérico (`dt_rostos`), nunca fotografias; a entrada à mão existe sempre.
- "Repor a demonstração" (em `index.html`) apaga só as chaves `visao-*`. Os testes reais e os rostos ficam.

## Voz gravada (14 Nov)
- As frases faladas no teste tocam os MP3 de `audio/` (lista em `audio/frases.md`), via `Voz.falarClip(clips, texto)`.
- Se um ficheiro faltar ou não tocar, a mesma frase é dita pela voz do sistema (speechSynthesis). Tudo offline.
- No passo do resultado é lido o nível (result_green/yellow/orange/red).
- Voice generated with ElevenLabs (elevenlabs.io). Uso não comercial (plano gratuito).

## IRIS e relatório final (14 Nov)
- Nome da app: IRIS (Integrated Remote Intelligence for Spaceflight), no cabeçalho, nos títulos e no ecrã de entrada.
- Resultado → "Final report": conclusão, testes, dados da missão (microgravidade com a faixa P50/P90 de `dados/faixas.json`,
  luz medida pela câmara, movimento da nave, distância) e o porquê. Funções novas: `Visao.missao(dia, letraDemo)`, `Visao.camara.luz()`.
- Luz fraca ou forte em 40% ou mais das leituras entra nas ressalvas (resultado amarelo se os testes estiverem iguais).
- Registos novos: `luz_media` (0–100) e `luz_nivel` (boa | fraca | forte).
- Modo coluna: a barra de navegação voltou a ficar fixa em baixo (o runtime procurava o rótulo em português).

## 15 Nov: pré-registo, questionário, privacidade, alertas vistos, PT/EN
- **Pré-registo (dia 0, na Terra):** `Registo.html`. Ficha da missão (destino, lançamento, duração), dos olhos (correcção, óculos de reserva,
  doença conhecida) e OCT de base opcional; depois os testes de base. Guardado em `visao-registo-<ID>` (`Visao.registoDe/guardarRegisto`).
  A 1.ª entrada de um perfil sem pré-registo vai para este ecrã. O dia 0 aparece sempre como "Pre-flight / Pré-voo".
- **Questionário pré-exame (VISION GUARD):** as 9 perguntas de `REGRAS.prontidao`, 3 por ecrã, com prontidão verde/amarela/vermelha
  (`Motor.prontidao`). Vermelho bloqueia o teste; perda súbita ou visão dupla = alerta clínico. Guardado em `pre_exame` e `alteracao_visual`.
  Alteração visual nova → laranja; importante (3, 4) → vermelho.
- **Privacidade do histórico:** perfil real só vê os seus dados. Histórico (Tendencia) e OCT mostram só os testes/exames da própria pessoa
  (`Visao.historico`, `Visao.octDe/guardarOCT`); a lista de entrada já não mostra testes de outras pessoas; na demonstração, só a persona com sessão.
- **Alertas vistos:** "Mark as seen" guarda por perfil (`visao-vistos-<ID>`), o botão dá lugar a "Seen ✓"; "Mark all as seen"; o Hoje só conta os por ver.
- **Letras e teclado sorteados** em cada teste (9 de 15 letras: Sloan C D H K N O R S V Z + E F L P T).
- **PT ↔ EN:** botão ao lado do tema em todos os ecrãs. `i18n.js` traduz o texto desenhado (dicionário + regras para textos com números);
  a voz em PT usa a voz portuguesa do sistema (os MP3 são em inglês) e o reconhecimento em pt-PT com os nomes das letras em português.
  Para mudar traduções: editar o dicionário em `i18n.js` (MAPA) ou as REGRAS no fim do ficheiro.

## 15 Nov (tarde): logótipo e limpeza
- Logótipo da equipa em `assets/logo_iris.png` (marca + "iris") e `assets/logo_marca.png` (só a flor). São máscaras: `.dt-logo` / `.dt-marca`
  (em `fonte.css`) pintam-nas com a cor do texto, por isso servem no tema claro e no escuro. Ícone do separador: `assets/logo_icone.png`.
- "O essencial a bordo" no Hoje (orientações gerais: olhos, corpo e regra de ouro).
- Coerência: OCT do próprio astronauta aparece na linha do tempo SANS, no Perfil e no relatório final; "Vision changes" com o mesmo nome em todo o lado;
  gráfico do Histórico com os dois olhos; miniaturas do índice refeitas com os ecrãs actuais.

