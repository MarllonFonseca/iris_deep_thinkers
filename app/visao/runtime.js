/* Visão · runtime leve para as páginas exportadas.
   Lê o modelo <template id="dc-modelo">, preenche os {{ campos }} com renderVals()
   e volta a desenhar o ecrã sempre que o estado muda. */
(function () {
  'use strict';
  var agendado = false;
  var instancia = null;
  var modelo = null;
  var raiz = null;
  var holeRe = /\{\{\s*([\w.]+)\s*\}\}/g;
  var inteiro = /^\s*\{\{\s*([\w.]+)\s*\}\}\s*$/;

  window.DCLogic = function DCLogic(props) { this.props = props || {}; this.state = {}; };
  window.DCLogic.prototype.setState = function (u) {
    var upd = typeof u === 'function' ? u(this.state) : u;
    if (!upd) return;
    this.state = Object.assign({}, this.state, upd);
    agendar();
  };

  function agendar() {
    if (agendado) return;
    agendado = true;
    Promise.resolve().then(function () { agendado = false; desenhar(); });
  }

  function ler(scope, caminho) {
    return caminho.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, scope);
  }
  function texto(v) { return v == null ? '' : String(v); }

  function expandir(no, scope, destino) {
    if (no.nodeType === 3) {
      destino.appendChild(document.createTextNode(no.textContent.replace(holeRe, function (m, p) { return texto(ler(scope, p)); })));
      return;
    }
    if (no.nodeType !== 1) return;
    var tag = no.tagName.toLowerCase();
    if (tag === 'helmet') return;
    if (tag === 'sc-for') {
      var lm = no.getAttribute('list').match(inteiro);
      var lista = (lm && ler(scope, lm[1])) || [];
      var nome = no.getAttribute('as');
      for (var i = 0; i < lista.length; i++) {
        var sc = Object.create(scope); sc[nome] = lista[i];
        for (var c = 0; c < no.childNodes.length; c++) expandir(no.childNodes[c], sc, destino);
      }
      return;
    }
    if (tag === 'sc-if') {
      var vm = no.getAttribute('value').match(inteiro);
      if (vm && ler(scope, vm[1])) for (var j = 0; j < no.childNodes.length; j++) expandir(no.childNodes[j], scope, destino);
      return;
    }
    var el = no.namespaceURI === 'http://www.w3.org/2000/svg'
      ? document.createElementNS(no.namespaceURI, no.tagName)
      : document.createElement(no.tagName);
    for (var a = 0; a < no.attributes.length; a++) {
      var at = no.attributes[a];
      var nomeAt = at.name;
      var m = at.value.match(inteiro);
      if (/^on/i.test(nomeAt)) {
        var fn = m ? ler(scope, m[1]) : null;
        if (typeof fn === 'function') {
          var ev = nomeAt.slice(2).toLowerCase();
          if (ev === 'change' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) ev = 'input';
          el.addEventListener(ev, fn);
        }
        continue;
      }
      if (m) {
        var v = ler(scope, m[1]);
        if (typeof v === 'function') continue;
        if (nomeAt === 'disabled') { if (v) el.setAttribute('disabled', ''); continue; }
        el.setAttribute(nomeAt, texto(v));
        if (nomeAt === 'value') el.value = texto(v);
      } else {
        el.setAttribute(nomeAt, at.value.replace(holeRe, function (mm, p) { return texto(ler(scope, p)); }));
      }
    }
    var origem = tag === 'template' ? no.content : no;
    for (var k = 0; k < origem.childNodes.length; k++) expandir(origem.childNodes[k], scope, el);
    destino.appendChild(el);
  }

  // Elementos fixos: o ecrã é redesenhado a cada mudança de estado, o que destruiria um <video>.
  // Um elemento registado em window.DC_FIXOS[nome] fica guardado fora do ecrã e é encaixado
  // onde o modelo tiver <div data-fixo="nome"></div>.
  function guardarFixos() {
    var f = window.DC_FIXOS || {};
    Object.keys(f).forEach(function (k) { if (f[k] && raiz.contains(f[k])) document.body.appendChild(f[k]); });
  }
  function encaixarFixos() {
    var f = window.DC_FIXOS || {};
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-fixo]'), function (lugar) {
      var el = f[lugar.getAttribute('data-fixo')];
      if (!el) return;
      lugar.appendChild(el);
      if (el.tagName === 'VIDEO' && el.srcObject && el.paused) { var p = el.play(); if (p && p.catch) p.catch(function () {}); }
    });
  }
  window.DC_encaixarFixos = function () { if (raiz) encaixarFixos(); };

  window.DC_redesenhar = function () { desenhar(); ajustar(); };
  function desenhar() {
    guardarFixos();
    var activo = document.activeElement;
    var manter = activo && activo.id && raiz.contains(activo) && /^(INPUT|TEXTAREA)$/.test(activo.tagName) ? activo : null;
    var vals = instancia.renderVals();
    var frag = document.createDocumentFragment();
    for (var i = 0; i < modelo.childNodes.length; i++) expandir(modelo.childNodes[i], vals, frag);
    // Língua (PT/EN) e dia 0 = pré-voo: traduz o texto desenhado antes de o pôr no ecrã (i18n.js).
    if (window.I18N) window.I18N.aplicar(frag);
    if (manter) {
      // Mantém o mesmo campo que está a ser escrito, para não perder o cursor.
      var novo = frag.querySelector('#' + CSS.escape(manter.id));
      if (novo && novo.tagName === manter.tagName) {
        var a;
        for (a = manter.attributes.length - 1; a >= 0; a--) {
          var n = manter.attributes[a].name;
          if (n !== 'value' && !novo.hasAttribute(n)) manter.removeAttribute(n);
        }
        for (a = 0; a < novo.attributes.length; a++) {
          if (novo.attributes[a].name !== 'value') manter.setAttribute(novo.attributes[a].name, novo.attributes[a].value);
        }
        var irmao = manter.nextSibling, pai = manter.parentNode;
        novo.parentNode.replaceChild(manter, novo);
        while (raiz.firstChild) raiz.removeChild(raiz.firstChild);
        raiz.appendChild(frag);
        manter.focus();
        actualizarFundo(vals);
        if (modoColuna) adaptarColuna();
        encaixarFixos();
        return;
      }
    }
    while (raiz.firstChild) raiz.removeChild(raiz.firstChild);
    raiz.appendChild(frag);
    actualizarFundo(vals);
    if (modoColuna) adaptarColuna();
    encaixarFixos();
  }

  // ---------- Fundo ----------
  // O fundo do ecrã passa para o palco inteiro (ocupa a janela toda, sem riscas nos lados)
  // e acompanha a cor da íris escolhida (classes em iris.css).
  var IRIS = ['original', 'castanho', 'avela', 'verde', 'azul', 'cinzento', 'ambar'];
  function irisAtual(vals) {
    var i = vals && vals.irisFundo;
    if (!i) { try { i = window.localStorage.getItem('visao-iris'); } catch (e) { i = null; } }
    return IRIS.indexOf(i) >= 0 ? i : 'original';
  }
  function actualizarFundo(vals) {
    var ecra = raiz.firstElementChild, palco = document.getElementById('palco');
    if (!ecra) return;
    var tema = /tema-claro/.test(ecra.className) ? 'tema-claro' : 'tema-escuro';
    var classe = tema + ' iris-' + irisAtual(vals);
    ecra.className = classe;
    palco.className = classe;
    var fundo = ecra.style.getPropertyValue('background') || ecra.style.background;
    if (fundo && fundo !== 'transparent') palco.style.background = fundo;
    ecra.style.background = 'transparent';
    ecra.style.overflow = 'visible';
    document.body.style.background = tema === 'tema-claro' ? '#FAFBFC' : '#0D0C0A';
  }

  // ---------- Tamanho e adaptação ----------
  // Ecrãs largos (PC, portátil, tablet, televisão): o desenho (1194 x 834) cresce ou encolhe
  // até caber, e o fundo enche a janela toda.
  // Ecrãs estreitos (telemóvel ao alto) ou baixos (telemóvel deitado): MODO COLUNA, os blocos
  // do ecrã ficam uns por baixo dos outros, em tamanho real, com scroll; a barra de navegação
  // fica fixa em baixo.
  var modoColuna = false;
  function decidirModo() {
    var w = window.innerWidth, h = window.innerHeight;
    modoColuna = w < 820 || h < 520;
    document.documentElement.classList.toggle('modo-coluna', modoColuna);
  }

  function ajustar() {
    var palco = document.getElementById('palco');
    var w = window.innerWidth, h = window.innerHeight;
    var st = palco.style, r = raiz.style;
    st.position = 'fixed'; st.left = '0'; st.top = '0'; st.transformOrigin = '0 0';
    st.borderRadius = '0'; st.boxShadow = 'none';
    if (modoColuna) {
      st.transform = 'none'; st.width = '100%'; st.height = '100%';
      st.overflowX = 'hidden'; st.overflowY = 'auto';
      r.position = 'relative'; r.left = '0'; r.top = '0'; r.width = '100%'; r.height = 'auto';
      adaptarColuna();
      return;
    }
    var esc = Math.min(w / 1194, h / 834);
    var pw = w / esc, ph = h / esc;
    st.overflow = 'hidden';
    st.width = pw + 'px'; st.height = ph + 'px';
    st.transform = 'scale(' + esc + ')';
    r.position = 'absolute'; r.width = '1194px'; r.height = '834px';
    r.left = ((pw - 1194) / 2) + 'px'; r.top = ((ph - 834) / 2) + 'px';
  }

  function soImagens(el) {
    var imgs = el.querySelectorAll('img').length;
    return imgs > 0 && el.querySelectorAll('*').length === imgs && !el.textContent.trim();
  }

  // Passa os blocos posicionados (left/top em píxeis) para uma coluna.
  function adaptarColuna() {
    var ecra = raiz.firstElementChild;
    if (!ecra || ecra.getAttribute('data-coluna')) return;   // já adaptado (o desenho seguinte cria um novo)
    ecra.setAttribute('data-coluna', '1');
    var es = ecra.style;
    es.position = 'relative'; es.width = '100%'; es.height = 'auto'; es.minHeight = '100%';
    es.boxSizing = 'border-box'; es.padding = '16px 14px 132px';
    es.display = 'flex'; es.flexDirection = 'column'; es.gap = '14px'; es.overflow = 'visible';
    var largura = Math.max(260, ecra.clientWidth - 28);

    Array.prototype.slice.call(ecra.children).forEach(function (b) {
      var s = b.style;
      // barra de navegação: fixa em baixo, ao centro
      if (b.tagName === 'NAV' && /^(Secções da app|App sections)$/.test(b.getAttribute('aria-label') || '')) {
        s.position = 'fixed'; s.left = '50%'; s.bottom = '12px'; s.top = 'auto'; s.transform = 'translateX(-50%)'; s.zIndex = '6';
        s.maxWidth = 'calc(100vw - 20px)'; s.boxSizing = 'border-box';
        return;
      }
      // camadas de ecrã cheio: escurecer por trás das janelas e gradiente da navegação
      if (s.left === '-1500px') {
        s.position = 'fixed'; s.left = '0'; s.right = '0'; s.bottom = '0';
        if (s.top === '-1500px') { s.top = '0'; s.zIndex = '20'; }
        else { s.top = 'auto'; s.height = '110px'; s.zIndex = '5'; }
        return;
      }
      // janelas (perguntas obrigatórias, ajuda): ao centro, com scroll se forem altas
      if (b.getAttribute('role') === 'dialog' || b.getAttribute('aria-modal') === 'true') {
        s.position = 'fixed'; s.left = '12px'; s.right = '12px'; s.top = '50%'; s.transform = 'translateY(-50%)';
        s.width = 'auto'; s.maxWidth = '600px'; s.margin = '0 auto'; s.maxHeight = '88vh'; s.overflowY = 'auto'; s.zIndex = '21';
        return;
      }
      var w0 = parseFloat(s.width) || b.offsetWidth || largura;
      var h0 = parseFloat(s.height) || 0;
      var nAbs = 0;
      Array.prototype.forEach.call(b.querySelectorAll('*'), function (x) { if (x.style && x.style.position === 'absolute') nAbs++; });
      s.position = 'relative'; s.left = 'auto'; s.top = 'auto'; s.right = 'auto'; s.bottom = 'auto';
      s.flex = 'none'; s.margin = '0'; s.transform = 'none';

      if (b.tagName === 'IMG' || soImagens(b)) {
        // íris: tamanho moderado, ao centro
        var lado = Math.min(240, largura);
        s.width = lado + 'px'; s.height = lado + 'px'; s.alignSelf = 'center';
        Array.prototype.forEach.call(b.querySelectorAll('img'), function (im) { im.style.width = '100%'; im.style.height = '100%'; im.style.position = 'static'; });
        return;
      }
      if (nAbs > 4 && h0) {
        // gráfico com posições fixas: mantém o desenho, encolhe até um limite e faz scroll para o lado
        var z = Math.max(largura / w0, 0.62);
        if (z >= 1) z = 1;
        s.zoom = z;
        if (w0 * z > largura + 1) {
          var rolo = document.createElement('div');
          rolo.style.cssText = 'width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;flex:none';
          ecra.insertBefore(rolo, b); rolo.appendChild(b);
        }
        return;
      }
      // bloco normal: ocupa a largura toda, altura conforme o conteúdo
      s.width = '100%'; s.maxWidth = '100%'; s.height = 'auto'; s.minHeight = '0'; s.boxSizing = 'border-box';
      s.maxHeight = 'none'; s.overflowY = 'visible';   // limites de altura são do modo largo, não da coluna
      b.classList.add('fluido');
      // decorações largas em posição fixa (ex.: linha da barra de progresso) deixam de fazer sentido
      Array.prototype.forEach.call(b.querySelectorAll('[aria-hidden="true"]'), function (x) {
        if (x.style.position === 'absolute' && x.offsetWidth > 120) x.style.display = 'none';
      });
    });

    // cabeçalhos (logótipo, tema, perfil): passam para duas linhas em vez de espremer o texto
    Array.prototype.slice.call(ecra.children, 0, 2).forEach(function (b) {
      if (!b.classList.contains('fluido')) return;
      [b].concat(Array.prototype.slice.call(b.children)).forEach(function (el) {
        if (el.style.display === 'flex' && el.style.flexDirection !== 'column') { el.style.flexWrap = 'wrap'; el.style.rowGap = '10px'; }
      });
      // botões e etiquetas curtas não partem a meio (textos longos continuam a partir normalmente)
      Array.prototype.forEach.call(b.querySelectorAll('a, button, span'), function (el) { if (el.textContent.trim().length <= 26) el.style.whiteSpace = 'nowrap'; });
    });
    // grelhas de duas colunas (ex.: perfis): uma coluna quando não há espaço
    Array.prototype.forEach.call(ecra.querySelectorAll('.fluido, .fluido *'), function (el) {
      if (el.style.display !== 'grid' || el.clientWidth >= 440) return;
      var gtc = el.style.gridTemplateColumns || '', m = gtc.match(/repeat\((\d+)/);
      var cols = m ? Number(m[1]) : gtc.trim().split(/\s+(?![^(]*\))/).filter(Boolean).length;
      // 2 ou 3 colunas de cartões: passam a uma coluna (grelhas de muitos quadrados, como a de Amsler, ficam)
      if (cols >= 2 && cols <= 3 && el.children.length <= 8) { el.style.gridTemplateColumns = '1fr'; el.style.gridTemplateRows = 'none'; }
    });
    // linhas de botões que não cabem passam para a linha seguinte
    Array.prototype.forEach.call(ecra.querySelectorAll('.fluido, .fluido *'), function (el) {
      var st = el.style;
      if (!st || st.display !== 'flex' || st.flexDirection === 'column') return;
      if (el.scrollWidth > el.clientWidth + 2) st.flexWrap = 'wrap';
    });
    // textos numa só linha que não cabem passam a partir
    Array.prototype.forEach.call(ecra.querySelectorAll('.fluido span, .fluido a, .fluido button'), function (el) {
      if (el.scrollWidth > el.clientWidth + 2 || el.getBoundingClientRect().right > window.innerWidth) { el.style.whiteSpace = 'normal'; }
    });
  }

  window.addEventListener('DOMContentLoaded', function () {
    modelo = document.getElementById('dc-modelo').content;
    raiz = document.getElementById('raiz');
    instancia = new window.Component({});
    decidirModo();
    ajustar();
    desenhar();
    if (typeof instancia.componentDidMount === 'function') instancia.componentDidMount();
    ajustar();
    // ao rodar ou redimensionar: decide o modo e volta a desenhar (o modo coluna mexe nos blocos)
    var mudar = function () { var antes = modoColuna; decidirModo(); if (antes !== modoColuna) desenhar(); ajustar(); };
    window.addEventListener('resize', mudar);
    window.addEventListener('orientationchange', function () { setTimeout(mudar, 200); });
  });
})();
