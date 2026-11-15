// =====================================================================
// voz.js: spoken instructions and voice commands (English)
//
// 1. SPEAK (speech synthesis): uses the voices installed on the system
//    (Mac, iPad, Windows, Android). Prefers a local English voice.
//    No voice installed -> the app keeps working with text only.
//
// 2. LISTEN (speech recognition) to answer the letters by voice:
//    a) ON THE DEVICE (processLocally = true; recent Chrome/Edge): the sound never
//       leaves the device. The English pack is downloaded once, with internet,
//       before the mission (Voz.prepararMicrofone(), "Prepare voice" on index.html).
//    b) ONLINE (Safari and others): the browser sends the sound to its own
//       service (Apple / Google) and needs internet. Only used if the astronaut
//       allows it explicitly (second tap on "Microphone"); the choice is remembered
//       on this device in "visao-voz-online".
//    Without either, the astronaut uses the buttons.
//
// Use:
//   Voz.falar("Which letter do you see?")
//   Voz.ligada() / Voz.alternar()                       spoken instructions on/off
//   Voz.ligarMicrofone(aoOuvir, aoEstado, permitirOnline)
//        aoOuvir(text), aoEstado({estado, mensagem})
//        estado: desligado | a_preparar | a_ouvir | precisa_online | sem_pacote | indisponivel | erro
//   Voz.desligarMicrofone()
//   Voz.interpretar("F P next", letters)  -> [{tipo:"letra", v:"F"}, {tipo:"letra", v:"P"}, {tipo:"seguinte"}]
// =====================================================================
(function (g) {
  "use strict";
  var CHAVE = "visao-voz";              // "1" speak, "0" silent
  var CHAVE_ONLINE = "visao-voz-online"; // "1" = online recognition allowed on this device
  // Língua da app (botão PT/EN, i18n.js): voz e reconhecimento seguem-na.
  function emPT() { return !!(g.I18N && g.I18N.lingua() === "pt"); }
  var IDIOMAS_EN = ["en-US", "en-GB"], IDIOMAS_PT = ["pt-PT", "pt-BR"];
  var IDIOMAS = IDIOMAS_EN;
  function idiomas() { IDIOMAS = emPT() ? IDIOMAS_PT : IDIOMAS_EN; return IDIOMAS; }
  var voz = null, aFalar = false;

  function ler(k) { try { return g.localStorage.getItem(k); } catch (e) { return null; } }
  function escrever(k, v) { try { g.localStorage.setItem(k, v); } catch (e) { } }
  var sintese = g.speechSynthesis || null;

  function escolherVoz(pt) {
    if (!sintese) return null;
    var vs = sintese.getVoices() || [];
    function procura(f) { for (var i = 0; i < vs.length; i++) if (f(vs[i])) return vs[i]; return null; }
    if (pt) return procura(function (v) { return /^pt[-_]PT/i.test(v.lang) && v.localService; }) ||
                   procura(function (v) { return /^pt/i.test(v.lang) && v.localService; }) ||
                   procura(function (v) { return /^pt/i.test(v.lang); });
    return procura(function (v) { return /^en[-_](GB|US)/i.test(v.lang) && v.localService; }) ||
           procura(function (v) { return /^en/i.test(v.lang) && v.localService; }) ||
           procura(function (v) { return /^en/i.test(v.lang); });
  }
  var vozPT = null;
  if (sintese) {
    voz = escolherVoz(false); vozPT = escolherVoz(true);
    if (typeof sintese.addEventListener === "function") sintese.addEventListener("voiceschanged", function () { voz = escolherVoz(false); vozPT = escolherVoz(true); });
  }

  function ligada() { return ler(CHAVE) !== "0"; }
  function podeFalar() { return !!(sintese && g.SpeechSynthesisUtterance); }

  // semInterromper = true: does not cut an instruction being spoken (e.g. distance hints).
  function falar(texto, semInterromper) {
    if (!texto || !ligada() || !podeFalar()) return false;
    if (semInterromper && (aFalar || sintese.speaking)) return false;
    try {
      sintese.cancel();
      // Em português: o texto (escrito em inglês na app) passa pelo dicionário e usa a voz portuguesa do sistema.
      var pt = emPT();
      if (pt && g.I18N) texto = g.I18N.t(texto);
      var u = new g.SpeechSynthesisUtterance(texto);
      var vz = pt ? vozPT : voz;
      if (vz) { u.voice = vz; u.lang = vz.lang; } else { u.lang = pt ? "pt-PT" : "en-US"; }
      u.rate = 0.95;
      aFalar = true; pausarOuvir();
      u.onend = u.onerror = function () { aFalar = false; retomarOuvir(); };
      sintese.speak(u);
      return true;
    } catch (e) { aFalar = false; return false; }
  }
  function calar() { pararClip(); try { if (sintese) sintese.cancel(); } catch (e) { } aFalar = false; retomarOuvir(); }

  // ------------------------------------------------------------------
  // Recorded voice (ElevenLabs MP3 in app/visao/audio/, generated once before the mission)
  // falarClip(["end_left_3", "then_right_eye"], "fallback text"): plays the files in order;
  // if any file is missing or cannot play, says the fallback text with the system voice.
  // ------------------------------------------------------------------
  var PASTA_AUDIO = "audio/";
  var clipAtual = null, filaId = 0;
  function pararClip() { filaId++; if (clipAtual) { try { clipAtual.pause(); } catch (e) { } clipAtual = null; } }
  function falarClip(clips, texto, semInterromper) {
    if (!ligada()) return false;
    // Os MP3 gravados são em inglês: em português usa a voz do sistema.
    if (!clips || !clips.length || !g.Audio || emPT()) return falar(texto, semInterromper);
    if (semInterromper && (aFalar || (sintese && sintese.speaking))) return false;
    pararClip();
    try { if (sintese) sintese.cancel(); } catch (e) { }
    var id = filaId, i = 0;
    aFalar = true; pausarOuvir();
    function fim() { if (id !== filaId) return; clipAtual = null; aFalar = false; retomarOuvir(); }
    function falhou() { if (id !== filaId) return; clipAtual = null; aFalar = false; falar(texto); }
    function seguinte() {
      if (id !== filaId) return;
      if (i >= clips.length) { fim(); return; }
      var a = new g.Audio(PASTA_AUDIO + clips[i++] + ".mp3");
      clipAtual = a;
      a.onended = seguinte;
      a.onerror = falhou;
      var p = a.play();
      if (p && p.catch) p.catch(falhou);
    }
    seguinte();
    return true;
  }

  // ------------------------------------------------------------------
  // Speech recognition
  // ------------------------------------------------------------------
  var R = g.SpeechRecognition || g.webkitSpeechRecognition || null;
  var mic = { querido: false, rec: null, idioma: null, local: false, aoOuvir: null, aoEstado: null, estado: "desligado", pausado: false };

  function estado(e, msg) {
    mic.estado = e;
    if (mic.aoEstado) mic.aoEstado({ estado: e, mensagem: msg || "" });
  }
  function suportaLocal() { return !!(R && "processLocally" in R.prototype && typeof R.available === "function"); }
  function onlinePermitido() { return ler(CHAVE_ONLINE) === "1"; }

  // Looks for an English language pack already installed on the device.
  function idiomaLocal() {
    var i = 0; idiomas();
    function tenta() {
      if (i >= IDIOMAS.length) return Promise.resolve({ idioma: null });
      var lg = IDIOMAS[i++];
      return Promise.resolve(R.available({ langs: [lg], processLocally: true })).then(function (st) {
        if (st === "available") return { idioma: lg };
        return tenta().then(function (r) { if (!r.idioma && (st === "downloadable" || st === "downloading")) r.descarregavel = true; return r; });
      }, tenta);
    }
    return tenta();
  }

  function criar() {
    var rec = new R();
    rec.lang = mic.idioma; rec.continuous = true; rec.interimResults = false; rec.maxAlternatives = 1;
    if (mic.local) rec.processLocally = true;
    rec.onresult = function (ev) {
      for (var k = ev.resultIndex; k < ev.results.length; k++) {
        if (ev.results[k].isFinal && mic.aoOuvir && !aFalar) mic.aoOuvir(ev.results[k][0].transcript || "");
      }
    };
    rec.onerror = function (ev) {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") { mic.querido = false; estado("erro", "The browser did not allow the microphone. Use the buttons."); }
      else if (ev.error === "network") { mic.querido = false; estado("erro", "Speech recognition needs internet in this browser and there is none. Use the buttons."); }
      else if (ev.error === "language-not-supported") { mic.querido = false; estado("erro", emPT() ? "O reconhecimento de voz em português não está disponível aqui. Usa os botões." : "English speech recognition is not available here. Use the buttons."); }
    };
    rec.onend = function () {
      // Browsers stop after some silence: keep listening while the microphone is on.
      if (mic.querido && !mic.pausado) { try { rec.start(); } catch (e) { } }
    };
    return rec;
  }

  function arrancar() {
    mic.rec = criar();
    try {
      mic.rec.start();
      estado("a_ouvir", mic.local
        ? "Listening (on this device). Say the letters, “next”, “delete” or “can't read”."
        : "Listening (online service). Say the letters, “next”, “delete” or “can't read”.");
    } catch (e) { mic.querido = false; estado("erro", "Could not start the microphone. Use the buttons."); }
  }

  function ligarMicrofone(aoOuvir, aoEstado, permitirOnline) {
    mic.aoOuvir = aoOuvir; mic.aoEstado = aoEstado; mic.querido = true;
    if (!R) { mic.querido = false; estado("indisponivel", "This browser has no speech recognition. Use the buttons."); return; }
    if (permitirOnline) escrever(CHAVE_ONLINE, "1");
    // Without on-device recognition: online only with explicit permission.
    if (!suportaLocal()) {
      if (!onlinePermitido()) {
        mic.querido = false;
        estado("precisa_online", "This browser recognises speech through its online service (Apple or Google): your voice leaves the device and it needs internet. Tap “Allow online voice” to use it, or use the buttons.");
        return;
      }
      mic.local = false; mic.idioma = idiomas()[0];
      arrancar();
      return;
    }
    estado("a_preparar", "Preparing the microphone…");
    idiomaLocal().then(function (r) {
      if (!mic.querido) return;
      if (r.idioma) { mic.local = true; mic.idioma = r.idioma; arrancar(); return; }
      if (onlinePermitido()) { mic.local = false; mic.idioma = idiomas()[0]; arrancar(); return; }
      mic.querido = false;
      estado(r.descarregavel ? "sem_pacote" : "precisa_online", r.descarregavel
        ? "The English speech pack is not on this device yet. Download it once, with internet, before the mission (“Prepare voice” on the start page), or tap “Allow online voice”."
        : "On-device English speech recognition is not available. Tap “Allow online voice” to use the browser's online service, or use the buttons.");
    }, function () { mic.querido = false; estado("erro", "Could not start the microphone. Use the buttons."); });
  }
  function desligarMicrofone() {
    mic.querido = false;
    if (mic.rec) { try { mic.rec.onend = null; mic.rec.abort(); } catch (e) { } mic.rec = null; }
    estado("desligado", "");
  }
  function pausarOuvir() { if (mic.rec && mic.querido) { mic.pausado = true; try { mic.rec.stop(); } catch (e) { } } }
  function retomarOuvir() { if (mic.rec && mic.querido && mic.pausado) { mic.pausado = false; try { mic.rec.start(); } catch (e) { } } }

  // Downloads the English pack (needs internet ONCE, before the mission).
  function prepararMicrofone() {
    if (!suportaLocal() || typeof R.install !== "function") return Promise.resolve({ ok: false, mensagem: "This browser cannot recognise speech on the device. In the test you can allow the online voice instead." });
    return idiomaLocal().then(function (r) {
      if (r.idioma) return { ok: true, mensagem: "Speech recognition ready (" + r.idioma + "), no internet needed." };
      var lg = idiomas()[0];
      return Promise.resolve(R.install({ langs: [lg], processLocally: true })).then(function (ok) {
        return ok ? { ok: true, mensagem: "Voice pack downloaded (" + lg + "). It now works offline." } : { ok: false, mensagem: "Could not download the voice pack." };
      });
    }).catch(function () { return { ok: false, mensagem: "Could not prepare speech recognition." }; });
  }

  // ------------------------------------------------------------------
  // Understanding what was said
  // ------------------------------------------------------------------
  function semAcentos(s) { return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s; }
  var NOMES = {
    C: ["c", "see", "sea", "si", "cee"], D: ["d", "dee", "de"], E: ["e", "ee", "eh"], F: ["f", "ef", "eff", "efe"],
    L: ["l", "el", "ell", "elle", "ele"], O: ["o", "oh", "owe"], P: ["p", "pee", "pea", "pe"], T: ["t", "tee", "tea", "te"], Z: ["z", "zee", "zed", "ze"],
    H: ["h", "aitch", "haitch", "eitch"], K: ["k", "kay", "kei"], N: ["n", "en", "enn"], R: ["r", "ar", "are", "arr"],
    S: ["s", "ess", "es"], V: ["v", "vee", "vi"]
  };
  // Português (pt-PT): "cê", "dê", "é", "efe", "agá", "cá", "ele", "ene", "ó", "pê", "erre", "esse", "tê", "vê", "zê"
  var NOMES_PT = {
    C: ["c", "ce", "se"], D: ["d", "de"], E: ["e", "eh"], F: ["f", "efe"], H: ["h", "aga"], K: ["k", "ca", "capa", "kapa"], L: ["l", "ele"],
    N: ["n", "ene"], O: ["o", "oh"], P: ["p", "pe"], R: ["r", "erre"], S: ["s", "esse"], T: ["t", "te"], V: ["v", "ve"], Z: ["z", "ze"]
  };
  var MAPA = {}, MAPA_PT = {};
  Object.keys(NOMES).forEach(function (L) { NOMES[L].forEach(function (n) { MAPA[n] = L; }); });
  Object.keys(NOMES_PT).forEach(function (L) { NOMES_PT[L].forEach(function (n) { MAPA_PT[n] = L; }); });
  var COMANDOS = [
    ["nao_consigo", /\b(can'?t read|cannot read|can'?t see|cannot see|i can'?t|no idea|nao consigo|nao vejo)\b/],
    ["tudo_direito", /\b(all straight|all looks straight|looks straight|everything straight|all good|tudo direito|vejo tudo direito|esta tudo direito)\b/],
    ["seguinte", /\b(next|continue|go on|proceed|seguinte|proximo|continuar|avancar)\b/],
    ["apagar", /\b(delete|undo|erase|back ?space|wrong|apagar)\b/],
    ["repetir", /\b(repeat|again|say again|repetir|outra vez|de novo)\b/],
    ["concluir", /\b(done|finish|finished|concluir|terminar|terminei|pronto)\b/]
  ];
  // Returns letters and commands in the order they were said (letters first: "F P next").
  function interpretar(texto, permitidas) {
    var t = semAcentos(String(texto || "").toLowerCase()).replace(/[.,;:!?«»“”"]/g, " ").replace(/\s+/g, " ").trim();
    var saida = [];
    for (var c = 0; c < COMANDOS.length; c++) {
      if (COMANDOS[c][1].test(t)) { saida.push({ tipo: COMANDOS[c][0] }); t = t.replace(COMANDOS[c][1], " "); }
    }
    var ok = permitidas || Object.keys(NOMES);
    var letras = [];
    t.split(" ").forEach(function (tok) {
      if (!tok) return;
      tok = tok.replace(/^letter$/, "");
      if (!tok) return;
      var L = (emPT() ? MAPA_PT : MAPA)[tok];
      if (L && ok.indexOf(L) !== -1) { letras.push({ tipo: "letra", v: L }); return; }
      // "TOZ" said together: split, if every character is a test letter
      if (tok.length >= 2 && tok.length <= 5 && tok.split("").every(function (ch) { return ok.indexOf(ch.toUpperCase()) !== -1; })) {
        tok.split("").forEach(function (ch) { letras.push({ tipo: "letra", v: ch.toUpperCase() }); });
      }
    });
    return letras.concat(saida);
  }

  g.Voz = {
    falar: falar, falarClip: falarClip, calar: calar, ligada: ligada, podeFalar: podeFalar,
    alternar: function () { var n = !ligada(); escrever(CHAVE, n ? "1" : "0"); if (!n) calar(); return n; },
    temVozInglesa: function () { return !!voz; },
    ligarMicrofone: ligarMicrofone, desligarMicrofone: desligarMicrofone, prepararMicrofone: prepararMicrofone,
    microfone: function () { return mic.estado; },
    microfonePossivel: function () { return suportaLocal(); },
    onlinePermitido: onlinePermitido,
    esquecerOnline: function () { try { g.localStorage.removeItem(CHAVE_ONLINE); } catch (e) { } },
    interpretar: interpretar
  };
})(typeof window !== "undefined" ? window : globalThis);
