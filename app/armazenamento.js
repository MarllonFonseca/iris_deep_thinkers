// =====================================================================
// armazenamento.js: perfis e testes guardados no aparelho (sem internet)
//
// Camada de dados para QUALQUER interface (a de teste e a do Marllon).
// Guarda no localStorage (chave "dt_registos") registos no mesmo formato
// de window.ASTRONAUTAS, por isso Motor e Modelo tratam um astronauta
// real como um simulado.
//
// API (window.Armazem):
//   normalizarId("  marllon ")            -> "MARLLON"  (evita perfis duplicados)
//   perfis()                              -> [{id, testes, ultimo_dia, tem_oct}]  (inclui a equipa: Armazem.EQUIPA)
//   criarPerfil(nome)                     -> id normalizado
//   registosDe(id)                        -> registos ordenados por dia
//   guardar(registo)                      -> junta com o registo do mesmo dia, se existir
//   apagarPerfil(id)
//   avaliar(id, dia)                      -> { semaforo: Motor.avaliar(...), modelo: Modelo.treinar(...) }
//   exportar() / importar(texto)          -> cópia de segurança em JSON
// =====================================================================
(function (global) {
  "use strict";
  var CHAVE = "dt_registos";
  var CHAVE_PERFIS = "dt_perfis";
  // Perfis criados à partida (a equipa). Outros podem ser criados na app.
  var EQUIPA = ["CHANDY", "EDILSON", "LUKANGA", "MARLLON", "NEYDE", "SHEINAZE"];
  var CAMPOS = ["oct_um", "amsler_zonas", "amsler_od", "amsler_oe", "amsler_centro", "acuidade_linha",
                "acuidade_com_oculos", "melhora_com_oculos", "perg_focar", "perg_contraste",
                "perg_dor_cabeca", "perg_visao_dupla", "distancia_cm", "sem_camara",
                "pre_exame", "prontidao", "ressalvas", "alerta_clinico", "alteracao_visual",
                // campos da interface Visão (app/visao): acuidade em 5 linhas por olho e grelha de Amsler 12x12
                "escala_acuidade", "acuidade_oe", "acuidade_od", "acuidade_oe_oculos", "acuidade_od_oculos",
                "melhora_oe", "melhora_od", "celulas_od", "celulas_oe", "evento_nave", "fora_distancia_pct", "luz_media", "luz_nivel",
                "acertos_oe", "acertos_od", "oct_oe", "oct_od", "oct_sinal"];

  function ler() { try { return JSON.parse(localStorage.getItem(CHAVE)) || []; } catch (e) { return []; } }
  function escrever(lista) {
    try { localStorage.setItem(CHAVE, JSON.stringify(lista)); return true; } catch (e) { return false; }
  }
  function normalizarId(nome) { return String(nome || "").trim().replace(/\s+/g, " ").toUpperCase(); }

  function registosDe(id) {
    id = normalizarId(id);
    return ler().filter(function (r) { return r.astronauta_id === id; }).sort(function (a, b) { return a.dia - b.dia; });
  }

  function lerPerfis() {
    var l;
    try { l = JSON.parse(localStorage.getItem(CHAVE_PERFIS)); } catch (e) { l = null; }
    if (!Array.isArray(l)) { l = EQUIPA.slice(); try { localStorage.setItem(CHAVE_PERFIS, JSON.stringify(l)); } catch (e) { } }
    return l;
  }
  function criarPerfil(nome) {
    var id = normalizarId(nome); if (!id) return null;
    var l = lerPerfis();
    if (l.indexOf(id) === -1) { l.push(id); try { localStorage.setItem(CHAVE_PERFIS, JSON.stringify(l)); } catch (e) { } }
    return id;
  }

  function perfis() {
    var mapa = {};
    lerPerfis().forEach(function (id) { mapa[id] = { id: id, testes: 0, ultimo_dia: 0, tem_oct: false }; });
    ler().forEach(function (r) {
      var p = mapa[r.astronauta_id] || (mapa[r.astronauta_id] = { id: r.astronauta_id, testes: 0, ultimo_dia: 0, tem_oct: false });
      p.testes++;
      if (r.dia > p.ultimo_dia) p.ultimo_dia = r.dia;
      if (r.oct_um !== null && r.oct_um !== undefined) p.tem_oct = true;
    });
    return Object.keys(mapa).sort().map(function (k) { return mapa[k]; });
  }

  // Junta com o registo do mesmo dia (ex.: OCT de manhã e teste rápido à tarde).
  function guardar(registo) {
    var novo = { astronauta_id: normalizarId(registo.astronauta_id), perfil: "real", dia: Number(registo.dia) };
    if (!novo.astronauta_id || !(novo.dia >= 0)) return null;
    criarPerfil(novo.astronauta_id);
    var todos = ler(), existente = null;
    todos = todos.filter(function (r) {
      if (r.astronauta_id === novo.astronauta_id && r.dia === novo.dia) { existente = r; return false; }
      return true;
    });
    CAMPOS.forEach(function (c) {
      var v = registo[c];
      if (v === undefined || v === null) v = existente ? existente[c] : null;
      novo[c] = v === undefined ? null : v;
    });
    todos.push(novo);
    return escrever(todos) ? novo : null;
  }

  // Apaga os registos e o perfil (os perfis da equipa voltam a aparecer vazios).
  function apagarPerfil(id) {
    id = normalizarId(id);
    var l = lerPerfis().filter(function (x) { return x !== id || EQUIPA.indexOf(id) !== -1; });
    try { localStorage.setItem(CHAVE_PERFIS, JSON.stringify(l)); } catch (e) { }
    return escrever(ler().filter(function (r) { return r.astronauta_id !== id; }));
  }

  function avaliar(id, dia) {
    var regs = registosDe(id);
    return {
      semaforo: global.Motor.avaliar(regs, dia, global.FAIXAS, global.REGRAS),
      modelo: global.Modelo ? global.Modelo.treinar(regs, global.FAIXAS, dia) : null
    };
  }

  function exportar() { return JSON.stringify(ler()); }
  function importar(texto) {
    var lista = JSON.parse(texto);
    if (!Array.isArray(lista)) throw new Error("Formato inválido");
    lista.forEach(guardar);
    return perfis();
  }

  global.Armazem = { EQUIPA: EQUIPA, normalizarId: normalizarId, criarPerfil: criarPerfil, perfis: perfis, registosDe: registosDe, guardar: guardar,
                     apagarPerfil: apagarPerfil, avaliar: avaliar, exportar: exportar, importar: importar };
})(typeof window !== "undefined" ? window : globalThis);
