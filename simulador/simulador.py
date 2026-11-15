"""
Deep Thinkers · NASA Space Apps 2026
Simulador de astronautas para o MVP de visão (SANS)

Gera 4 ficheiros:
  1. dados/astronautas_simulados.csv  -> 20 astronautas da população + 3 perfis da demo (A, B, C)
  2. dados/faixas.json                -> faixas esperadas (P10/P50/P90/P97 do Δ%) por dia
  3. dados/validacao.png              -> gráfico de validação (slide da Chandy)
  4. app/dados.js                     -> os mesmos dados (1 e 2) em JavaScript, para a app ler SEM internet
                                         (um browser que abre index.html do disco não consegue ler .json/.csv,
                                          mas carrega sempre um .js com <script src="dados.js">)

Calibração (documento do MVP, Macias et al. 2020):
  - Retina à volta do nervo óptico: ~362 µm antes do voo
  - Subida média ~ +10% ao dia 150; a maior parte até ao dia 90
  - Caso grave publicado: 401 µm antes do voo -> 613 µm ao dia 84
  - OCT nos dias 10, 30, 60, 90, 120, 150 (+ dia 0 = antes do voo)

SUPOSIÇÕES (a validar pela Sheinaze e a Neyde) estão marcadas com  # SUPOSIÇÃO
Correr:  python3 simulador.py
"""

import csv
import json
import os

import numpy as np

SEED = 2026
rng = np.random.default_rng(SEED)

# ----------------------------------------------------------------------
# Parâmetros
# ----------------------------------------------------------------------
N_POP = 20                      # astronautas usados para calcular as faixas
DIAS = 180
DIAS_OCT = [0, 10, 30, 60, 90, 120, 150]   # dia 0 = OCT antes do voo (linha de base)
INTERVALO_TESTE_RAPIDO = 7      # teste rápido (Amsler, acuidade, perguntas) semanal

BASE_MEDIA_UM = 362.0           # Macias et al. 2020
BASE_DP_UM = 25.0               # SUPOSIÇÃO: variação entre pessoas antes do voo
AMP_MEDIA = 0.092               # dá ~+10% ao dia 150 (ver validação)
AMP_DP = 0.035                  # SUPOSIÇÃO: uns sobem mais do que outros
TAU_MEDIA, TAU_DP = 40.0, 8.0   # SUPOSIÇÃO: constante de tempo (dias) -> ~89% da subida até ao dia 90
RUIDO_OCT_UM = 4.0              # SUPOSIÇÃO: erro de medição do OCT
S_MIN_UM = 5.0                  # SUPOSIÇÃO: variação mínima usada no z-score

N_MONTE_CARLO = 300             # repetições de ruído por astronauta para as faixas

ZONA_CENTRO = 4                 # grelha de Amsler 3x3, zonas 0..8, centro = 4
ACUIDADE_BASE = 10              # linha mais pequena lida no ecrã (maior = melhor)

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PASTA = os.path.join(RAIZ, "dados")
PASTA_APP = os.path.join(RAIZ, "app")
os.makedirs(PASTA, exist_ok=True)
os.makedirs(PASTA_APP, exist_ok=True)


def curva(base, amp, tau, dias):
    """Espessura (µm) sem ruído: sobe depressa no início e estabiliza."""
    return base * (1 + amp * (1 - np.exp(-dias / tau)))


# ----------------------------------------------------------------------
# 1. População (define a "faixa esperada")
# ----------------------------------------------------------------------
dias = np.arange(DIAS + 1)
pop = []
for i in range(N_POP):
    pop.append({
        "id": f"AST{i + 1:02d}",
        "perfil": "populacao",
        "base": rng.normal(BASE_MEDIA_UM, BASE_DP_UM),
        "amp": float(np.clip(rng.normal(AMP_MEDIA, AMP_DP), 0.02, 0.20)),
        "tau": float(np.clip(rng.normal(TAU_MEDIA, TAU_DP), 20, 70)),
    })

# Δ% medido = (x_medido - base_medida) / base_medida * 100, com ruído nos dois
mc = []
for p in pop:
    real = curva(p["base"], p["amp"], p["tau"], dias)                     # (181,)
    x = real + rng.normal(0, RUIDO_OCT_UM, (N_MONTE_CARLO, dias.size))
    b = p["base"] + rng.normal(0, RUIDO_OCT_UM, (N_MONTE_CARLO, 1))
    mc.append((x - b) / b * 100)
