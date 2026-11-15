// =====================================================================
// teste_visao.js: fluxo do teste rápido com verificação da distância
//
// (Sem OCT: o astronauta não regista exames de OCT nesta app. O OCT só existe
//  nos astronautas simulados da demo.)
// Passos: identificação (lista ou cara) → questionário pré-exame (prontidão) →
//         distância (câmara) → Amsler olho direito →
//         Amsler olho esquerdo → leitura de perto → (óculos de reserva) →
//         4 perguntas → resultado do motor (semáforo)
//
// Cada teste é guardado no aparelho (localStorage, chave "dt_registos")
// no MESMO formato de window.ASTRONAUTAS, por isso o Motor trata um
// astronauta real exactamente como um simulado. O primeiro teste de cada
// astronauta fica como linha de base.
// =====================================================================
(function () {
  "use strict";

  var DIST_MIN = 30, DIST_MAX = 45;         // cm (provisório: equipa de saúde valida)
  var DIST_ESTAVEL_MS = 1500;               // tempo seguido na distância certa
  var CHAVE = "dt_registos";
  var LETRAS = "CDHKNORSVZ".split("");      // letras de Sloan, usadas em testes de visão
  // Altura da letra por linha (mm): começa em 8 mm e encolhe ~20% por linha.
  // Linha 10 ≈ 1 mm. PROVISÓRIO: valores a validar pela equipa de saúde.
  var ALTURA_MM = [];
  for (var i = 0; i < 10; i++) ALTURA_MM.push(8 * Math.pow(10, -0.1 * i));
  var PERGUNTAS = [
    ["perg_focar", "Dificuldade em focar ao perto?"],
    ["perg_contraste", "As cores ou o contraste parecem mais fracos?"],
    ["perg_dor_cabeca", "Dores de cabeça?"],
    ["perg_visao_dupla", "Visão dupla?"]
  ];

  var $ = function (id) { return document.getElementById(id); };
  var t = {};          // teste em curso
  var dist = { estado: null, desde: 0, leituras: [] };

  // ---------- armazenamento (app/armazenamento.js) ----------
  function registosDe(id) { return Armazem.registosDe(id); }
  function idActual() {
    var sel = $("perfil").value;
    return Armazem.normalizarId(sel === "__novo__" ? $("nome").value : sel);
  }

  // ---------- navegação ----------
  function mostrar(passo) {
    document.querySelectorAll(".passo").forEach(function (s) { s.classList.remove("activo"); });
    $(passo).classList.add("activo");
    window.scrollTo(0, 0);
    window.__passo = passo;   // usado pelos testes automáticos
  }

  function preencherPerfis(seleccionar) {
    var ps = Armazem.perfis();
    $("perfil").innerHTML = ps.map(function (p) {
      return '<option value="' + p.id + '">' + p.id + " (" + p.testes + " registo(s), último: dia " + p.ultimo_dia + ")</option>";
    }).join("") + '<option value="__novo__">+ Novo astronauta</option>';
    $("perfil").value = seleccionar && ps.some(function (p) { return p.id === seleccionar; }) ? seleccionar : (ps.length ? ps[0].id : "__novo__");
    actualizarHistorico();
  }

  function actualizarHistorico() {
    var novo = $("perfil").value === "__novo__";
    $("novo-perfil").style.display = novo ? "block" : "none";
    $("b-ver").disabled = novo || !registosDe(idActual()).length; $("b-apagar").disabled = novo;
    actualizarRosto();
    var r = novo ? [] : registosDe(idActual());
    if (r.length === 0) {
      $("historico-info").textContent = "Primeiro registo deste astronauta: vai ficar como linha de base (o normal dele).";
      $("dia").value = 0;
    } else {
      var ult = r[r.length - 1];
      $("historico-info").textContent = r.length + " registo(s) guardado(s). Último: dia " + ult.dia + ".";
      $("dia").value = ult.dia + 7;
    }
  }

  // ---------- 0. início ----------
  function lerInicio() {
    var id = idActual(), dia = parseInt($("dia").value, 10);
    if (!id) { alert("Escreve o nome ou código do astronauta."); return null; }
    if (!(dia >= 0)) { alert("Indica o dia de missão (0 ou mais)."); return null; }
    return { id: id, dia: dia };
  }
  $("perfil").addEventListener("change", actualizarHistorico);
  $("b-apagar").onclick = function () {
    var id = idActual();
    if (!confirm("Apagar todos os registos de " + id + "?")) return;
    Armazem.apagarPerfil(id);
    preencherPerfis();
  };
  $("b-ver").onclick = function () {
    var r = registosDe(idActual());
    if (r.length) mostrarResultado(idActual(), r[r.length - 1].dia);
  };
  $("b-iniciar").onclick = function () {
    var i = lerInicio(); if (!i) return;
    t = { id: i.id, dia: i.dia, zonasOD: [], zonasOE: [],
          linha: null, linhaOculos: null, melhora: 1, distanciasAcu: [], pre: null, prontidao: null };
    Armazem.criarPerfil(i.id);
    iniciarPre();
  };

  // ---------- Entrar com a cara (camara/rosto.js) ----------
  function msgRosto(texto) { $("rosto-msg").textContent = texto; $("rosto-msg").hidden = !texto; }
  function actualizarRosto() {
    var n = window.Rosto ? Rosto.registados() : [];
    $("rosto-info").textContent = n.length ? "Caras registadas: " + n.join(", ") : "Ainda sem caras registadas.";
    var novo = $("perfil").value === "__novo__";
    $("b-rosto-registar").disabled = novo;
    $("b-rosto-apagar").disabled = novo || n.indexOf(idActual()) === -1;
  }
  function comRosto(fn) {
    if (!window.Rosto) { msgRosto("Reconhecimento facial indisponível. Escolhe o perfil na lista."); return; }
    if (dist.iniciada) { Distancia.parar(); dist.iniciada = false; }
    Rosto.definirPasta("vendor/faceapi/");
    $("camara").hidden = false; $("cam-estado").textContent = "a olhar…"; $("cam-cm").textContent = "";
    msgRosto("Olha de frente para a câmara…");
    fn().then(function (r) {
      $("camara").hidden = true;
      msgRosto(r.mensagem);
      window.__rosto = r;   // usado pelos testes automáticos
      actualizarRosto();
      return r;
    });
  }
  $("b-rosto-entrar").onclick = function () {
    comRosto(function () {
      return Rosto.identificar($("video")).then(function (r) {
        if (r.ok) { Armazem.criarPerfil(r.id); preencherPerfis(r.id); }
        return r;
      });
    });
  };
  $("b-rosto-registar").onclick = function () {
    var id = idActual();
    if (!id) return;
    if (!confirm("Registar a cara de " + id + " neste aparelho? Só a própria pessoa deve fazer isto.")) return;
    comRosto(function () { return Rosto.registar($("video"), id); });
  };
  $("b-rosto-apagar").onclick = function () { Rosto.apagar(idActual()); msgRosto("Cara apagada."); actualizarRosto(); };

  // ---------- Questionário pré-exame (regras em motor/regras.js) ----------
  function iniciarPre() {
    $("pre-perguntas").innerHTML = REGRAS.prontidao.perguntas.map(function (p, n) {
      var ops = p.opcoes.map(function (o, k) {
        return p.multipla
          ? '<label><input type="checkbox" name="pre_' + p.id + '" value="' + o.v + '"> ' + o.t + "</label>"
          : '<label><input type="radio" name="pre_' + p.id + '" value="' + o.v + '"' + (k === 0 ? " checked" : "") + "> " + o.t + "</label>";
      }).join("");
      return '<div class="pre-p"><div class="q">' + (n + 1) + ". " + p.texto + "</div>" + ops + "</div>";
    }).join("");
    $("pre-estado").innerHTML = ""; $("b-pre-continuar").hidden = true; $("b-pre-avaliar").hidden = false;
    mostrar("p-pre");
  }
  $("b-pre-cancelar").onclick = function () { mostrar("p-inicio"); };
  $("b-pre-avaliar").onclick = function () {
    var resp = {};
    REGRAS.prontidao.perguntas.forEach(function (p) {
      if (p.multipla) {
        resp[p.id] = Array.prototype.map.call(document.querySelectorAll('input[name="pre_' + p.id + '"]:checked'), function (c) { return +c.value; });
      } else {
        var sel = document.querySelector('input[name="pre_' + p.id + '"]:checked');
        resp[p.id] = sel ? +sel.value : null;
      }
    });
    var pr = Motor.prontidao(resp, REGRAS);
    t.pre = resp; t.prontidao = pr;
    var nomes = { verde: "Verde: pronto", amarelo: "Amarelo: pronto com ressalvas", vermelho: "Vermelho: medição não fiável agora" };
    var html = "";
    if (pr.alerta_clinico) html += '<div class="alerta-clinico" id="pre-alerta">' + pr.texto_alerta + "</div>";
    html += '<div class="estado-pre ' + pr.estado + '" id="pre-cor" data-estado="' + pr.estado + '"><strong>' + nomes[pr.estado] + "</strong><br>" + pr.texto;
    if (pr.ressalvas.length) html += "<ul class='motivos'>" + pr.ressalvas.map(function (m) { return "<li>" + m + "</li>"; }).join("") + "</ul>";
    html += "</div>";
    $("pre-estado").innerHTML = html;
    $("b-pre-continuar").hidden = pr.estado === "vermelho";
    window.__prontidao = pr;   // usado pelos testes automáticos
    $("pre-estado").scrollIntoView();
  };
  $("b-pre-continuar").onclick = function () {
    $("camara").hidden = false;
    mostrar("p-distancia");
    if (!dist.iniciada) {
      dist.iniciada = true;
      Distancia.iniciar($("video"), { minCm: DIST_MIN, maxCm: DIST_MAX, aoMudar: aoMudarDistancia, pastaModelo: "vendor/mediapipe/" });
    }
  };

  // ---------- 1. distância ----------
  function aoMudarDistancia(r) {
    var agora = Date.now();
    if (r.estado !== dist.estado) { dist.estado = r.estado; dist.desde = agora; }
    $("camara").className = r.estado;
    $("cam-cm").textContent = r.cm ? Math.round(r.cm) + " cm" : "--";
    $("cam-estado").textContent = { ok: "distância certa", perto: "muito perto", longe: "muito longe",
                                    sem_cara: "sem cara", indisponivel: "câmara indisponível" }[r.estado] || r.estado;
    $("dist-msg").textContent = r.mensagem;
    var estavel = r.estado === "ok" && agora - dist.desde >= DIST_ESTAVEL_MS;
    $("b-dist-ok").disabled = !estavel;
    if (r.estado === "indisponivel") $("b-sem-camara").classList.add("principal");
    if (window.__passo === "p-acuidade" && r.cm) t.distanciasAcu.push(r.cm);
    if (window.__passo === "p-acuidade") {
      $("acu-dist").textContent = (r.estado === "perto" || r.estado === "longe") ? "⚠ Mantém os olhos a 30–45 cm do ecrã." : "";
    }
  }
  $("b-calibrar").onclick = function () {
    if (!Distancia.calibrar(40)) alert("Primeiro olha para a câmara até aparecer a distância.");
  };
  $("b-dist-ok").onclick = function () { t.semCamara = false; iniciarAmsler("OD"); };
  $("b-sem-camara").onclick = function () { t.semCamara = true; iniciarAmsler("OD"); };

  // ---------- 2. Amsler ----------
  (function desenharGrelha() {
    var s = "";
    for (var k = 0; k <= 20; k++) {
      var p = k * 10;
      s += '<line x1="' + p + '" y1="0" x2="' + p + '" y2="200" stroke="#000" stroke-width="' + (k % 20 === 0 ? 0 : 0.6) + '"/>';
      s += '<line x1="0" y1="' + p + '" x2="200" y2="' + p + '" stroke="#000" stroke-width="' + (k % 20 === 0 ? 0 : 0.6) + '"/>';
    }
    s += '<circle cx="100" cy="100" r="3.2" fill="#000"/>';
    $("amsler-svg").innerHTML = s;
    var html = "";
    for (var z = 0; z < 9; z++) html += '<button type="button" data-zona="' + z + '" aria-label="Zona ' + z + '"></button>';
    $("zonas").innerHTML = html;
    $("zonas").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      b.classList.toggle("marcada");
    });
  })();

  function iniciarAmsler(olho) {
    t.olho = olho;
    document.querySelectorAll("#zonas button").forEach(function (b) { b.classList.remove("marcada"); });
    var tapa = olho === "OD" ? "esquerdo" : "direito";
    var testa = olho === "OD" ? "direito" : "esquerdo";
    $("amsler-titulo").textContent = "3. Grelha de Amsler: olho " + testa;
    $("amsler-instr").innerHTML = "Tapa o <strong>olho " + tapa + "</strong> com a mão. Mantém a mesma distância.";
    mostrar("p-amsler");
  }
  $("b-amsler-seguinte").onclick = function () {
    var marcadas = [];
    document.querySelectorAll("#zonas button.marcada").forEach(function (b) { marcadas.push(+b.dataset.zona); });
    if (t.olho === "OD") { t.zonasOD = marcadas; iniciarAmsler("OE"); }
    else { t.zonasOE = marcadas; iniciarAcuidade(false); }
  };

  // ---------- 3. Acuidade ----------
  function iniciarAcuidade(comOculos) {
    t.acu = { linha: 1, tentativa: 1, ultimaLida: 0, comOculos: comOculos };
    $("acu-olhos").textContent = comOculos ? "óculos de reserva e os dois olhos abertos" : "dois olhos abertos";
    mostrar("p-acuidade");
    novaLetra();
  }
  function novaLetra() {
    var a = t.acu;
    var certa = LETRAS[Math.floor(Math.random() * LETRAS.length)];
    var outras = LETRAS.filter(function (l) { return l !== certa; }).sort(function () { return Math.random() - .5; }).slice(0, 3);
    var ops = outras.concat([certa]).sort(function () { return Math.random() - .5; });
    a.certa = certa;
    var el = $("letra");
    el.textContent = certa;
    el.dataset.certa = certa;                                     // usado pelos testes automáticos
    el.style.fontSize = (ALTURA_MM[a.linha - 1] / 0.72).toFixed(2) + "mm";   // altura de maiúscula ≈ 0,72 em
    $("acu-linha").textContent = a.linha;
    $("opcoes").innerHTML = ops.map(function (l) { return '<button type="button" data-l="' + l + '">' + l + "</button>"; }).join("") +
      '<button type="button" data-l="?">Não consigo ler</button>';
  }
  $("opcoes").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var a = t.acu;
    if (b.dataset.l === a.certa) {
      a.ultimaLida = a.linha;
      if (a.linha === 10) return fimAcuidade();
      a.linha++; a.tentativa = 1;
      novaLetra();
    } else if (a.tentativa === 1 && b.dataset.l !== "?") {
      a.tentativa = 2;                                            // uma segunda oportunidade na mesma linha
      novaLetra();
    } else {
      fimAcuidade();
    }
  });
  function fimAcuidade() {
    var lida = t.acu.ultimaLida;
    if (!t.acu.comOculos) {
      t.linha = lida;
      var anteriores = registosDe(t.id).filter(function (r) { return r.acuidade_linha !== null && r.acuidade_linha !== undefined; });
      var base = anteriores.length ? anteriores[0].acuidade_linha : null;
      if (base !== null && lida < base) { mostrar("p-oculos"); return; }
      t.melhora = 1;
    } else {
      t.linhaOculos = lida;
      t.melhora = lida > t.linha ? 1 : 0;
    }
    iniciarPerguntas();
  }
  $("b-oculos-repetir").onclick = function () { iniciarAcuidade(true); };
  $("b-oculos-nao").onclick = function () { t.melhora = 0; iniciarPerguntas(); };

  // ---------- 4. Perguntas ----------
  function iniciarPerguntas() {
    $("perguntas").innerHTML = PERGUNTAS.map(function (p) {
      var opts = [0, 1, 2, 3].map(function (v) {
        return '<label><input type="radio" name="' + p[0] + '" value="' + v + '"' + (v === 0 ? " checked" : "") + ">" + v + "</label>";
      }).join("");
      return '<div class="pergunta"><div>' + p[1] + '</div><div class="escala">' + opts + "</div></div>";
    }).join("");
    mostrar("p-perguntas");
  }
  $("b-perguntas-ok").onclick = function () {
    var reg = {
      astronauta_id: t.id, dia: t.dia,
      amsler_zonas: uniao(t.zonasOD, t.zonasOE),
      amsler_od: t.zonasOD, amsler_oe: t.zonasOE,
      acuidade_linha: t.linha, acuidade_com_oculos: t.linhaOculos, melhora_com_oculos: t.melhora,
      distancia_cm: t.distanciasAcu.length ? Math.round(media(t.distanciasAcu)) : null,
      sem_camara: !!t.semCamara,
      pre_exame: t.pre, prontidao: t.prontidao ? t.prontidao.estado : null,
      ressalvas: t.prontidao ? t.prontidao.ressalvas : [], alerta_clinico: t.prontidao ? t.prontidao.alerta_clinico : false
    };
    reg.amsler_centro = reg.amsler_zonas.indexOf(REGRAS.amsler.zona_centro) !== -1 ? 1 : 0;
    PERGUNTAS.forEach(function (p) {
      var sel = document.querySelector('input[name="' + p[0] + '"]:checked');
      reg[p[0]] = sel ? +sel.value : 0;
    });
    Armazem.guardar(reg);     // junta com o OCT do mesmo dia, se existir
    mostrarResultado(reg.astronauta_id, reg.dia);
  };

  // ---------- 5. Resultado ----------
  function mostrarResultado(id, dia) {
    var regs = registosDe(id);
    var av = Armazem.avaliar(id, dia), r = av.semaforo, mo = av.modelo;
    var reg = regs.filter(function (x) { return x.dia === dia; })[0] || {};
    var nome = { verde: "Verde", amarelo: "Amarelo", vermelho: "Vermelho", a_calibrar: "A calibrar" }[r.cor_final];
    var html = "<p><strong>" + id + "</strong> · dia " + dia + "</p>" +
               '<div class="semaforo ' + r.cor_final + '" id="cor-final" data-cor="' + r.cor_final + '">' + nome +
               "<small>" + (regs.length === 1 ? "Primeiro registo guardado como o teu normal (linha de base). " : "") + r.texto + "</small></div>";
    if (reg.alerta_clinico) html += '<div class="alerta-clinico">' + REGRAS.prontidao.textos.alerta + "</div>";
    if (r.motivos.length) html += "<p><strong>Porquê:</strong></p><ul class='motivos'>" + r.motivos.map(function (m) { return "<li>" + m + "</li>"; }).join("") + "</ul>";
    // Tendência do modelo: só aparece se houver avisos pessoais ou exames de OCT (perfis simulados).
    if (mo && (mo.avisos.length || mo.previsao)) {
      html += '<div class="previsao" id="previsao"><strong>O teu padrão (modelo que aprende contigo):</strong> ' + (mo.previsao ? mo.texto : "");
      if (mo.avisos.length) html += "<ul class='motivos'>" + mo.avisos.map(function (m) { return "<li>" + m + "</li>"; }).join("") + "</ul>";
      html += "<span class='nota'>Informativo: não muda a cor do semáforo.</span></div>";
    }
    var linhas = [];
    if (r.sinais.oct.cor !== "a_calibrar") linhas.push("OCT: retina " + (r.sinais.oct.delta_pct >= 0 ? "+" : "") + r.sinais.oct.delta_pct + "% face à linha de base (" + r.sinais.oct.cor + ")");
    if (reg.acuidade_linha !== null && reg.acuidade_linha !== undefined) {
      linhas.push("Amsler: olho direito [" + (reg.amsler_od || []).join(", ") + "], olho esquerdo [" + (reg.amsler_oe || []).join(", ") + "]");
      linhas.push("Leitura: linha " + reg.acuidade_linha + "/10" + (reg.acuidade_com_oculos !== null && reg.acuidade_com_oculos !== undefined ? " (com óculos: " + reg.acuidade_com_oculos + ")" : ""));
      linhas.push("Distância média: " + (reg.distancia_cm ? reg.distancia_cm + " cm" : "não medida"));
    }
    if (reg.prontidao && reg.prontidao !== "verde" && (reg.ressalvas || []).length)
      html += "<p class='aviso' id='ressalvas'><strong>Teste feito com ressalvas:</strong> " + reg.ressalvas.join(" ") + " Se o resultado for inesperado, repete em melhores condições.</p>";
    html += "<p class='nota'>" + linhas.join(" · ") + "</p>";
    if (REGRAS.provisorio) html += "<p class='nota'>Limites provisórios, ainda não validados pela equipa de saúde.</p>";
    $("resultado").innerHTML = html;
    window.__resultado = r; window.__modelo = mo;   // usados pelos testes automáticos
    mostrar("p-resultado");
  }
  $("b-novo").onclick = function () { preencherPerfis(t.id); mostrar("p-inicio"); };

  // ---------- utilitários ----------
  function uniao(a, b) { return a.concat(b.filter(function (x) { return a.indexOf(x) === -1; })).sort(); }
  function media(xs) { return xs.reduce(function (s, x) { return s + x; }, 0) / xs.length; }

  preencherPerfis();
  window.__passo = "p-inicio";
})();
