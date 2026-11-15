// =====================================================================
// ligacao.js: liga os ecrãs do Marllon (app/visao) ao backend
//
// Os ecrãs continuam a desenhar-se como antes. Este ficheiro só lhes dá
// DADOS VERDADEIROS quando quem entrou é um perfil real (a equipa):
//
//   ecrã (Main, Hoje, TesteRapido, ...)  ->  window.Visao  ->  Armazem / Motor / Modelo / Distancia / Rosto
//
// Dois tipos de sessão:
//   - DEMONSTRAÇÃO: os 3 astronautas fictícios do Marllon (A, B, C). Nada é guardado.
//   - REAL: um perfil guardado neste aparelho (CHANDY, EDILSON, ...). Os testes
//     ficam no Armazem e a cor vem do Motor.
//
// Chaves no localStorage (além das do front, "visao-tema", "visao-perfil", ...):
//   visao-real        id do perfil real com sessão aberta (não existe = demonstração)
//   visao-dia-<ID>    dia de missão indicado ao entrar
//
// Escalas desta interface (diferentes das do ecrã de teste app/camara):
//   acuidade: 0 a 5 linhas lidas POR OLHO (acuidade_oe, acuidade_od); acuidade_linha = a pior das duas
//   Amsler:   grelha 12x12 por olho (celulas_od, celulas_oe), convertida para as 9 zonas do motor
//   perguntas: Não/Ligeiro/Marcado -> 0/1/3
// Não misturar no mesmo perfil testes feitos aqui e em app/camara/teste_visao.html.
// =====================================================================
(function (g) {
  "use strict";

  function ler(k) { try { return g.localStorage.getItem(k); } catch (e) { return null; } }
  function escrever(k, v) { try { if (v === null) g.localStorage.removeItem(k); else g.localStorage.setItem(k, String(v)); } catch (e) { } }
  function temBackend() { return !!(g.Armazem && g.Motor && g.REGRAS); }

  // ---------- Sessão ----------
  function real() {
    var id = ler("visao-real");
    return id && temBackend() ? id : null;
  }
  function nomeDe(id) { return id.split(" ").map(function (p) { return p.charAt(0) + p.slice(1).toLowerCase(); }).join(" "); }
  function iniciais(id) { var p = id.split(" "); return (p.length > 1 ? p[0].charAt(0) + p[1].charAt(0) : id.slice(0, 2)).toUpperCase(); }
  function diaSugerido(id) {
    var r = g.Armazem.registosDe(id);
    return r.length ? r[r.length - 1].dia + 7 : 0;
  }
  function diaDe(id) {
    var d = parseInt(ler("visao-dia-" + id), 10);
    return d >= 0 ? d : diaSugerido(id);
  }
  // Íris escolhida por cada perfil (Perfil > Íris). Muda a imagem do olho e a cor do fundo.
  var IRIS_DEMO = { A: "azul", B: "original", C: "cinzento" };
  function irisDe(id) { return ler("visao-iris-" + id) || IRIS_DEMO[id] || "original"; }
  function guardarIris(id, iris) { if (id) escrever("visao-iris-" + id, iris); escrever("visao-iris", iris); }

  function entrar(id, dia, como) {
    id = g.Armazem.criarPerfil(id);
    if (!id) return null;
    escrever("visao-real", id);
    escrever("visao-iris", irisDe(id));
    escrever("visao-entrada", como === "rosto" ? "rosto" : "lista");
    escrever("visao-dia-" + id, dia >= 0 ? dia : diaSugerido(id));
    return id;
  }
  // Pré-registo (dia 0, na Terra, antes do lançamento): ficha da missão e dos olhos, guardada uma vez.
  function registoDe(id) {
    id = id || real(); if (!id) return null;
    try { return JSON.parse(g.localStorage.getItem("visao-registo-" + id)) || null; } catch (e) { return null; }
  }
  function guardarRegisto(r) {
    var id = real(); if (!id) return false;
    r = r || {}; r.data = new Date().toISOString();
    try { g.localStorage.setItem("visao-registo-" + id, JSON.stringify(r)); } catch (e) { return false; }
    escrever("visao-dia-" + id, 0);
    if (r.oct_oe && r.oct_od) g.Armazem.guardar({ astronauta_id: id, dia: 0, oct_oe: r.oct_oe, oct_od: r.oct_od, oct_um: Math.round((r.oct_oe + r.oct_od) / 2), oct_sinal: null });
    return true;
  }

  function sair() { escrever("visao-real", null); }

  // ---------- Conversões ----------
  // Célula "linha-coluna" da grelha 12x12 -> zona 0..8 da grelha 3x3 do motor (zona 4 = centro).
  function zonaDe(chave) { var p = chave.split("-"); return Math.floor(Number(p[0]) / 4) * 3 + Math.floor(Number(p[1]) / 4); }
  function zonasDe(chaves) {
    var z = {};
    (chaves || []).forEach(function (k) { z[zonaDe(k)] = true; });
    return Object.keys(z).map(Number).sort(function (a, b) { return a - b; });
  }
  var NIVEL = { a_calibrar: 0, verde: 0, amarelo: 2, vermelho: 3 };   // cores do motor -> 4 níveis do front (1 = interferência)
  var OLHO = { od: "right eye", oe: "left eye" };
  var SIGLA = { od: "RE", oe: "LE" };

  // "1 linha(s)" -> "1 line"; "2 linha(s)" -> "2 linhas"
  // O motor (motor/, pasta do Edilson) escreve os motivos em português. A app está em inglês:
  // esta função traduz esses textos aqui, sem mexer no motor.
  function lin(n) { return n === "1" ? "1 line" : n + " lines"; }
  var EN = [
    // questionário pré-exame (motivos da prontidão, REGRAS.prontidao)
    [/^Vibração\ ligeira\.$/, "Slight vibration."],
    [/^Vibração\ ou\ manobra\ significativa\.$/, "Strong vibration or manoeuvre."],
    [/^Pequenos\ reflexos\ ou\ alterações\ de\ luz\.$/, "Small glare or changes in light."],
    [/^Iluminação\ inadequada\.$/, "Inadequate lighting."],
    [/^Cansaço\ ou\ desconforto\ ligeiro\.$/, "Slight tiredness or discomfort."],
    [/^Náusea,\ tontura\ ou\ dor\ de\ cabeça\ moderada\.$/, "Nausea, dizziness or a moderate headache."],
    [/^Sintomas\ intensos\.$/, "Strong symptoms."],
    [/^Dormiu\ menos\ do\ que\ o\ habitual\.$/, "Slept less than usual."],
    [/^Sono\ muito\ perturbado\.$/, "Very poor sleep."],
    [/^Olho\ seco\.$/, "Dry eyes."],
    [/^Ardor,\ irritação\ ou\ lacrimejo\.$/, "Burning, irritation or watering."],
    [/^Visão\ flutuante\ que\ melhora\ ao\ pestanejar\.$/, "Vision fluctuates, improves after blinking."],
    [/^Exercício\ intenso\ recente\.$/, "Recent intense exercise."],
    [/^EVA\ recente\.$/, "Recent spacewalk (EVA)."],
    [/^Alteração\ recente\ da\ medicação\.$/, "Recent change in medication."],
    [/^Medicação:\ não\ tem\ a\ certeza\.$/, "Not sure about medication."],
    [/^Sem\ a\ correcção\ visual\ habitual:\ põe\ os\ óculos\ antes\ de\ continuar,\ se\ os\ tiveres\.$/, "Without your usual correction: put your glasses on before continuing, if you have them."],
    [/^Linhas tortas novas no centro da grelha de Amsler\.?$/, "New bent lines at the centre of the Amsler grid."],
    [/^Linhas tortas novas na grelha de Amsler \(zona ([\d, ]+)\)\.?$/, function (m, z) { return "New bent lines on the Amsler grid (zone " + z + ")."; }],
    [/^Grelha de Amsler igual à linha de base\.?$/, "Amsler grid same as baseline."],
    [/^Sem teste de acuidade\.?$/, "No acuity test."],
    [/^Perdeu (\d+) linha\(s\) de leitura e não melhora com os óculos de reserva\.?$/, function (m, n) { return "Lost " + lin(n) + " of reading, no better with spare glasses."; }],
    [/^Perdeu (\d+) linha\(s\) de leitura de perto\.?$/, function (m, n) { return "Lost " + lin(n) + " of near reading."; }],
    [/^Leitura de perto igual à linha de base\.?$/, "Near reading same as baseline."],
    [/^Primeiro teste guardado como linha de base\.?$/, "First test saved as baseline."],
    [/^Ainda não há teste rápido\.?$/, "No quick test yet."],
    [/^Primeiro OCT guardado como linha de base\.?$/, "First OCT saved as baseline."],
    [/^Ainda não há OCT\.?$/, "No OCT yet."],
    [/^Retina \+([\d.,]+)%, muito acima do esperado ao dia (\d+) \(limite \+([\d.,]+)%\)\.?$/, function (m, d, dia, l) { return "Retina +" + d + "%, well above expected for day " + dia + " (limit +" + l + "%)."; }],
    [/^Retina \+([\d.,]+)%, acima do esperado ao dia (\d+) \(até \+([\d.,]+)%\)\.?$/, function (m, d, dia, l) { return "Retina +" + d + "%, above expected for day " + dia + " (up to +" + l + "%)."; }],
    [/^Retina \+([\d.,]+)%, dentro do esperado ao dia (\d+)\.?$/, function (m, d, dia) { return "Retina +" + d + "%, within expected for day " + dia + "."; }],
    [/^Subida rápida desde o último OCT \(([\d.,]+) pontos % por dia\)\.?$/, function (m, t) { return "Rapid rise since the last OCT (" + t + " percentage points per day)."; }],
    [/^A calibrar o teu normal\..*$/, "Calibrating your normal. Do the next test in a week."],
    [/^Dentro do esperado\..*$/, "Within expected. Next test in a week."],
    [/^Repete daqui a 3 dias\..*$/, "Repeat in 3 days. Use the spare glasses. Check cabin CO₂."],
    [/^Avisa já o médico de voo\..*$/, "Tell the flight surgeon now. Your results package is ready."],
    [/^Leitura de perto abaixo do teu habitual \(linha ([\d.,]+); costumas ler a ([\d.,]+)\)\.?$/, function (m, a, b) { return "Near reading below your usual (line " + a + "; you usually read " + b + ")."; }],
    [/^Sintomas acima do teu habitual \(soma ([\d.,]+); costuma ser ([\d.,]+)\)\.?$/, function (m, a, b) { return "Symptoms above your usual (sum " + a + "; usually " + b + ")."; }]
  ];
  function en(t) {
    t = String(t || "");
    for (var i = 0; i < EN.length; i++) if (EN[i][0].test(t)) return t.replace(EN[i][0], EN[i][1]);
    return t;
  }

  function porOlho(r) { return r.acuidade_oe !== null && r.acuidade_oe !== undefined && r.acuidade_od !== null && r.acuidade_od !== undefined; }
  // Base para comparar: o 1.º teste feito nesta interface (com resultado de cada olho).
  function baseDe(regs) { for (var i = 0; i < regs.length; i++) if (porOlho(regs[i])) return regs[i]; return regs[0]; }

  // Dia de missão em texto: o dia 0 é o pré-registo na Terra, antes do lançamento.
  function diaTxt(d) { return Number(d) === 0 ? "Pre-flight" : "Day " + d; }

  // Histórico do astronauta com sessão aberta: só os testes dele (privacidade).
  function historico() {
    var me = eu(); if (!me) return null;
    var regs = rapidos(me.id), base = baseDe(regs);
    return {
      nome: me.nome, dia: me.dia,
      testes: regs.map(function (r) {
        var av = avaliarRegisto(base, r);
        return { dia: r.dia, rotulo: diaTxt(r.dia), oe: r.acuidade_oe, od: r.acuidade_od, acTxt: "LE " + acTxt(r, "oe") + " · RE " + acTxt(r, "od"),
                 amTxt: amTxt(r), nivel: av.primeiro ? 0 : av.nivel, primeiro: av.primeiro, prontidao: r.prontidao || "verde" };
      }),
      oct: octDe(me.id)
    };
  }

  // OCT do próprio astronauta (perfil real): registos com valores do aparelho, só deste perfil.
  function octDe(id) {
    id = id || real(); if (!id) return [];
    return g.Armazem.registosDe(id).filter(function (r) { return r.oct_oe !== null && r.oct_oe !== undefined; })
      .map(function (r) { return { dia: r.dia, oe: r.oct_oe, od: r.oct_od, sinal: r.oct_sinal }; });
  }
  function guardarOCT(oe, od, sinal) {
    var id = real(); if (!id) return null;
    return g.Armazem.guardar({ astronauta_id: id, dia: diaDe(id), oct_oe: oe, oct_od: od, oct_um: Math.round((oe + od) / 2), oct_sinal: sinal });
  }

  function rapidos(id) {
    return g.Armazem.registosDe(id).filter(function (r) { return r.acuidade_linha !== null && r.acuidade_linha !== undefined; });
  }

  // Compara um teste com a base (o 1.º teste do perfil), olho a olho, com as funções do Motor.
  function avaliarRegisto(base, reg) {
    var M = g.Motor, R = g.REGRAS, primeiro = !base || base.dia === reg.dia, sinais = [];
    ["od", "oe"].forEach(function (e) {
      var am = M.corAmsler(primeiro ? [] : (base["amsler_" + e] || []), reg["amsler_" + e] || [], R);
      sinais.push({ tipo: "amsler", olho: e, cor: am.cor, motivo: en(am.motivo).replace(/\.$/, "") + " · " + OLHO[e] + "." });
      // acuidade só se compara quando os dois testes têm o resultado de cada olho
      if (!primeiro && porOlho(base) && porOlho(reg)) {
        var ac = M.corAcuidade(base["acuidade_" + e], reg["acuidade_" + e], reg["melhora_" + e], R);
        sinais.push({ tipo: "acuidade", olho: e, cor: ac.cor, perda: ac.perda, motivo: en(ac.motivo).replace(/\.$/, "") + " · " + OLHO[e] + "." });
      }
    });
    var cor = M.piorCor(sinais.map(function (s) { return s.cor; }));
    if (cor === "a_calibrar") cor = "verde";
    var corOlho = {};
    ["od", "oe"].forEach(function (e) {
      var c = M.piorCor(sinais.filter(function (s) { return s.olho === e; }).map(function (s) { return s.cor; }));
      corOlho[e] = c === "a_calibrar" ? "verde" : c;
    });
    var marc = [reg.perg_focar, reg.perg_contraste, reg.perg_dor_cabeca, reg.perg_visao_dupla];
    var marcados = marc.filter(function (x) { return x >= 3; }).length, ligeiros = marc.filter(function (x) { return x === 1 || x === 2; }).length;
    var nSint = marcados > 0 || ligeiros >= 2 ? 2 : 0;
    // questionário pré-exame (pergunta 4): alteração visual nova → laranja; importante (3, 4) → vermelho
    var alt = Array.isArray(reg.alteracao_visual) ? reg.alteracao_visual : [];
    if (alt.some(function (v) { return v >= 3; })) nSint = 3; else if (alt.length) nSint = Math.max(nSint, 2);
    var nivel = Math.max(NIVEL[cor], nSint);
    if (nivel === 0 && reg.prontidao && reg.prontidao !== "verde") nivel = 1;      // condições duvidosas: repetir
    return {
      primeiro: primeiro, cor: cor, corOlho: corOlho, nivel: nivel, nSint: nSint,
      motivos: sinais.filter(function (s) { return s.cor === "amarelo" || s.cor === "vermelho"; }).map(function (s) { return s.motivo; }),
      sinais: sinais
    };
  }

  // ---------- O que cada ecrã pede ----------
  // Cabeçalho: quem sou eu.
  function eu() {
    var id = real(); if (!id) return null;
    var regs = rapidos(id), d = diaDe(id), base = baseDe(regs);
    return {
      id: id, nome: nomeDe(id), curto: nomeDe(id).split(" ")[0], ini: iniciais(id), dia: d,
      ola: "Hi, " + nomeDe(id).split(" ")[0] + ".",
      ant: base && base.dia !== d ? "your baseline, day " + base.dia : "no previous tests",
      papel: "Deep Thinkers team · Day " + d, testes: regs.length
    };
  }

  // Teste com que o de hoje é comparado (a base), no formato do TesteRapido.
  function anterior() {
    var id = real(); if (!id) return null;
    var d = diaDe(id);
    var base = rapidos(id).filter(function (r) { return r.dia < d && porOlho(r); })[0];
    if (!base) return { primeiro: true, ac: { esq: 0, dir: 0 }, am: { dir: [], esq: [] } };
    return {
      primeiro: false, dia: base.dia,
      ac: { esq: base.acuidade_oe === null ? 0 : base.acuidade_oe, dir: base.acuidade_od === null ? 0 : base.acuidade_od },
      am: { dir: base.celulas_od || [], esq: base.celulas_oe || [] }
    };
  }

  // Guarda o teste feito no TesteRapido e devolve a decisão do motor e o texto do modelo.
  //   t = { q: [0|1|2 x4], res: {esq:{sem,com}, dir:{sem,com}}, marks: {dir:{...}, esq:{...}}, resp: "sim"|"nao"|"naosei" }
  function guardarTeste(t) {
    var id = real(); if (!id) return null;
    var d = diaDe(id);
    var cel = { od: Object.keys(t.marks.dir || {}), oe: Object.keys(t.marks.esq || {}) };
    var zo = { od: zonasDe(cel.od), oe: zonasDe(cel.oe) };
    var uniao = zo.od.concat(zo.oe).filter(function (z, i, a) { return a.indexOf(z) === i; }).sort(function (a, b) { return a - b; });
    var ac = { oe: t.res.esq, od: t.res.dir };
    function melhora(r) { return r.com === null || r.com === undefined ? null : (r.com > r.sem ? 1 : 0); }
    var mOE = melhora(ac.oe), mOD = melhora(ac.od);
    var cam = camara.resumo();
    // Questionário pré-exame (VISION GUARD): prontidão e alerta clínico vêm do motor (Motor.prontidao).
    var qv = t.qv || {}, pr = g.Motor.prontidao(qv, g.REGRAS);
    var alt = Array.isArray(qv.alteracao_visual) ? qv.alteracao_visual : [];
    var ressalvas = pr.ressalvas.map(en);
    if (cam.n > 0 && cam.foraPct >= 40) ressalvas.push("Distance out of range in " + cam.foraPct + "% of readings.");
    var luz = cam.luz || { n: 0 };
    if (luz.n > 0 && luz.nivel !== "boa") ressalvas.push((luz.nivel === "fraca" ? "Lighting too dark" : "Too much light or glare") + " in " + luz.foraPct + "% of camera readings.");
    var reg = g.Armazem.guardar({
      astronauta_id: id, dia: d,
      amsler_zonas: uniao, amsler_od: zo.od, amsler_oe: zo.oe, amsler_centro: uniao.indexOf(g.REGRAS.amsler.zona_centro) !== -1 ? 1 : 0,
      celulas_od: cel.od, celulas_oe: cel.oe,
      escala_acuidade: 5, acuidade_oe: ac.oe.sem, acuidade_od: ac.od.sem,
      acuidade_oe_oculos: ac.oe.com, acuidade_od_oculos: ac.od.com,
      acuidade_linha: Math.min(ac.oe.sem, ac.od.sem),
      acuidade_com_oculos: (ac.oe.com !== null || ac.od.com !== null) ? Math.min(ac.oe.com === null ? ac.oe.sem : ac.oe.com, ac.od.com === null ? ac.od.sem : ac.od.com) : null,
      melhora_oe: mOE, melhora_od: mOD,
      melhora_com_oculos: (mOE === 0 || mOD === 0) ? 0 : ((mOE === 1 || mOD === 1) ? 1 : null),
      pre_exame: qv, alteracao_visual: alt,
      distancia_cm: cam.n > 0 ? cam.media : null, sem_camara: cam.n > 0 ? 0 : 1, fora_distancia_pct: cam.n > 0 ? cam.foraPct : null,
      evento_nave: qv.nave === undefined ? null : (qv.nave === 0 ? "nao" : "sim"),
      luz_media: luz.n > 0 ? luz.media : null, luz_nivel: luz.n > 0 ? luz.nivel : null,
      acertos_oe: t.acertos ? t.acertos.esq.sem[0] + "/" + t.acertos.esq.sem[1] : null,
      acertos_od: t.acertos ? t.acertos.dir.sem[0] + "/" + t.acertos.dir.sem[1] : null,
      prontidao: pr.estado === "verde" && ressalvas.length ? "amarelo" : pr.estado, ressalvas: ressalvas,
      alerta_clinico: pr.alerta_clinico
    });
    if (!reg) return { erro: "Could not save on this device." };
    var regs = rapidos(id), av = avaliarRegisto(baseDe(regs), reg);
    var modelo = g.Modelo ? g.Modelo.treinar(g.Armazem.registosDe(id), g.FAIXAS, d) : null;
    return {
      registo: reg, nivel: av.nivel, cor: av.cor, primeiro: av.primeiro, motivos: av.motivos, ressalvas: ressalvas,
      alerta_clinico: reg.alerta_clinico, distancia: cam,
      texto_motor: en((g.REGRAS.textos[av.cor] || g.REGRAS.textos.verde).mensagem),
      proximo_dias: (g.REGRAS.textos[av.cor] || g.REGRAS.textos.verde).proximo_teste_dias,
      modelo: modelo ? { avisos: (modelo.avisos || []).map(en), testes_aprendidos: modelo.estado.rapido.n } : null,
      testes: regs.length
    };
  }

  function ultimoAvaliado(id) {
    var regs = rapidos(id);
    if (!regs.length) return null;
    var u = regs[regs.length - 1];
    return { regs: regs, reg: u, av: avaliarRegisto(baseDe(regs), u) };
  }
  // Testes antigos (ecrã app/camara) só guardaram a linha geral: mostra essa, em vez de "–".
  function acTxt(r, e) {
    var v = r["acuidade_" + e];
    if (v === null || v === undefined) {
      if (r.acuidade_linha !== null && r.acuidade_linha !== undefined) return r.acuidade_linha + "/" + (r.escala_acuidade || 10);
      return "–";
    }
    return v + "/5";
  }
  function amTxt(r) {
    var n = (r.celulas_od || []).length + (r.celulas_oe || []).length;
    if (!n) return "No zones";
    return r.amsler_centro ? "Zone at centre" : n + (n === 1 ? " square" : " squares");
  }

  // Ecrã Hoje.
  function resumoHoje() {
    var me = eu(); if (!me) return null;
    var u = ultimoAvaliado(me.id);
    var E = [
      { estado: "Green · routine", cor: "var(--ok-tx)", dot: "var(--ok)" },
      { estado: "Orange · review advised", cor: "var(--warn-tx)", dot: "var(--warn)" },
      { estado: "Red · clinical priority", cor: "var(--bad-tx)", dot: "var(--bad)" }
    ];
    var IDX = { verde: 0, amarelo: 1, vermelho: 2 };
    if (!u) {
      var vazio = { valor: "–", uni: "", estado: "No tests", cor: "var(--tx3)", dot: "var(--tx3)" };
      return {
        p: { nome: me.nome, curto: me.curto, ini: me.ini, dia: me.dia, prox: me.dia, acu: "–", amsler: "–", sans: "Timeline of your tests", limTxt: "" },
        nivel: 0, semRegisto: !registoDe(me.id),
        rec: registoDe(me.id) ? { titulo: "Record your baseline", texto: "No tests stored on this device yet. Your first test becomes your pre-flight baseline." }
          : { titulo: "Pre-flight registration", texto: "Before launch, on Earth: record your mission and eye details, then your baseline tests." },
        olhoEsq: vazio, olhoDir: vazio, olhosSub: "No tests yet", alertas: "None",
        olhosNota: "Status comes from the quick tests, compared with your baseline (your first test)."
      };
    }
    var r = u.reg, av = u.av, nivel3 = av.nivel >= 3 ? 2 : (av.nivel === 2 ? 1 : 0);
    var prox = r.dia + ((g.REGRAS.textos[av.cor] || {}).proximo_teste_dias || 7);
    var titulos = ["All within your baseline", "Repeat the quick tests", "Tell the flight surgeon"];
    var texto = av.motivos.length ? av.motivos.join(" ") : (av.primeiro ? "First test saved as your baseline. Next quick test on day " + prox + "."
      : "Acuity and Amsler grid same as your baseline. Next quick test on day " + prox + ".");
    if (av.nSint && !av.motivos.length) texto = "You reported symptoms in the last test. The medical team will review them.";
    var vistos = vistosDe(me.id);
    var nAl = alertas().filter(function (a) { return a[1] >= 2 && !vistos[a[0]]; }).length;   // só os ainda não vistos
    return {
      p: { nome: me.nome, curto: me.curto, ini: me.ini, dia: me.dia, prox: prox, acu: (r.acuidade_oe === null || r.acuidade_oe === undefined) ? "Both " + acTxt(r, "oe") : "LE " + acTxt(r, "oe") + " · RE " + acTxt(r, "od"), amsler: amTxt(r), sans: "Timeline of your tests", limTxt: "" },
      nivel: nivel3, rec: { titulo: titulos[nivel3], texto: texto },
      olhoEsq: Object.assign({ valor: acTxt(r, "oe"), uni: "" }, E[IDX[av.corOlho.oe]]),
      olhoDir: Object.assign({ valor: acTxt(r, "od"), uni: "" }, E[IDX[av.corOlho.od]]),
      olhosSub: "Last quick test · day " + r.dia,
      olhosNota: "Lines read per eye and status vs your baseline (day " + baseDe(u.regs).dia + "). Decision by the rules engine from the quick tests.",
      alertas: nAl ? nAl + " to review" : "None active", nAlertas: nAl
    };
  }

  // Ecrã SANS: linha temporal [dia, nível, texto] por faixa.
  function linhaTempo() {
    var me = eu(); if (!me) return null;
    var regs = rapidos(me.id), T = { oct: [], acu: [], ams: [], sin: [], mov: [] };
    var N = { verde: 0, amarelo: 2, vermelho: 3, a_calibrar: 0 };
    regs.forEach(function (r) {
      var av = avaliarRegisto(baseDe(regs), r);
      var pior = function (tipo) { return N[g.Motor.piorCor(av.sinais.filter(function (s) { return s.tipo === tipo; }).map(function (s) { return s.cor; }))]; };
      T.acu.push([r.dia, av.primeiro ? 0 : pior("acuidade"), "LE " + acTxt(r, "oe") + " · RE " + acTxt(r, "od") + (av.primeiro ? " · baseline" : "")]);
      T.ams.push([r.dia, pior("amsler"), amTxt(r) + " · RE " + (r.celulas_od || []).length + " · LE " + (r.celulas_oe || []).length + (av.primeiro ? " · baseline" : "")]);
      var s = [["focusing", r.perg_focar], ["contrast", r.perg_contraste], ["headaches", r.perg_dor_cabeca], ["double vision", r.perg_visao_dupla]]
        .filter(function (x) { return x[1] > 0; }).map(function (x) { return x[0] + (x[1] >= 3 ? " (marked)" : " (mild)"); })
        .concat((r.alteracao_visual || []).map(function (v) { return ALT_EN[v]; }));
      if (s.length) T.sin.push([r.dia, av.nSint ? 2 : 0, s.join(", ")]);
      if (r.evento_nave === "sim" || r.evento_nave === "naosei") T.mov.push([r.dia, 4, r.pre_exame ? (r.pre_exame.nave === 2 ? "Strong vibration or manoeuvre before the test" : "Slight vibration before the test") : (r.evento_nave === "sim" ? "You felt spacecraft motion during the test" : "Spacecraft motion unconfirmed")]);
    });
    var oc = octDe(me.id);
    oc.forEach(function (o, i) {
      var pc = function (a, b) { return (a >= b ? "+" : "−") + Math.abs((a - b) / b * 100).toFixed(1) + "%"; };
      T.oct.push([o.dia, 0, i === 0 ? "OCT baseline · LE " + o.oe + " µm · RE " + o.od + " µm" : "LE " + pc(o.oe, oc[0].oe) + " · RE " + pc(o.od, oc[0].od) + " vs first OCT"]);
    });
    return T;
  }

  var ALT_EN = { 1: "blurred vision", 2: "distorted lines or dark spots", 3: "double vision or brief loss of vision", 4: "sudden loss or major worsening of vision" };

  // Alertas marcados como vistos, por perfil (perfil real: id; demonstração: "demo-" + letra).
  function vistosDe(dono) {
    dono = dono || real(); if (!dono) return {};
    try { return JSON.parse(g.localStorage.getItem("visao-vistos-" + dono)) || {}; } catch (e) { return {}; }
  }
  function guardarVistos(dono, v) {
    dono = dono || real(); if (!dono) return;
    try { g.localStorage.setItem("visao-vistos-" + dono, JSON.stringify(v || {})); } catch (e) { }
  }

  // Ecrã Alerta: [id, nível, título, quandoCurto, o quê, quando, fontes, fiabilidade, acção, revisão, links, pacote]
  function alertas() {
    var me = eu(); if (!me) return null;
    var regs = rapidos(me.id), L = [];
    regs.slice().reverse().forEach(function (r) {
      var av = avaliarRegisto(baseDe(regs), r);
      var fiab = r.sem_camara ? "Distance not measured by the camera." : "Average distance " + r.distancia_cm + " cm" + (r.fora_distancia_pct ? " · out of range in " + r.fora_distancia_pct + "% of readings." : ".");
      if ((r.ressalvas || []).length) fiab += " " + r.ressalvas.join(" ");
      var fontes = "Quick test on screen · rules engine (provisional limits) · baseline from day " + baseDe(regs).dia;
      if (av.nivel >= 2) {
        (av.motivos.length ? av.motivos : ["New change in vision reported in the pre-exam questionnaire."]).forEach(function (m, i) {
          var verm = av.nivel === 3 && /centro|não melhora/.test(m);
          L.push(["r" + r.dia + "-" + i, verm ? 3 : 2, m.replace(/\.$/, ""), diaTxt(r.dia), m + " Compared with your baseline.", diaTxt(r.dia), fontes, fiab,
            verm ? "Tell the flight surgeon now." : "Review by the medical team. Repeat the test in 2 to 3 days.", verm ? "Priority" : "Pending", ["teste", "sans"], verm]);
        });
      } else if (av.nivel === 1) {
        L.push(["r" + r.dia, 1, "Test with conditions to confirm", diaTxt(r.dia), "The result matched the baseline, but conditions may have affected the test.", diaTxt(r.dia), fontes, fiab, "Repeat the test when you can.", "Repeat", ["teste"], false]);
      }
      if (r.alerta_clinico) L.push(["c" + r.dia, 3, r.pre_exame ? "Important change in vision" : "Double vision marked", diaTxt(r.dia),
        r.pre_exame ? "In the pre-exam questionnaire you reported: " + (r.alteracao_visual || []).filter(function (v) { return v >= 3; }).map(function (v) { return ALT_EN[v]; }).join(", ") + "." : "You answered “Marked” to double vision.",
        diaTxt(r.dia), "Pre-exam questionnaire", fiab, "Tell the flight surgeon now.", "Priority", ["sans"], true]);
    });
    if (!L.length) {
      var u = regs[regs.length - 1];
      L.push(["ok", 0, u ? "Routine tests within your baseline" : "No tests yet", u ? diaTxt(u.dia) : diaTxt(me.dia),
        u ? "Acuity LE " + acTxt(u, "oe") + " · RE " + acTxt(u, "od") + ". Amsler grid: " + amTxt(u).toLowerCase() + "." : "Do your first quick test: it is saved as your baseline.",
        u ? diaTxt(u.dia) : "–", "Quick test on screen · rules engine", u ? (u.sem_camara ? "Distance not measured by the camera." : "Average distance " + u.distancia_cm + " cm.") : "–",
        "Keep the normal schedule.", "Not needed", ["teste"], false]);
    }
    return L;
  }

  // Ecrã Perfil.
  function fichaPerfil() {
    var me = eu(); if (!me) return null;
    var regs = rapidos(me.id), base = baseDe(regs), u = regs[regs.length - 1];
    var av = u ? avaliarRegisto(base, u) : null;
    var rosto = g.Rosto ? g.Rosto.registados().indexOf(me.id) !== -1 : (function () { try { return !!(JSON.parse(ler("dt_rostos")) || {})[me.id]; } catch (e) { return false; } })();
    var COR = { verde: "Green · routine", amarelo: "Orange · review", vermelho: "Red · priority" };
    var dist = regs.filter(function (r) { return r.distancia_cm; }).map(function (r) { return r.distancia_cm; });
    return {
      nome: me.nome, curto: me.curto, ini: me.ini, papel: "Deep Thinkers team", dia: me.dia,
      entrada: ler("visao-entrada") === "rosto" ? "rosto" : "lista",
      grupos: [
        { titulo: "SESSION", linhas: [["Profile", me.id], ["Mission day", diaTxt(me.dia)], ["Face registered", rosto ? "Yes · numeric descriptor only" : "No"], ["Data", "Stored on this device only"]] },
        { titulo: "QUICK TESTS", linhas: [["Tests saved", String(regs.length)], ["Baseline", base ? diaTxt(base.dia) + " · LE " + acTxt(base, "oe") + " · RE " + acTxt(base, "od") : "To do"],
          ["Last test", u ? diaTxt(u.dia) + " · LE " + acTxt(u, "oe") + " · RE " + acTxt(u, "od") : "–"], ["Amsler grid", u ? amTxt(u) : "–"]] },
        { titulo: "STATUS", linhas: [["Traffic light", av ? COR[av.cor] : "No tests"], ["Average distance", dist.length ? Math.round(dist.reduce(function (a, b) { return a + b; }, 0) / dist.length) + " cm" : "Not measured"],
          ["OCT", octDe(me.id).length ? octDe(me.id).length + (octDe(me.id).length === 1 ? " exam recorded" : " exams recorded") : "None recorded"], ["Limits", g.REGRAS.provisorio ? "Provisional · to validate" : "Validated"]] }
      ].map(function (gr) { return { titulo: gr.titulo, linhas: gr.linhas.map(function (x) { return { k: x[0], v: x[1] }; }) }; })
    };
  }

  // Ecrã Tendência: astronautas simulados (simulador.py) e faixas de referência (Monte Carlo).
  var DEMO = { A: { id: "DEMO_A", ate: 60 }, B: { id: "DEMO_B", ate: 90 }, C: { id: "DEMO_C", ate: 84 } };
  function tendencia(letra) {
    if (!g.FAIXAS || !g.ASTRONAUTAS || !g.Motor) return null;
    var cfg = DEMO[letra] || DEMO.B, F = g.FAIXAS;
    var regs = g.ASTRONAUTAS.filter(function (r) { return r.astronauta_id === cfg.id && r.dia <= cfg.ate; });
    var octs = regs.filter(function (r) { return r.oct_um !== null && r.oct_um !== undefined; });
    if (!octs.length) return null;
    var base = octs[0].oct_um;
    function faixa(nome) { return function (d) { var i = Math.max(0, Math.min(F[nome].length - 1, Math.round(d))); return F[nome][i]; }; }
    var c = g.Motor.corOCT(octs.map(function (r) { return { dia: r.dia, oct_um: r.oct_um }; }), F);
    return {
      days: octs.map(function (r) { return r.dia; }),
      vals: octs.map(function (r) { return Math.round((r.oct_um / base - 1) * 1000) / 10; }),
      p10: faixa("p10"), p90: faixa("p90"), p97: faixa("p97"),
      level: { verde: 0, amarelo: 1, vermelho: 2, a_calibrar: 0 }[c.cor], motivo: en(c.motivo), dia: octs[octs.length - 1].dia
    };
  }

  // ---------- Câmara: mede a distância durante o teste (nada é gravado) ----------
  var camara = (function () {
    var video = null, ligada = false, amostras = [], ultimoAviso = 0, ouvinte = null, ultimo = { estado: "desligada", cm: null };
    // Luz: 1 vez por segundo, a imagem da câmara é reduzida a 32x24 e mede-se o brilho médio
    // (0–100 %) e a parte de pixels saturados (reflexo/encandeamento). Nada é guardado além destes números.
    var luzAmostras = [], luzTimer = null, tela = null;
    function medirLuz() {
      if (!video || !ligada || video.readyState < 2 || !video.videoWidth) return;
      try {
        if (!tela) { tela = g.document.createElement("canvas"); tela.width = 32; tela.height = 24; }
        var cx = tela.getContext("2d", { willReadFrequently: true });
        cx.drawImage(video, 0, 0, 32, 24);
        var px = cx.getImageData(0, 0, 32, 24).data, soma = 0, sat = 0, n = px.length / 4;
        for (var i = 0; i < px.length; i += 4) {
          var y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          soma += y; if (y > 245) sat++;
        }
        var media = soma / n / 255 * 100, satPct = sat / n * 100;
        luzAmostras.push({ b: media, nivel: media < 22 ? "fraca" : (satPct > 12 || media > 85 ? "forte" : "boa") });
      } catch (e) { }
    }
    function aoMudar(r) {
      ultimo = r;
      if (r.estado === "ok" || r.estado === "perto" || r.estado === "longe") amostras.push({ cm: r.cm, ok: r.estado === "ok" });
      var agora = Date.now();
      if (ouvinte && agora - ultimoAviso > 400) { ultimoAviso = agora; ouvinte(r); }
    }
    return {
      disponivel: function () { return !!(g.Distancia && g.FaceDetection && g.navigator.mediaDevices && g.location.protocol !== "file:"); },
      iniciar: function (minCm, maxCm, fn) {
        ouvinte = fn;
        if (!this.disponivel()) { ultimo = { estado: "indisponivel", cm: null }; if (fn) fn(ultimo); return; }
        if (ligada) { g.Distancia.definirIntervalo(minCm, maxCm); return; }
        if (!video) {
          video = g.document.createElement("video");
          video.setAttribute("playsinline", ""); video.muted = true;
          video.className = "fixo";
          g.document.body.appendChild(video);
          g.DC_FIXOS = g.DC_FIXOS || {}; g.DC_FIXOS.camara = video;     // aparece onde o ecrã tiver data-fixo="camara"
          if (g.DC_encaixarFixos) g.DC_encaixarFixos();
        }
        ligada = true;
        if (!luzTimer) luzTimer = g.setInterval(medirLuz, 1000);
        g.Distancia.iniciar(video, { minCm: minCm, maxCm: maxCm, aoMudar: aoMudar, pastaModelo: "../camara/vendor/mediapipe/" });
      },
      parar: function () { if (ligada) { g.Distancia.parar(); ligada = false; } if (luzTimer) { g.clearInterval(luzTimer); luzTimer = null; } ouvinte = null; },
      limpar: function () { amostras = []; luzAmostras = []; },
      luz: function () {
        if (!luzAmostras.length) return { n: 0, media: null, nivel: null, foraPct: null };
        var m = luzAmostras.reduce(function (s, a) { return s + a.b; }, 0) / luzAmostras.length;
        var fracas = luzAmostras.filter(function (a) { return a.nivel === "fraca"; }).length;
        var fortes = luzAmostras.filter(function (a) { return a.nivel === "forte"; }).length;
        var fora = fracas + fortes;
        return { n: luzAmostras.length, media: Math.round(m), foraPct: Math.round(fora / luzAmostras.length * 100),
                 nivel: fora / luzAmostras.length < 0.4 ? "boa" : (fracas >= fortes ? "fraca" : "forte") };
      },
      ultimo: function () { return ultimo; },
      resumo: function () {
        if (!amostras.length) return { n: 0, media: null, foraPct: null, luz: this.luz() };
        var m = amostras.reduce(function (s, a) { return s + a.cm; }, 0) / amostras.length;
        var fora = amostras.filter(function (a) { return !a.ok; }).length;
        return { n: amostras.length, media: Math.round(m), foraPct: Math.round(fora / amostras.length * 100), luz: this.luz() };
      }
    };
  })();

  // Relatório final: dados da missão que dão contexto ao resultado.
  //   microgravidade: dia da missão e o espessamento da retina esperado nesse dia na população de referência
  //   (faixas P50/P90 de dados/faixas.json, calibradas com Macias et al. 2020);
  //   oct: último OCT (só nos perfis de demonstração; a bordo não há OCT nos perfis reais).
  function missao(dia, letraDemo) {
    var F = g.FAIXAS, d = Math.max(0, Number(dia) || 0), r = { microgravidade: { dia: d }, oct: null };
    if (F && F.p50) {
      var i = Math.max(0, Math.min(F.p50.length - 1, Math.round(d)));
      r.microgravidade.p50 = Math.round(F.p50[i] * 10) / 10;
      r.microgravidade.p90 = Math.round(F.p90[i] * 10) / 10;
      r.microgravidade.fonte = "Macias et al. 2020";
    }
    if (real()) {
      // perfil real: o último OCT que o próprio astronauta registou (contexto; não muda a cor)
      var oc = octDe();
      if (oc.length) {
        var u = oc[oc.length - 1], dl = Math.round((u.oe - oc[0].oe) / oc[0].oe * 1000) / 10, lim = r.microgravidade.p90;
        r.oct = { dia: u.dia, delta: dl, p90: lim === undefined ? 0 : lim, level: lim !== undefined && oc.length > 1 && dl > lim ? 1 : 0, motivo: "the medical team reviews it." };
      }
    }
    if (!real() && letraDemo) {
      var t = tendencia(letraDemo);
      if (t) r.oct = { dia: t.dia, delta: t.vals[t.vals.length - 1], p90: Math.round(t.p90(t.dia) * 10) / 10, level: t.level, motivo: t.motivo };
    }
    return r;
  }

  // Remove um perfil que não é da equipa: testes, rosto e preferências (os da equipa ficam sempre).
  function removerPerfil(id) {
    if (!temBackend()) return false;
    if (!id || g.Armazem.EQUIPA.indexOf(g.Armazem.normalizarId(id)) !== -1) return false;
    g.Armazem.apagarPerfil(id);
    // também por id exacto, caso o registo tenha um id fora do formato normal
    try {
      var ps = JSON.parse(ler("dt_perfis")) || [];
      escrever("dt_perfis", JSON.stringify(ps.filter(function (x) { return x !== id; })));
      var rs = JSON.parse(ler("dt_registos")) || [];
      escrever("dt_registos", JSON.stringify(rs.filter(function (r) { return r.astronauta_id !== id; })));
    } catch (e) { }
    try { var r = JSON.parse(ler("dt_rostos")) || {}; delete r[id]; g.localStorage.setItem("dt_rostos", JSON.stringify(r)); } catch (e) { }
    escrever("visao-iris-" + id, null); escrever("visao-dia-" + id, null); escrever("visao-registo-" + id, null); escrever("visao-vistos-" + id, null);
    if (ler("visao-real") === id) escrever("visao-real", null);
    return true;
  }
  // Limpeza: o perfil "Autro1" foi criado por engano num teste. A comparação ignora espaços,
  // zero/letra O e um/letra l/I (o nome pode ter sido escrito como "AUTR01", "AUTRO l", ...).
  function eAutro1(id) { return String(id).toUpperCase().replace(/\s+/g, "").replace(/0/g, "O").replace(/[LI|]/g, "1") === "AUTRO1"; }
  if (temBackend()) {
    try { g.Armazem.perfis().forEach(function (p) { if (eAutro1(p.id)) removerPerfil(p.id); }); } catch (e) { }
  }

  g.Visao = {
    temBackend: temBackend, real: real, removerPerfil: removerPerfil, irisDe: irisDe, guardarIris: guardarIris, eu: eu, entrar: entrar, sair: sair, diaSugerido: diaSugerido, nomeDe: nomeDe, iniciais: iniciais,
    selo: function () { return real() ? "Real data · this device only" : "Simulated data"; },
    anterior: anterior, guardarTeste: guardarTeste, resumoHoje: resumoHoje, linhaTempo: linhaTempo, alertas: alertas,
    fichaPerfil: fichaPerfil, tendencia: tendencia, camara: camara, missao: missao, en: en, octDe: octDe, guardarOCT: guardarOCT, historico: historico, diaTxt: diaTxt, registoDe: registoDe, guardarRegisto: guardarRegisto, vistosDe: vistosDe, guardarVistos: guardarVistos,
    _zonasDe: zonasDe, _avaliarRegisto: avaliarRegisto
  };
})(typeof window !== "undefined" ? window : globalThis);