mc = np.vstack(mc)                                                        # (N_POP*MC, 181)

faixa = {k: np.percentile(mc, q, axis=0) for k, q in
         [("p10", 10), ("p50", 50), ("p90", 90), ("p97", 97)]}

# Subida rápida: P97 da taxa (pontos percentuais por dia) entre OCTs consecutivos
taxas = []
for d0, d1 in zip(DIAS_OCT[:-1], DIAS_OCT[1:]):
    t = (mc[:, d1] - mc[:, d0]) / (d1 - d0)
    taxas.append({"de": d0, "ate": d1, "taxa_p97_pct_dia": round(float(np.percentile(t, 97)), 4)})

# ----------------------------------------------------------------------
# 2. Perfis da demo
# ----------------------------------------------------------------------
# A: típico (verde) | B: amarelo ao dia 90 | C: caso grave publicado (vermelho)
tau_ref = TAU_MEDIA
f90 = 1 - np.exp(-90 / tau_ref)
alvo_b = (faixa["p90"][90] + faixa["p97"][90]) / 2 / 100        # meio da zona amarela ao dia 90
f84 = 1 - np.exp(-84 / tau_ref)
demo = [
    {"id": "DEMO_A", "perfil": "demo_verde",    "base": 358.0, "amp": 0.09,          "tau": tau_ref},
    {"id": "DEMO_B", "perfil": "demo_amarelo",  "base": 365.0, "amp": alvo_b / f90,  "tau": tau_ref},
    {"id": "DEMO_C", "perfil": "demo_vermelho", "base": 401.0, "amp": (613 / 401 - 1) / f84, "tau": tau_ref},
]


