// =====================================================================
// modelo.js: modelo de aprendizagem online, um por astronauta
//
// O QUE FAZ: a cada teste novo, actualiza o que sabe sobre ESSE astronauta
// (sem voltar a treinar do zero) e dá uma previsão e avisos.
// NÃO decide a cor do semáforo (isso é do motor.js) e NÃO faz diagnóstico.
//
// 1) Tendência do OCT (actualização bayesiana, tipo filtro de Kalman escalar)
//    Modelo: Δ%(dia) = amp × (1 − e^(−dia/TAU))
//    "amp" = quanto a retina deste astronauta vai subir no total (em %).
//    Começa na média da população (prior) e, a cada OCT, aproxima-se do
//    valor real da pessoa. Quanto mais exames, menor a incerteza.
//
// 2) Padrão pessoal do teste rápido (média e variância incrementais, Welford)
//    Aprende o normal da pessoa na leitura e nas 4 perguntas e assinala
//    valores muito fora do habitual dela (a partir de MIN_TESTES testes).
//
// O estado é um objecto simples (JSON): pode ser guardado no localStorage.
// Funciona offline, sem dependências.
// =====================================================================
(function (global) {
  "use strict";

  var TAU = 40;             // dias (igual ao simulador; SUPOSIÇÃO)
  var PRIOR_AMP = 9.2;      // % (média da população simulada)
  var PRIOR_DP = 3.5;       // % (variação entre pessoas; SUPOSIÇÃO)
  var RUIDO_DELTA = 1.6;    // % (erro de medição do OCT: 4 µm em ~362 µm, base e medição)
  var MIN_TESTES = 3;       // testes rápidos necessários antes de dar avisos
  var Z_AVISO = 2.5;        // desvios face ao normal da pessoa para avisar

  function forma(dia) { return 1 - Math.exp(-dia / TAU); }
  function arred1(x) { return Math.round(x * 10) / 10; }

  function novo() {
    return {
      versao: 1,
      oct: { amp: PRIOR_AMP, variancia: PRIOR_DP * PRIOR_DP, n: 0 },
      rapido: { n: 0, acuidade: { media: 0, m2: 0 }, perguntas: { media: 0, m2: 0 } }
    };
  }

  // ---- 1) OCT: uma actualização por exame -------------------------------
  // deltaPct = (oct − linha_de_base) / linha_de_base × 100
  function actualizarOCT(estado, dia, deltaPct) {
    var h = forma(dia);
    if (h <= 0) return estado;                       // dia 0 = linha de base, nada a aprender
    var o = estado.oct;
    var r = RUIDO_DELTA * RUIDO_DELTA;
    var ganho = o.variancia * h / (h * h * o.variancia + r);   // quanto confiar na medição nova
    o.amp = o.amp + ganho * (deltaPct - h * o.amp);
    o.variancia = (1 - ganho * h) * o.variancia;
    o.n += 1;
    return estado;
  }

  // Previsão do Δ% num dia futuro, com intervalo de ~95%.
  function prever(estado, dia) {
    var h = forma(dia), o = estado.oct;
    var dp = Math.sqrt(h * h * o.variancia);
    return { dia: dia, delta_pct: arred1(h * o.amp), min: arred1(h * o.amp - 1.96 * dp), max: arred1(h * o.amp + 1.96 * dp) };
  }

  // Primeiro dia (depois de "desdeDia") em que a previsão passa o limite.
  // limite = "p90" (amarelo) ou "p97" (vermelho). Devolve null se não passar até ao dia 180.
  function diaCruzamento(estado, faixas, limite, desdeDia) {
    var arr = faixas[limite];
    for (var d = Math.max(1, (desdeDia || 0) + 1); d < arr.length; d++) {
      if (forma(d) * estado.oct.amp > arr[d]) return d;
    }
    return null;
  }

  // ---- 2) Teste rápido: média e variância incrementais --------------------
  function welford(s, n, x) {            // n = número de valores já incluindo x
    var d = x - s.media;
    s.media += d / n;
    s.m2 += d * (x - s.media);
  }
  function desvio(s, n, minimo) { return Math.max(n > 1 ? Math.sqrt(s.m2 / (n - 1)) : 0, minimo); }

  // Devolve os avisos deste teste (comparado com o normal ANTES de o incluir) e actualiza o modelo.
  function actualizarRapido(estado, registo) {
    var r = estado.rapido, avisos = [];
    var acu = registo.acuidade_linha;
    var perg = (registo.perg_focar || 0) + (registo.perg_contraste || 0) + (registo.perg_dor_cabeca || 0) + (registo.perg_visao_dupla || 0);
    if (acu === null || acu === undefined) return avisos;

    if (r.n >= MIN_TESTES) {
      var zA = (r.acuidade.media - acu) / desvio(r.acuidade, r.n, 0.5);      // positivo = pior
      var zP = (perg - r.perguntas.media) / desvio(r.perguntas, r.n, 1.0);   // positivo = pior
      if (zA >= Z_AVISO) avisos.push("Leitura de perto abaixo do teu habitual (linha " + acu + "; costumas ler a " + arred1(r.acuidade.media) + ").");
      if (zP >= Z_AVISO) avisos.push("Sintomas acima do teu habitual (soma " + perg + "; costuma ser " + arred1(r.perguntas.media) + ").");
    }
    r.n += 1;
    welford(r.acuidade, r.n, acu);
    welford(r.perguntas, r.n, perg);
    return avisos;
  }

  // ---- Conveniência: aprende com todos os registos de um astronauta -------
  // registos: formato de ASTRONAUTAS / localStorage, de UMA pessoa.
  // Devolve { estado, avisos (do último teste rápido), previsao, dia_amarelo, dia_vermelho, texto }
  function treinar(registos, faixas, ateDia) {
    var regs = (registos || []).filter(function (x) { return ateDia === undefined || x.dia <= ateDia; })
      .slice().sort(function (a, b) { return a.dia - b.dia; });
    var estado = novo(), base = null, avisos = [], ultimoDia = 0;
    regs.forEach(function (x) {
      ultimoDia = x.dia;
      if (x.oct_um !== null && x.oct_um !== undefined) {
        if (base === null) base = x.oct_um;
        else actualizarOCT(estado, x.dia, (x.oct_um - base) / base * 100);
      }
      if (x.acuidade_linha !== null && x.acuidade_linha !== undefined) avisos = actualizarRapido(estado, x);
    });

    var res = { estado: estado, avisos: avisos, previsao: null, dia_amarelo: null, dia_vermelho: null, texto: "" };
    if (estado.oct.n === 0) {
      res.texto = "Ainda sem exames de OCT suficientes para prever a tendência.";
    } else {
      res.previsao = prever(estado, 150);
      res.dia_amarelo = diaCruzamento(estado, faixas, "p90", ultimoDia);
      res.dia_vermelho = diaCruzamento(estado, faixas, "p97", ultimoDia);
      res.texto = "Previsão ao dia 150: retina +" + res.previsao.delta_pct + "% (entre +" + res.previsao.min + "% e +" + res.previsao.max + "%), com base em " + estado.oct.n + " exame(s).";
      var d0 = Math.min(ultimoDia, faixas.p90.length - 1), agora = forma(d0) * estado.oct.amp;
      if (agora > faixas.p97[d0]) res.texto += " A tendência já está acima do limite vermelho.";
      else if (agora > faixas.p90[d0]) res.texto += " A tendência já está acima do limite amarelo." + (res.dia_vermelho ? " Ao ritmo actual, passa o limite vermelho por volta do dia " + res.dia_vermelho + "." : "");
      else if (res.dia_vermelho) res.texto += " Ao ritmo actual, passa o limite vermelho por volta do dia " + res.dia_vermelho + ".";
      else if (res.dia_amarelo) res.texto += " Ao ritmo actual, passa o limite amarelo por volta do dia " + res.dia_amarelo + ".";
      else res.texto += " Não se prevê que passe os limites até ao dia 180.";
    }
    return res;
  }

  var Modelo = { novo: novo, actualizarOCT: actualizarOCT, prever: prever, diaCruzamento: diaCruzamento,
                 actualizarRapido: actualizarRapido, treinar: treinar,
                 PARAMETROS: { TAU: TAU, PRIOR_AMP: PRIOR_AMP, PRIOR_DP: PRIOR_DP, RUIDO_DELTA: RUIDO_DELTA, MIN_TESTES: MIN_TESTES, Z_AVISO: Z_AVISO } };
  global.Modelo = Modelo;
  if (typeof module !== "undefined" && module.exports) module.exports = Modelo;
})(typeof window !== "undefined" ? window : globalThis);
