// =====================================================================
// distancia.js: mede a distância entre os olhos do astronauta e o ecrã
//
// Porquê: a acuidade de perto e a grelha de Amsler só são comparáveis de
// um dia para o outro se o teste for feito sempre à mesma distância.
// A câmara NÃO faz o teste: só confirma que a pessoa está à distância certa.
//
// Como funciona:
//   1. A câmara frontal filma a cara (nada é gravado nem enviado).
//   2. O MediaPipe (offline, em vendor/mediapipe) encontra os dois olhos.
//   3. Distância (cm) = K / distância_entre_os_olhos_em_píxeis
//      K = focal_da_câmara (px) × distância_real_entre_pupilas (≈ 6,3 cm)
//      Sem calibração usa-se uma estimativa (câmara com ~60° de campo de visão).
//      Com calibração ("estou a 40 cm"), K fica exacto para esta pessoa e
//      este aparelho, e é guardado no localStorage.
//
// Uso:
//   <script src="camara/vendor/mediapipe/face_detection.js"></script>
//   <script src="camara/distancia.js"></script>
//   Distancia.iniciar(videoElement, { minCm: 30, maxCm: 45, aoMudar: function (r) { ... } });
//   // r = { estado: "ok" | "perto" | "longe" | "sem_cara" | "indisponivel", cm, mensagem }
//   Distancia.calibrar(40);   // o utilizador está agora a 40 cm
//   Distancia.definirIntervalo(28, 38);   // muda o intervalo sem reiniciar a câmara
//   Distancia.parar();
//
// IMPORTANTE: abrir a app por http://localhost (ver abrir_app.command / abrir_app.bat),
// não com duplo clique: o browser não carrega o modelo nem a câmara a partir de file://.
// =====================================================================
(function (global) {
  "use strict";

  var IPD_CM = 6.3;              // distância média entre pupilas de um adulto
  var HFOV_GRAUS = 60;           // campo de visão horizontal típico de uma câmara frontal
  var CHAVE_K = "dt_distancia_K";
  var JANELA = 8;                // nº de medições para alisar (média móvel)
  var CONFIANCA_MIN = 0.8;       // confiança mínima do detector (evita "caras" em objectos)

  var estado = {
    detector: null, video: null, stream: null, ativo: false,
    historico: [], ultimoIpdPx: null, opcoes: null, ultimo: null
  };

  function lerK() {
    try { var v = parseFloat(localStorage.getItem(CHAVE_K)); return isFinite(v) && v > 0 ? v : null; }
    catch (e) { return null; }
  }
  function guardarK(k) {
    try { localStorage.setItem(CHAVE_K, String(k)); } catch (e) { /* sem storage: fica só nesta sessão */ }
  }

  // K por defeito, a partir da largura da imagem e de um campo de visão típico.
  function kPorDefeito(larguraPx) {
    var focalPx = (larguraPx / 2) / Math.tan((HFOV_GRAUS / 2) * Math.PI / 180);
    return focalPx * IPD_CM;
  }

  function emitir(r) {
    estado.ultimo = r;
    if (estado.opcoes && typeof estado.opcoes.aoMudar === "function") estado.opcoes.aoMudar(r);
  }

  function classificar(cm) {
    var o = estado.opcoes;
    if (cm < o.minCm) return { estado: "perto", cm: cm, mensagem: "Move back a little from the screen (" + Math.round(cm) + " cm; ideal " + o.minCm + "–" + o.maxCm + " cm)." };
    if (cm > o.maxCm) return { estado: "longe", cm: cm, mensagem: "Move closer to the screen (" + Math.round(cm) + " cm; ideal " + o.minCm + "–" + o.maxCm + " cm)." };
    return { estado: "ok", cm: cm, mensagem: "Distance OK (" + Math.round(cm) + " cm). You can do the test." };
  }

  function aoResultado(res) {
    var det = res && res.detections && res.detections[0];
    if (!det || !det.landmarks || det.landmarks.length < 2) {
      estado.historico = [];
      emitir({ estado: "sem_cara", cm: null, mensagem: "I can't see your face. Look at the screen in good light." });
      return;
    }
    var w = estado.video.videoWidth, h = estado.video.videoHeight;
    var a = det.landmarks[0], b = det.landmarks[1];             // olho direito e olho esquerdo
    var ipdPx = Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
    // Verificação de plausibilidade: numa cara real, a distância entre os olhos
    // é cerca de 30-60% da largura da caixa da cara. Fora disso, não é uma cara.
    var caixaPx = det.boundingBox ? det.boundingBox.width * w : 0;
    var proporcao = caixaPx > 0 ? ipdPx / caixaPx : 0;
    if (ipdPx < 1 || proporcao < 0.25 || proporcao > 0.65) {
      estado.historico = [];
      emitir({ estado: "sem_cara", cm: null, mensagem: "I can't see your face. Look at the screen in good light." });
      return;
    }
    estado.ultimoIpdPx = ipdPx;

    var k = lerK() || kPorDefeito(w);
    estado.historico.push(k / ipdPx);
    if (estado.historico.length > JANELA) estado.historico.shift();
    var cm = estado.historico.reduce(function (s, x) { return s + x; }, 0) / estado.historico.length;
    var r = classificar(cm);
    r.calibrado = !!lerK();
    emitir(r);
  }

  function ciclo() {
    if (!estado.ativo) return;
    var v = estado.video;
    var proximo = function () { if (estado.ativo) requestAnimationFrame(ciclo); };
    if (v.readyState >= 2) {
      estado.detector.send({ image: v }).then(proximo, proximo);
    } else {
      proximo();
    }
  }

  function iniciar(video, opcoes) {
    estado.opcoes = Object.assign({ minCm: 30, maxCm: 45, aoMudar: null, pastaModelo: "camara/vendor/mediapipe/" }, opcoes || {});
    estado.video = video;

    if (!global.FaceDetection || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      var r0 = { estado: "indisponivel", cm: null, mensagem: "Camera unavailable in this browser. Hold the screen about 40 cm away." };
      emitir(r0);
      return Promise.resolve(r0);
    }

    var pasta = estado.opcoes.pastaModelo;
    estado.detector = new global.FaceDetection({ locateFile: function (f) { return pasta + f; } });
    estado.detector.setOptions({ model: "short", minDetectionConfidence: CONFIANCA_MIN });
    estado.detector.onResults(aoResultado);

    return navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then(function (stream) {
        estado.stream = stream;
        video.srcObject = stream;
        video.muted = true;
        video.setAttribute("playsinline", "");
        return video.play();
      })
      .then(function () { return estado.detector.initialize(); })
      .then(function () {
        estado.ativo = true;
        requestAnimationFrame(ciclo);
        return { estado: "a_iniciar" };
      })
      .catch(function (e) {
        var r = { estado: "indisponivel", cm: null, erro: String(e && e.message || e),
                  mensagem: "Could not use the camera. Hold the screen about 40 cm away." };
        emitir(r);
        return r;
      });
  }

  // O utilizador diz a que distância está agora (ex.: mediu com uma régua).
  function calibrar(distanciaRealCm) {
    if (!estado.ultimoIpdPx || !(distanciaRealCm > 0)) return false;
    guardarK(distanciaRealCm * estado.ultimoIpdPx);
    estado.historico = [];
    return true;
  }

  function apagarCalibracao() {
    try { localStorage.removeItem(CHAVE_K); } catch (e) { }
    estado.historico = [];
  }

  function parar() {
    estado.ativo = false;
    if (estado.stream) estado.stream.getTracks().forEach(function (t) { t.stop(); });
    estado.stream = null;
    if (estado.detector && estado.detector.close) estado.detector.close();
    estado.detector = null;
  }

  global.Distancia = {
    iniciar: iniciar, parar: parar, calibrar: calibrar, apagarCalibracao: apagarCalibracao,
    ultimo: function () { return estado.ultimo; },
    // muda o intervalo aceite sem reiniciar a câmara (ex.: 40 cm na acuidade, 33 cm na grelha de Amsler)
    definirIntervalo: function (minCm, maxCm) { if (estado.opcoes) { estado.opcoes.minCm = minCm; estado.opcoes.maxCm = maxCm; estado.historico = []; } },
    // exposto para testes: cálculo puro da distância
    _calcularCm: function (ipdPx, larguraPx, k) { return (k || kPorDefeito(larguraPx)) / ipdPx; }
  };
})(typeof window !== "undefined" ? window : globalThis);