# ----------------------------------------------------------------------
# 3. Sintomas (Amsler, acuidade, perguntas) ligados à subida do OCT
# ----------------------------------------------------------------------
def sintomas(p, d, delta_pct, rng_local):
    """Devolve zonas de Amsler, linha de acuidade, melhora com óculos e 4 perguntas (0-3)."""
    zonas, acuidade, melhora = set(), ACUIDADE_BASE, True
    if p["perfil"] == "demo_amarelo" and d >= 85:
        zonas = {2}
        acuidade = ACUIDADE_BASE - 1
    elif p["perfil"] == "demo_vermelho":
        if d >= 56:
            zonas = {2, 5}
        if d >= 77:
            zonas |= {ZONA_CENTRO}
            acuidade, melhora = ACUIDADE_BASE - 2, False
        elif d >= 56:
            acuidade = ACUIDADE_BASE - 1
    elif p["perfil"] == "populacao" and delta_pct > 12 and rng_local.random() < 0.3:
        zonas = {int(rng_local.choice([0, 2, 6, 8]))}          # zona periférica ocasional
    gravidade = min(3, max(0, int(delta_pct // 8)))
    perg = [int(min(3, max(0, gravidade + rng_local.integers(-1, 1)))) for _ in range(4)]
    return zonas, acuidade, melhora, perg


# ----------------------------------------------------------------------
# 4. CSV
# ----------------------------------------------------------------------
colunas = ["astronauta_id", "perfil", "dia", "oct_um", "amsler_zonas", "amsler_centro",
           "acuidade_linha", "melhora_com_oculos", "perg_focar", "perg_contraste",
           "perg_dor_cabeca", "perg_visao_dupla"]
linhas = []
curvas_medidas = {}
for p in pop + demo:
    real = curva(p["base"], p["amp"], p["tau"], dias)
    # Perfis da demo sem ruído: a demo tem de dar sempre a mesma cor
    ruido = 0.0 if p["perfil"].startswith("demo") else RUIDO_OCT_UM
    base_medida = real[0] + rng.normal(0, ruido)
    pontos = []
    for d in dias:
        tem_oct = d in DIAS_OCT
        tem_rapido = d % INTERVALO_TESTE_RAPIDO == 0
        if not (tem_oct or tem_rapido):
            continue
        oct_um = base_medida if d == 0 else real[d] + rng.normal(0, ruido)
        delta = (real[d] - real[0]) / real[0] * 100
        zonas, acu, melhora, perg = sintomas(p, d, delta, rng)
        linhas.append({
            "astronauta_id": p["id"], "perfil": p["perfil"], "dia": int(d),
            "oct_um": round(float(oct_um), 1) if tem_oct else "",
            "amsler_zonas": ";".join(map(str, sorted(zonas))) if tem_rapido else "",
            "amsler_centro": int(ZONA_CENTRO in zonas) if tem_rapido else "",
            "acuidade_linha": acu if tem_rapido else "",
            "melhora_com_oculos": int(melhora) if tem_rapido else "",
            "perg_focar": perg[0] if tem_rapido else "", "perg_contraste": perg[1] if tem_rapido else "",
            "perg_dor_cabeca": perg[2] if tem_rapido else "", "perg_visao_dupla": perg[3] if tem_rapido else "",
        })
        if tem_oct:
            pontos.append((int(d), float(oct_um)))
    curvas_medidas[p["id"]] = pontos

with open(os.path.join(PASTA, "astronautas_simulados.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=colunas)
    w.writeheader()
    w.writerows(linhas)

# ----------------------------------------------------------------------
# 5. faixas.json (lido pelo motor.js no dispositivo)
# ----------------------------------------------------------------------
faixas = {
    "versao": 1,
    "descricao": "Faixa esperada da variação da espessura da retina (Δ% face à linha de base) por dia de missão.",
    "fonte_calibracao": "Macias et al. 2020 (JAMA Ophthalmology); valores do documento do MVP Deep Thinkers",
    "suposicoes": {
        "dp_entre_pessoas_um": BASE_DP_UM, "dp_amplitude": AMP_DP, "tau_dias": [TAU_MEDIA, TAU_DP],
        "ruido_oct_um": RUIDO_OCT_UM, "nota": "Provisório até validação pela equipa de saúde",
    },
    "s_min_um": S_MIN_UM,
    "z_score": "z = (delta_pct - p50[dia]) / max((p90[dia] - p10[dia]) / 2.563, 0.5)",
    "calendario_oct": DIAS_OCT,
    "dias": dias.tolist(),
    **{k: [round(float(v), 3) for v in arr] for k, arr in faixa.items()},
    "subida_rapida": taxas,
    "regra_subida_rapida": "Se o OCT já está amarelo e a taxa desde o último OCT > taxa_p97_pct_dia do intervalo, passa a vermelho",
}
with open(os.path.join(PASTA, "faixas.json"), "w", encoding="utf-8") as f:
    json.dump(faixas, f, ensure_ascii=False, indent=1)


# ----------------------------------------------------------------------
# 5b. app/dados.js: os mesmos dados para a app offline
#     Campos vazios do CSV passam a null; números ficam números.
# ----------------------------------------------------------------------
def _valor(v):
    if v == "":
        return None
    return v


astronautas_js = []
for linha in linhas:
    reg = {k: _valor(v) for k, v in linha.items()}
    z = reg["amsler_zonas"]
    reg["amsler_zonas"] = None if z is None else ([int(x) for x in z.split(";")] if z else [])
    astronautas_js.append(reg)

with open(os.path.join(PASTA_APP, "dados.js"), "w", encoding="utf-8") as f:
    f.write("// GERADO AUTOMATICAMENTE por simulador/simulador.py. Não editar à mão: corre o simulador.\n")
    f.write("// window.FAIXAS = conteúdo de dados/faixas.json\n")
    f.write("// window.ASTRONAUTAS = linhas de dados/astronautas_simulados.csv (campos vazios = null)\n")
    f.write("window.FAIXAS = " + json.dumps(faixas, ensure_ascii=False) + ";\n")
    f.write("window.ASTRONAUTAS = " + json.dumps(astronautas_js, ensure_ascii=False) + ";\n")


# ----------------------------------------------------------------------
# 6. Verificação: classificador de referência (mesma lógica que o motor.js deve ter)
# ----------------------------------------------------------------------
def cor_oct(pontos, d):
    """pontos = [(dia, µm), ...] até ao dia d inclusive; o primeiro é a linha de base."""
    b = pontos[0][1]
    x = dict(pontos)[d]
    delta = (x - b) / b * 100
    if delta > faixa["p97"][d]:
        cor = 2
    elif delta > faixa["p90"][d]:
        cor = 1
    else:
        cor = 0
    anteriores = [p for p in pontos if p[0] < d]
    if len(anteriores) >= 1 and d > 0:
        d0, x0 = anteriores[-1]
        taxa = ((x - b) / b * 100 - (x0 - b) / b * 100) / (d - d0)
        lim = next((t["taxa_p97_pct_dia"] for t in taxas if t["de"] <= d0 and d <= t["ate"]), None)
        # Subida rápida só agrava um sinal que já está amarelo (evita alarmes por ruído do OCT)
        if lim is not None and taxa > lim and cor == 1:
            cor = 2
    # z: distância à mediana esperada nesse dia, em "desvios" da faixa (P10-P90 = ±1,28 desvios)
    desvio = max((faixa["p90"][d] - faixa["p10"][d]) / 2.563, 0.5)
    z = (delta - faixa["p50"][d]) / desvio
    return cor, round(delta, 1), round(z, 1)


NOMES = ["verde", "amarelo", "vermelho"]
print("\nVerificação dos perfis da demo (cor do OCT):")
for pid in ["DEMO_A", "DEMO_B", "DEMO_C"]:
    pts = curvas_medidas[pid]
    for d in [30, 60, 90, 150]:
        cor, delta, z = cor_oct([p for p in pts if p[0] <= d], d)
        print(f"  {pid} dia {d:3d}: Δ={delta:5.1f}%  z={z:5.1f}  -> {NOMES[cor]}")

# Taxa de falsos alarmes na população (astronautas "normais")
cont = [0, 0, 0]
for p in pop:
    pts = curvas_medidas[p["id"]]
    for d, _ in pts[1:]:
        cont[cor_oct([q for q in pts if q[0] <= d], d)[0]] += 1
tot = sum(cont)
print(f"\nPopulação ({tot} OCTs): verde {cont[0]/tot:.0%}, amarelo {cont[1]/tot:.0%}, vermelho {cont[2]/tot:.0%}")

media_150 = np.mean([(curva(p['base'], p['amp'], p['tau'], 150) - p['base']) / p['base'] * 100 for p in pop])
print(f"\nValidação: média da população ao dia 150 = +{media_150:.1f}% (alvo publicado: ~+10%)")

# ----------------------------------------------------------------------
# 7. Gráfico de validação
# ----------------------------------------------------------------------
try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(10, 5.5), dpi=150)
    ax.fill_between(dias, faixa["p10"], faixa["p90"], color="#9fd3a8", alpha=0.6, label="Faixa esperada (P10–P90)")
    ax.fill_between(dias, faixa["p90"], faixa["p97"], color="#f6d58b", alpha=0.7, label="Zona amarela (P90–P97)")
    ax.plot(dias, faixa["p50"], color="#2e7d32", lw=1.5, label="Mediana da população simulada")
    cores = {"DEMO_A": "#1b5e20", "DEMO_B": "#c77700", "DEMO_C": "#c62828"}
    for pid, c in cores.items():
        pts = curvas_medidas[pid]
        b = pts[0][1]
        ax.plot([d for d, _ in pts], [(x - b) / b * 100 for _, x in pts], "o-", color=c, lw=1.8, ms=5,
                label={"DEMO_A": "Astronauta A (verde)", "DEMO_B": "Astronauta B (amarelo)",
                       "DEMO_C": "Astronauta C, caso grave publicado (vermelho)"}[pid])
    ax.scatter([150], [10], marker="*", s=220, color="black", zorder=5, label="Publicado: ~+10% ao dia 150")
    ax.set_ylim(-3, 60)
    ax.set_xlim(0, 180)
    ax.set_xlabel("Dia de missão")
    ax.set_ylabel("Variação da espessura da retina (%)")
    ax.set_title(f"Validação: média dos 20 astronautas simulados = +{media_150:.1f}% ao dia 150")
    ax.grid(alpha=0.3)
    ax.legend(loc="upper left", fontsize=8.5, frameon=False)
    fig.tight_layout()
    fig.savefig(os.path.join(PASTA, "validacao.png"))
    print("Gráfico: dados/validacao.png")
except ImportError:
    print("matplotlib não instalado: gráfico não gerado (pip install matplotlib)")

print(f"Ficheiros em: {PASTA} e {os.path.join(PASTA_APP, 'dados.js')}")
