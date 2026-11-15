// =====================================================================
// motor.js: motor de regras do semáforo (SANS)
//
// Decide a cor (verde / amarelo / vermelho) de cada teste de visão.
// Corre no browser, sem internet e sem dependências.
// Especificação completa: docs/EDILSON.md
//
// Carregar na página por esta ordem:
//   <script src="../app/dados.js"></script>   -> window.FAIXAS, window.ASTRONAUTAS
//   <script src="regras.js"></script>         -> window.REGRAS
//   <script src="motor.js"></script>          -> window.Motor
//
// Uso típico na app:
//   var r = Motor.avaliar(Motor.registosDe("DEMO_B", ASTRONAUTAS), 90, FAIXAS, REGRAS);
//   r.cor_final  -> "amarelo";   r.texto -> "Repete daqui a 3 dias...";   r.motivos -> [...]
// =====================================================================
(function (global) {
  "use strict";

  // Ordem de gravidade: usada para escolher "a pior das cores".
  var ORDEM = { a_calibrar: 0, verde: 1, amarelo: 2, vermelho: 3 };

  function arred1(x) {
    return Math.round(x * 10) / 10;
  }

  // As faixas têm um valor por dia (0..180). Dias fora disso usam o extremo.
  function indiceDia(dia, faixas) {
    return Math.max(0, Math.min(Math.round(dia), faixas.p90.length - 1));
  }

  // Δ% = quanto a medição mudou face à linha de base, em percentagem.
  function deltaPct(x, base) {
    return (x - base) / base * 100;
  }

  // -------------------------------------------------------------------
  // piorCor(["verde","vermelho","amarelo"]) -> "vermelho"
  // -------------------------------------------------------------------
  function piorCor(cores) {
    var pior = "a_calibrar";
    (cores || []).forEach(function (c) {
      if (ORDEM[c] !== undefined && ORDEM[c] > ORDEM[pior]) pior = c;
    });
    return pior;
  }

  // -------------------------------------------------------------------
  // corOCT: compara a espessura da retina com a linha de base e com a
  // faixa esperada para esse dia de missão.
  //   medicoes: [{dia, oct_um}, ...]  (o primeiro = linha de base; o último = a avaliar)
  //   devolve:  {cor, delta_pct, z, motivo}
  // -------------------------------------------------------------------
  function corOCT(medicoes, faixas) {
    var m = (medicoes || [])
      .filter(function (x) { return x && x.oct_um !== null && x.oct_um !== undefined; })
      .slice()
      .sort(function (a, b) { return a.dia - b.dia; });

    if (m.length < 2) {
      return {
        cor: "a_calibrar", delta_pct: 0, z: 0,
        motivo: m.length === 1 ? "Primeiro OCT guardado como linha de base." : "Ainda não há OCT."
      };
    }

    var base = m[0].oct_um;
    var ultimo = m[m.length - 1];
    var d = indiceDia(ultimo.dia, faixas);
    var delta = deltaPct(ultimo.oct_um, base);
    var p90 = faixas.p90[d], p97 = faixas.p97[d];

    var cor, motivo;
    if (delta > p97) {
      cor = "vermelho";
      motivo = "Retina +" + arred1(delta) + "%, muito acima do esperado ao dia " + ultimo.dia + " (limite +" + arred1(p97) + "%).";
    } else if (delta > p90) {
      cor = "amarelo";
      motivo = "Retina +" + arred1(delta) + "%, acima do esperado ao dia " + ultimo.dia + " (até +" + arred1(p90) + "%).";
    } else {
      cor = "verde";
      motivo = "Retina +" + arred1(delta) + "%, dentro do esperado ao dia " + ultimo.dia + ".";
    }

    // Subida rápida: só agrava um amarelo para vermelho (evita alarmes
    // causados pelo erro normal de medição do OCT).
    var anterior = m[m.length - 2];
    var dias = ultimo.dia - anterior.dia;
    if (cor === "amarelo" && dias > 0) {
      var taxa = (delta - deltaPct(anterior.oct_um, base)) / dias; // pontos percentuais por dia
      var intervalo = (faixas.subida_rapida || []).find(function (t) {
        return t.de <= anterior.dia && ultimo.dia <= t.ate;
      });
      if (intervalo && taxa > intervalo.taxa_p97_pct_dia) {
        cor = "vermelho";
        motivo = "Subida rápida desde o último OCT (" + arred1(taxa) + " pontos % por dia).";
      }
    }

    // z: distância ao valor esperado nesse dia (informativo, para o ecrã).
    // P10..P90 corresponde a ±1,28 desvios numa curva normal -> largura/2,563.
    var desvio = Math.max((p90 - faixas.p10[d]) / 2.563, 0.5);
    var z = (delta - faixas.p50[d]) / desvio;

    return { cor: cor, delta_pct: arred1(delta), z: arred1(z), motivo: motivo };
  }

  // -------------------------------------------------------------------
  // corAmsler: zonas NOVAS com linhas tortas face à linha de base.
  //   zonasBase, zonasHoje: arrays de inteiros 0..8 (4 = centro)
  //   devolve: {cor, zonas_novas, motivo}
  // -------------------------------------------------------------------
  function corAmsler(zonasBase, zonasHoje, regras) {
    var base = zonasBase || [];
    var novas = (zonasHoje || []).filter(function (z) { return base.indexOf(z) === -1; });
    var centro = regras.amsler.zona_centro;

    if (novas.indexOf(centro) !== -1) {
      return { cor: "vermelho", zonas_novas: novas, motivo: "Linhas tortas novas no centro da grelha de Amsler." };
    }
    if (novas.length > 0) {
      return { cor: "amarelo", zonas_novas: novas, motivo: "Linhas tortas novas na grelha de Amsler (zona " + novas.join(", ") + ")." };
    }
    return { cor: "verde", zonas_novas: [], motivo: "Grelha de Amsler igual à linha de base." };
  }

  // -------------------------------------------------------------------
  // corAcuidade: linhas perdidas no teste de leitura de perto.
  //   linhaBase, linhaHoje: linha mais pequena lida (10 = normal; menor = pior)
  //   melhoraComOculos: 1/true se os óculos de reserva ajudam, 0/false se não
  //   devolve: {cor, perda, motivo}
  // -------------------------------------------------------------------
  function corAcuidade(linhaBase, linhaHoje, melhoraComOculos, regras) {
    if (linhaBase === null || linhaBase === undefined || linhaHoje === null || linhaHoje === undefined) {
      return { cor: "a_calibrar", perda: 0, motivo: "Sem teste de acuidade." };
    }
    var perda = linhaBase - linhaHoje;
    var limite = regras.acuidade.perda_amarelo_linhas;
    var naoMelhora = melhoraComOculos === 0 || melhoraComOculos === false;

    if (perda >= limite && naoMelhora) {
      return { cor: "vermelho", perda: perda, motivo: "Perdeu " + perda + " linha(s) de leitura e não melhora com os óculos de reserva." };
    }
    if (perda >= limite) {
      return { cor: "amarelo", perda: perda, motivo: "Perdeu " + perda + " linha(s) de leitura de perto." };
    }
    return { cor: "verde", perda: perda, motivo: "Leitura de perto igual à linha de base." };
  }

  // -------------------------------------------------------------------
  // registosDe: todos os registos de um astronauta, ordenados por dia.
  // -------------------------------------------------------------------
  function registosDe(astronautaId, astronautas) {
    return (astronautas || [])
      .filter(function (r) { return r.astronauta_id === astronautaId; })
      .sort(function (a, b) { return a.dia - b.dia; });
  }

  // -------------------------------------------------------------------
  // avaliar: a função que a app usa. Junta os 3 sinais até ao dia pedido.
  //   registos: registos de UM astronauta (formato de window.ASTRONAUTAS)
  //   devolve: {dia, cor_final, sinais:{oct, amsler, acuidade}, texto,
  //             proximo_teste_dias, motivos}
  // -------------------------------------------------------------------
  function avaliar(registos, dia, faixas, regras) {
    var ate = (registos || [])
      .filter(function (r) { return r.dia <= dia; })
      .sort(function (a, b) { return a.dia - b.dia; });

    // 1) OCT: todas as medições até hoje
    var octs = ate
      .filter(function (r) { return r.oct_um !== null && r.oct_um !== undefined; })
      .map(function (r) { return { dia: r.dia, oct_um: r.oct_um }; });
    var oct = corOCT(octs, faixas);

    // 2) e 3) Teste rápido: base = primeiro, hoje = último até ao dia pedido
    var rapidos = ate.filter(function (r) { return r.acuidade_linha !== null && r.acuidade_linha !== undefined; });
    var amsler, acuidade;
    if (rapidos.length === 0) {
      amsler = { cor: "a_calibrar", zonas_novas: [], motivo: "Ainda não há teste rápido." };
      acuidade = { cor: "a_calibrar", perda: 0, motivo: "Ainda não há teste rápido." };
    } else if (rapidos.length === 1) {
      // Primeiro teste: a leitura fica como linha de base, mas a grelha de Amsler é comparada
      // com uma grelha sem distorções (regra de segurança: distorções no 1.º teste não passam em claro).
      amsler = corAmsler([], rapidos[0].amsler_zonas, regras);
      if (amsler.cor === "verde") amsler.motivo = "Primeiro teste guardado como linha de base.";
      acuidade = { cor: "verde", perda: 0, motivo: "Primeiro teste guardado como linha de base." };
    } else {
      var base = rapidos[0];
      var hoje = rapidos[rapidos.length - 1];
      amsler = corAmsler(base.amsler_zonas, hoje.amsler_zonas, regras);
      acuidade = corAcuidade(base.acuidade_linha, hoje.acuidade_linha, hoje.melhora_com_oculos, regras);
    }

    var corFinal = piorCor([oct.cor, amsler.cor, acuidade.cor]);
    var texto = regras.textos[corFinal] || regras.textos.a_calibrar;
    var motivos = [oct, amsler, acuidade]
      .filter(function (s) { return s.cor === "amarelo" || s.cor === "vermelho"; })
      .map(function (s) { return s.motivo; });

    return {
      dia: dia,
      cor_final: corFinal,
      sinais: { oct: oct, amsler: amsler, acuidade: acuidade },
      texto: texto.mensagem,
      proximo_teste_dias: texto.proximo_teste_dias,
      motivos: motivos
    };
  }

  // -------------------------------------------------------------------
  // prontidao: estado do questionário pré-exame (VISION GUARD).
  // É SEPARADO da cor clínica: diz se a medição é fiável, não se a visão piorou.
  //   respostas: { nave: 0, luz: 1, estado: 0, alteracao_visual: [2], sono: 0, ... }
  //   devolve: { estado: "verde"|"amarelo"|"vermelho", ressalvas: [...],
  //              alerta_clinico: true|false, sintomas: [...], texto }
  // -------------------------------------------------------------------
  function prontidao(respostas, regras) {
    var cfg = regras.prontidao, r = respostas || {};
    var estado = "verde", ressalvas = [], sintomas = [], alerta = false;
    cfg.perguntas.forEach(function (p) {
      var v = r[p.id];
      if (p.multipla) {
        (Array.isArray(v) ? v : []).forEach(function (x) {
          var o = p.opcoes.filter(function (q) { return q.v === x; })[0];
          if (o) { sintomas.push(o.t); if (o.alerta) alerta = true; }
        });
        return;
      }
      var op = p.opcoes.filter(function (q) { return q.v === v; })[0];
      if (!op) return;
      if (op.m) ressalvas.push(op.m);
      if (ORDEM[op.e] > ORDEM[estado]) estado = op.e;
    });
    return { estado: estado, ressalvas: ressalvas, alerta_clinico: alerta, sintomas: sintomas,
             texto: cfg.textos[estado], texto_alerta: alerta ? cfg.textos.alerta : "" };
  }

  var Motor = {
    ORDEM: ORDEM,
    piorCor: piorCor,
    corOCT: corOCT,
    corAmsler: corAmsler,
    corAcuidade: corAcuidade,
    registosDe: registosDe,
    avaliar: avaliar,
    prontidao: prontidao
  };

  global.Motor = Motor;
  if (typeof module !== "undefined" && module.exports) module.exports = Motor; // para testar com Node
})(typeof window !== "undefined" ? window : globalThis);
