// =====================================================================
// rosto.js: entrar no perfil pela cara (reconhecimento facial, offline)
//
// Como funciona:
//   1. REGISTO (uma vez por pessoa, com o consentimento dela): a câmara tira
//      algumas imagens e o modelo transforma a cara num "descritor"
//      (128 números). Guarda-se SÓ o descritor, no aparelho (localStorage,
//      chave "dt_rostos"). Nenhuma fotografia é guardada nem enviada.
//   2. ENTRADA: calcula-se o descritor da cara em frente à câmara e
//      procura-se o perfil registado mais parecido (distância euclidiana).
//      Se a distância for menor do que LIMIAR, entra nesse perfil.
//
// É uma conveniência, não segurança: a pessoa pode sempre escolher o
// perfil à mão, e gémeos ou fotografias podem enganar o sistema.
//
// Uso (precisa de http://localhost, como o resto da câmara):
//   <script src="camara/vendor/faceapi/face-api.js"></script>
//   <script src="camara/rosto.js"></script>
//   Rosto.registar(video, "MARLLON")  -> Promise {ok, amostras, mensagem}
//   Rosto.identificar(video)          -> Promise {ok, id, distancia, mensagem}
//   Rosto.preparar()                  -> carrega e aquece os modelos (sem ligar a câmara); torna a entrada rápida
//   Rosto.registados()                -> ["MARLLON", ...]
//   Rosto.apagar("MARLLON")
// =====================================================================
(function (global) {
  "use strict";

  var CHAVE = "dt_rostos";
  var LIMIAR = 0.5;          // distância máxima para aceitar (menor = mais exigente)
  var MARGEM = 0.05;         // o 1.º candidato tem de ser claramente melhor do que o 2.º
  var AMOSTRAS = 5;          // imagens usadas no registo
  var TEMPO_REGISTO = 10000; // ms a procurar a cara antes de desistir (registo)
  var TEMPO_ENTRAR = 6000;   // ms a procurar a cara antes de desistir (entrada); entra logo que a reconhece
  var CERTO = 0.46;          // distância a que uma só imagem chega para entrar (sem esperar por mais)
  var PAUSA = 30;            // ms entre imagens
  var pasta = "camara/vendor/faceapi/";
  var carregado = null, aquecido = null;

  function ler() { try { return JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch (e) { return {}; } }
  function escrever(o) { try { localStorage.setItem(CHAVE, JSON.stringify(o)); return true; } catch (e) { return false; } }

  function carregar() {
    if (!global.faceapi) return Promise.reject(new Error("face-api not loaded"));
    if (!carregado) {
      carregado = Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(pasta),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(pasta),
        faceapi.nets.faceRecognitionNet.loadFromUri(pasta)
      ]);
    }
    return carregado;
  }

  // Carrega os modelos e faz uma análise a uma imagem vazia, para o navegador preparar os cálculos.
  // Chamar ao abrir o ecrã de entrada: assim, quando a pessoa toca em "Sign in with face", já está tudo pronto.
  // Não liga a câmara.
  function preparar() {
    if (!aquecido) {
      aquecido = carregar().then(function () {
        var c = global.document.createElement("canvas"); c.width = 160; c.height = 120;
        c.getContext("2d").fillRect(0, 0, 160, 120);
        var op = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.6 });
        return faceapi.detectAllFaces(c, op).withFaceLandmarks(true).withFaceDescriptors();
      }).then(function () {
        // aquece também a rede de reconhecimento (a parte mais pesada)
        var c = global.document.createElement("canvas"); c.width = 150; c.height = 150;
        c.getContext("2d").fillRect(0, 0, 150, 150);
        return faceapi.nets.faceRecognitionNet.computeFaceDescriptor(c);
      }).then(function () { return true; }, function () { aquecido = null; return false; });
    }
    return aquecido;
  }

  function abrirCamara(video) {
    if (video.srcObject && video.srcObject.active) return Promise.resolve(false);   // já aberta por outro módulo
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then(function (s) { video.srcObject = s; video.muted = true; video.setAttribute("playsinline", ""); return video.play(); })
      .then(function () { return true; });
  }
  function fecharCamara(video, abertaAqui) {
    if (abertaAqui && video.srcObject) { video.srcObject.getTracks().forEach(function (t) { t.stop(); }); video.srcObject = null; }
  }
  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Um descritor (Float32Array de 128) da única cara visível, ou null.
  function descritor(video) {
    var op = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.6 });
    return faceapi.detectAllFaces(video, op).withFaceLandmarks(true).withFaceDescriptors().then(function (r) {
      if (r.length !== 1) return null;            // nenhuma cara, ou mais do que uma: não decide
      return r[0].descriptor;
    });
  }

  // chega(lista) = true pára logo (ex.: a 1.ª imagem já identifica a pessoa com folga).
  function recolher(video, quantas, maxMs, chega) {
    var lista = [], fim = Date.now() + (maxMs || TEMPO_REGISTO);
    function passo() {
      if (lista.length >= quantas || Date.now() > fim || (chega && lista.length && chega(lista))) return Promise.resolve(lista);
      return descritor(video).then(function (d) { if (d) lista.push(Array.from(d)); return esperar(PAUSA); }).then(passo);
    }
    return passo();
  }

  function media(lista) {
    var m = new Array(lista[0].length).fill(0);
    lista.forEach(function (d) { d.forEach(function (v, k) { m[k] += v / lista.length; }); });
    return m;
  }
  function distancia(a, b) {
    var s = 0;
    for (var k = 0; k < a.length; k++) s += (a[k] - b[k]) * (a[k] - b[k]);
    return Math.sqrt(s);
  }

  // Função pura (testável): devolve o perfil mais próximo, ou null.
  function comparar(desc, rostos, limiar, margem) {
    var ord = Object.keys(rostos).map(function (id) { return { id: id, distancia: distancia(desc, rostos[id]) }; })
      .sort(function (a, b) { return a.distancia - b.distancia; });
    if (!ord.length) return { id: null, distancia: null, motivo: "sem_registos" };
    var m = ord[0];
    if (m.distancia > (limiar === undefined ? LIMIAR : limiar)) return { id: null, distancia: m.distancia, motivo: "desconhecido" };
    if (ord.length > 1 && ord[1].distancia - m.distancia < (margem === undefined ? MARGEM : margem)) return { id: null, distancia: m.distancia, motivo: "ambiguo" };
    return { id: m.id, distancia: m.distancia, motivo: "ok" };
  }

  function comCamara(video, fn) {
    var aberta = false;
    // Modelos e câmara arrancam ao mesmo tempo (antes era um depois do outro).
    var cam = abrirCamara(video).then(function (a) { aberta = a; return a; });
    return Promise.all([carregar(), cam])
      .then(function () { return esperar(80); })
      .then(fn)
      .then(function (r) { fecharCamara(video, aberta); return r; },
            function (e) { cam.then(function () { fecharCamara(video, aberta); }, function () {}); return { ok: false, id: null, erro: String(e && e.message || e), mensagem: "Camera or model unavailable. Pick your profile from the list." }; });
  }

  function registar(video, id) {
    return comCamara(video, function () {
      return recolher(video, AMOSTRAS, TEMPO_REGISTO).then(function (lista) {
        if (lista.length < 3) return { ok: false, amostras: lista.length, mensagem: "I could not see your face clearly. Look straight at the camera, in good light, alone in the frame." };
        var r = ler(); r[id] = media(lista);
        if (!escrever(r)) return { ok: false, amostras: lista.length, mensagem: "Could not save on this device." };
        return { ok: true, amostras: lista.length, mensagem: "Face registered for " + id + "." };
      });
    });
  }

  function identificar(video) {
    return comCamara(video, function () {
      var rostos = ler();
      if (!Object.keys(rostos).length) return { ok: false, id: null, mensagem: "No one has registered a face on this device yet." };
      // Rápido: se uma imagem já der um perfil com distância <= CERTO, entra logo; senão junta até 3 imagens.
      var certo = function (lista) { var c = comparar(lista[lista.length - 1], rostos, CERTO); return !!c.id; };
      return recolher(video, 3, TEMPO_ENTRAR, certo).then(function (lista) {
        if (!lista.length) return { ok: false, id: null, mensagem: "I can't see a face. Look straight at the camera, in good light." };
        var c = comparar(media(lista), rostos);
        if (c.id) return { ok: true, id: c.id, distancia: c.distancia, mensagem: "Hi, " + c.id + "." };
        return { ok: false, id: null, distancia: c.distancia,
                 mensagem: c.motivo === "ambiguo" ? "I am not sure who you are. Pick your profile from the list." : "Face not recognised. Pick your profile from the list or register your face." };
      });
    });
  }

  global.Rosto = {
    registar: registar, identificar: identificar, preparar: preparar,
    registados: function () { return Object.keys(ler()).sort(); },
    apagar: function (id) { var r = ler(); delete r[id]; return escrever(r); },
    definirPasta: function (p) { pasta = p; },
    _comparar: comparar, _distancia: distancia, LIMIAR: LIMIAR
  };
})(typeof window !== "undefined" ? window : globalThis);
