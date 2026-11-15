// =====================================================================
// regras.js: limites e textos do semáforo
//
// QUEM EDITA: a equipa de saúde (Sheinaze e Neyde). Não é preciso mexer
// no motor.js para mudar um limite ou uma frase: basta mudar aqui.
//
// Valores PROVISÓRIOS, tirados do documento do MVP. Quando a equipa de
// saúde os validar, mudar "provisorio" para false.
//
// Porquê .js e não .json: a app abre do disco (file://) e aí o browser
// bloqueia a leitura de .json. Um <script src="regras.js"> funciona sempre.
// =====================================================================
window.REGRAS = {
  versao: 1,
  provisorio: true,

  // Grelha de Amsler 3x3, zonas numeradas:
  //   0 1 2
  //   3 4 5
  //   6 7 8
  // Uma zona NOVA no centro dá vermelho; noutro sítio dá amarelo.
  amsler: { zona_centro: 4 },

  // Acuidade de perto: perder esta quantidade de linhas (ou mais) dá amarelo.
  // Se, além disso, não melhorar com os óculos de reserva, dá vermelho.
  acuidade: { perda_amarelo_linhas: 1 },

  // Questionário pré-exame (VISION GUARD): que resposta dá que estado de PRONTIDÃO.
  // PROVISÓRIO: proposta a validar pela equipa de saúde. Cada pergunta tem opções
  // {v: valor guardado, t: texto, e: "verde" | "amarelo" | "vermelho", m: motivo mostrado}.
  // A pergunta "alteracao_visual" não entra na prontidão: gera ALERTA CLÍNICO (campo "alerta").
  prontidao: {
    perguntas: [
      { id: "nave", texto: "A nave encontra-se estável neste momento?", opcoes: [
        { v: 0, t: "Sim, sem vibração ou manobra perceptível.", e: "verde" },
        { v: 1, t: "Há vibração ligeira, mas consigo manter a cabeça e o olhar estáveis.", e: "amarelo", m: "Vibração ligeira." },
        { v: 2, t: "Há vibração ou manobra significativa, ou dificuldade em manter a posição.", e: "vermelho", m: "Vibração ou manobra significativa." } ] },
      { id: "luz", texto: "As condições de iluminação permitem ver o ecrã com clareza?", opcoes: [
        { v: 0, t: "Sim, iluminação estável e sem reflexos.", e: "verde" },
        { v: 1, t: "Existem pequenas alterações de luz ou reflexos, mas consigo ver.", e: "amarelo", m: "Pequenos reflexos ou alterações de luz." },
        { v: 2, t: "A iluminação ou os reflexos dificultam a visualização do ecrã.", e: "vermelho", m: "Iluminação inadequada." } ] },
      { id: "estado", texto: "Como se sente neste momento?", opcoes: [
        { v: 0, t: "Bem, sem desconforto relevante.", e: "verde" },
        { v: 1, t: "Cansaço ou desconforto ligeiro.", e: "amarelo", m: "Cansaço ou desconforto ligeiro." },
        { v: 2, t: "Náusea, tontura ou dor de cabeça moderada.", e: "amarelo", m: "Náusea, tontura ou dor de cabeça moderada." },
        { v: 3, t: "Sintomas intensos que dificultam a concentração ou o exame.", e: "vermelho", m: "Sintomas intensos." } ] },
      { id: "alteracao_visual", texto: "Notou alguma alteração visual nova desde a última avaliação? (pode marcar várias)", multipla: true, opcoes: [
        { v: 1, t: "Visão turva ou dificuldade em focar.", alerta: false },
        { v: 2, t: "Linhas distorcidas ou manchas/áreas escuras.", alerta: false },
        { v: 3, t: "Visão dupla ou episódios de perda visual transitória.", alerta: true },
        { v: 4, t: "Perda súbita de visão ou agravamento visual importante.", alerta: true } ] },
      { id: "sono", texto: "Como foi o seu sono/descanso antes desta avaliação?", opcoes: [
        { v: 0, t: "Adequado; sinto-me descansado(a).", e: "verde" },
        { v: 1, t: "Dormi menos do que o habitual; algum cansaço.", e: "amarelo", m: "Dormiu menos do que o habitual." },
        { v: 2, t: "Sono muito perturbado ou descanso insuficiente.", e: "amarelo", m: "Sono muito perturbado." } ] },
      { id: "superficie", texto: "Apresenta desconforto na superfície ocular?", opcoes: [
        { v: 0, t: "Não.", e: "verde" },
        { v: 1, t: "Sensação de secura.", e: "amarelo", m: "Olho seco." },
        { v: 2, t: "Ardor, irritação ou lacrimejo.", e: "amarelo", m: "Ardor, irritação ou lacrimejo." },
        { v: 3, t: "Visão flutuante que melhora depois de pestanejar.", e: "amarelo", m: "Visão flutuante que melhora ao pestanejar." } ] },
      { id: "exercicio", texto: "Realizou exercício intenso ou actividade extraveicular (EVA) recentemente?", opcoes: [
        { v: 0, t: "Não.", e: "verde" },
        { v: 1, t: "Sim, exercício físico.", e: "amarelo", m: "Exercício intenso recente." },
        { v: 2, t: "Sim, actividade extraveicular (EVA).", e: "amarelo", m: "EVA recente." } ] },
      { id: "medicacao", texto: "Iniciou algum medicamento ou houve alteração recente da medicação?", opcoes: [
        { v: 0, t: "Não.", e: "verde" },
        { v: 1, t: "Sim.", e: "amarelo", m: "Alteração recente da medicação." },
        { v: 2, t: "Não tenho a certeza.", e: "amarelo", m: "Medicação: não tem a certeza." } ] },
      { id: "correcao", texto: "Está a utilizar a sua correcção visual habitual, se indicada?", opcoes: [
        { v: 0, t: "Sim, e está confortável.", e: "verde" },
        { v: 1, t: "Não.", e: "amarelo", m: "Sem a correcção visual habitual: põe os óculos antes de continuar, se os tiveres." },
        { v: 2, t: "Não necessito de correcção visual.", e: "verde" } ] }
    ],
    textos: {
      verde: "Pronto: podes fazer o teste.",
      amarelo: "Pronto com ressalvas: podes fazer o teste. As ressalvas ficam registadas com o resultado.",
      vermelho: "Medição temporariamente não fiável: corrige a condição e repete o questionário.",
      alerta: "Alteração visual nova e importante: comunica já ao médico de voo, mesmo que não faças o teste agora."
    }
  },

  // Frases mostradas ao astronauta e intervalo até ao próximo teste.
  textos: {
    a_calibrar: { mensagem: "A calibrar o teu normal. Faz o próximo teste daqui a uma semana.", proximo_teste_dias: 7 },
    verde:      { mensagem: "Dentro do esperado. Próximo teste daqui a uma semana.", proximo_teste_dias: 7 },
    amarelo:    { mensagem: "Repete daqui a 3 dias. Usa os óculos de reserva. Confirma o CO₂ na cabine.", proximo_teste_dias: 3 },
    vermelho:   { mensagem: "Avisa já o médico de voo. O pacote com os teus resultados está pronto.", proximo_teste_dias: 1 }
  }
};
