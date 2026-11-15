# app/ (Marllon e Chandy)

> **A interface final está em `visao/`** (ecrãs do Marllon ligados ao backend, ver `visao/README.md`). `camara/teste_visao.html` é o ecrã de teste do backend.

Web app offline para qualquer dispositivo com browser (telemóvel, tablet, PC). 5 ecrãs: painel com o corpo, teste rápido (Amsler, acuidade, 4 perguntas), OCT guiado, gráfico com semáforo, acções e pacote para o médico de voo.

Carregar por esta ordem no `index.html` (sem fetch, sem CDN):
```html
<script src="dados.js"></script>          <!-- gerado pelo simulador: window.FAIXAS, window.ASTRONAUTAS -->
<script src="../motor/regras.js"></script> <!-- window.REGRAS -->
<script src="../motor/motor.js"></script>  <!-- window.Motor -->
```
Exemplo: `Motor.avaliar(Motor.registosDe("DEMO_B", ASTRONAUTAS), 90, FAIXAS, REGRAS)` → cor, motivos e texto. Ver `../docs/EDILSON.md`, secção 4.

## Módulo da câmara: distância ao ecrã (`camara/`)

A câmara **não faz** o teste de Amsler (o teste mede o que a pessoa vê). Serve só para garantir que a acuidade e o Amsler são feitos sempre à mesma distância (30–45 cm), para os resultados serem comparáveis de dia para dia.

- `camara/distancia.js`: `Distancia.iniciar(video, {minCm, maxCm, aoMudar})`, `Distancia.calibrar(40)`, `Distancia.parar()`
- `aoMudar(r)` recebe `{estado: "ok"|"perto"|"longe"|"sem_cara"|"indisponivel", cm, mensagem}`
- Distância = K / (distância entre os olhos em píxeis). Sem calibração, ±15%. Com o botão "Estou a 40 cm", K fica exacto e é guardado no aparelho.
- `camara/vendor/mediapipe/`: detector de caras do Google (Apache-2.0), copiado para funcionar **sem internet**. Não editar.
- Só a distância: `camara/teste_distancia.html`.
- **Teste rápido completo: `camara/teste_visao.html` + `camara/teste_visao.js`.** Identificação → distância (câmara, 1,5 s estável entre 30 e 45 cm, ou «Continuar sem câmara») → Amsler olho direito → Amsler olho esquerdo → leitura de perto (10 linhas, letras de Sloan, 4 opções, 2 tentativas por linha) → óculos de reserva (só se a leitura piorou face à linha de base) → 4 perguntas → semáforo do `Motor.avaliar`.
- Os testes ficam no aparelho (`localStorage`, chave `dt_registos`), no mesmo formato de `ASTRONAUTAS`, com campos extra: `amsler_od`, `amsler_oe`, `acuidade_com_oculos`, `distancia_cm`, `sem_camara`. O primeiro teste de cada astronauta é a linha de base.
- Tamanho das letras: 8 mm na linha 1 até ~1 mm na linha 10 (PROVISÓRIO, a equipa de saúde valida). Grelha de Amsler: ~10 cm.
- Testado de ponta a ponta (Chrome automático, sem internet): linha de base dá verde; centro torto + perda de 2 linhas sem melhoria com óculos dá vermelho; zona lateral torta dá amarelo.
- **Abrir com `abrir_app.command` (Mac) ou `abrir_app.bat` (Windows)**, não com duplo clique no HTML. Com `file://` a câmara fica `indisponivel` e a app mostra "Segura o ecrã a cerca de 40 cm".
- Testado em Chrome automático, com câmara simulada e internet bloqueada: carrega offline, rejeita objectos que não são caras e falha de forma limpa em `file://`.

- **Sem registo de OCT para astronautas reais** (decisão da equipa, 14 Nov): o teste rápido usa só Amsler, leitura de perto e 4 perguntas. O OCT fica nos astronautas simulados da demo.
