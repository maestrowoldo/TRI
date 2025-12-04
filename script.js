// script.js - versão com TTS para acessibilidade (PT-BR)
// Presume existência de: video, overlay(canvas), transcricao, captureBtn, toggleCamera, etc.

window.onload = () => {
  setTimeout(() => {
    const splash = document.getElementById("splash");
    if (splash) splash.style.display = "none";
    const app = document.getElementById("app");
    if (app) app.style.display = "block";
    iniciarCamera();
  }, 1200);
};

/* ----------------- CONTROLES / ARIA ----------------- */
const ttsToggle = document.getElementById("ttsToggle");
const pauseBtn = document.getElementById("pauseBtn");
const volumeRange = document.getElementById("volumeRange");
const rateRange = document.getElementById("rateRange");
const thresholdRange = document.getElementById("thresholdRange");
const langSelect = document.getElementById("langSelect");
const srLive = document.getElementById("srLive");

let ttsEnabled = true;
let paused = false;

ttsToggle?.addEventListener("click", () => {
  ttsEnabled = !ttsEnabled;
  ttsToggle.innerText = ttsEnabled ? "🔊 Falar" : "🔈 Mudo";
  ttsToggle.setAttribute("aria-pressed", String(ttsEnabled));
});

pauseBtn?.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.innerText = paused ? "▶️ Retomar" : "⏸ Pausar";
  if (!paused && !model) carregarModelo();
});

volumeRange?.addEventListener("input", () => {
  speechSettings.volume = parseFloat(volumeRange.value);
});

rateRange?.addEventListener("input", () => {
  speechSettings.rate = parseFloat(rateRange.value);
});

thresholdRange?.addEventListener("input", () => {
  detectionSettings.minScore = parseFloat(thresholdRange.value);
});

/* ----------------- CONFIGS ----------------- */
const detectionSettings = {
  minScore: parseFloat(thresholdRange?.value || 0.55),
  globalCooldown: 3000,        // ms mínimo entre falas
  perLabelCooldown: 7000      // ms antes de repetir a mesma label
};

const speechSettings = {
  lang: langSelect?.value || "pt-BR",
  volume: parseFloat(volumeRange?.value || 0.9),
  rate: parseFloat(rateRange?.value || 1.0),
  pitch: 1.0
};

langSelect?.addEventListener("change", () => {
  speechSettings.lang = langSelect.value;
});

/* ----------------- TTS helpers ----------------- */
function availableVoices() {
  return new Promise(resolve => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) return resolve(voices);
    // espera evento
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
    // fallback timeout
    setTimeout(() => resolve(speechSynthesis.getVoices()), 1500);
  });
}

async function speak(text, opts = {}) {
  if (!ttsEnabled) return;
  if (!("speechSynthesis" in window)) {
    console.warn("TTS não disponível neste navegador.");
    return;
  }
  const { lang, volume, rate, pitch } = { ...speechSettings, ...opts };
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.volume = volume;
  utter.rate = rate;
  utter.pitch = pitch;

  // escolher voz que combine com idioma (preferir pt-BR)
  try {
    const voices = await availableVoices();
    const prefer = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(lang.toLowerCase()));
    if (prefer) utter.voice = prefer;
  } catch (e) { /* ignore */ }

  // fala
  try {
    speechSynthesis.cancel(); // evita sobreposição
    speechSynthesis.speak(utter);
  } catch (e) {
    console.error("Erro TTS:", e);
  }
}

/* ----------------- Frases amigáveis por classe ----------------- */
const LABEL_PHRASES_PT = {
  person: ["Vejo uma pessoa.", "Há alguém aqui."],
  bottle: ["Vejo uma garrafa.", "Há uma garrafa na superfície."],
  cup: ["Vejo um copo."],
  cell_phone: ["Vejo um telefone celular."],
  dog: ["Vejo um cachorro."],
  cat: ["Vejo um gato."],
  chair: ["Há uma cadeira."],
  table: ["Há uma mesa."],
  car: ["Vejo um carro."],
  bicycle: ["Vejo uma bicicleta."],
  backpack: ["Vejo uma mochila."],
  // adicionar mais conforme necessário
};

const LABEL_PHRASES_EN = {
  person: ["I see a person."],
  bottle: ["I see a bottle."],
  // ...
};

/* ----------------- Regras de anúncio (cooldowns) ----------------- */
let lastGlobalSpeak = 0;
const lastSpokeForLabel = {}; // { label: timestamp }

/* ----------------- Câmera / Modelo / Canvas ----------------- */
let model = null;
let streamAtual = null;
let usandoCameraFrontal = false;
let detectando = false;
let rafId = null;

const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const transcricao = document.getElementById("transcricao");

const ALERT_OBJECTS = new Set(["person", "car", "bicycle", "dog", "cat", "bottle", "cup"]);

async function carregarModelo() {
  try {
    transcricao.innerText = "Carregando modelo de detecção...";
    model = await cocoSsd.load();
    transcricao.innerText = "Modelo carregado. Detectando...";
    startDetectionLoop();
  } catch (e) {
    console.error("Erro ao carregar modelo:", e);
    transcricao.innerText = "Erro ao carregar modelo. Ver console.";
  }
}

async function iniciarCamera() {
  if (streamAtual) streamAtual.getTracks().forEach(t => t.stop());
  try {
    const constraints = {
      audio: false,
      video: { facingMode: usandoCameraFrontal ? "user" : "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
    };
    streamAtual = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = streamAtual;

    await new Promise(resolve => {
      video.onloadedmetadata = () => {
        resizeCanvas();
        resolve();
      };
    });

    if (!model) await carregarModelo();
    else startDetectionLoop();
  } catch (e) {
    console.error("Erro ao acessar câmera:", e);
    transcricao.innerText = "Permita acesso à câmera. Veja console.";
  }
}

function resizeCanvas() {
  canvas.width = video.videoWidth || video.clientWidth;
  canvas.height = video.videoHeight || video.clientHeight;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
}

document.getElementById("toggleCamera")?.addEventListener("click", async () => {
  usandoCameraFrontal = !usandoCameraFrontal;
  await iniciarCamera();
});

// snapshot (mantive)
document.getElementById("captureBtn")?.addEventListener("click", () => {
  if (!video) return;
  const tmp = document.createElement("canvas");
  tmp.width = video.videoWidth;
  tmp.height = video.videoHeight;
  const c = tmp.getContext("2d");
  c.drawImage(video, 0, 0, tmp.width, tmp.height);
  c.drawImage(canvas, 0, 0, tmp.width, tmp.height);
  const dataURL = tmp.toDataURL("image/jpeg", 0.9);
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = `tri_capture_${Date.now()}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

/* ----------------- Loop de detecção ----------------- */
async function startDetectionLoop() {
  if (!model || !video || video.readyState < 2) {
    setTimeout(startDetectionLoop, 300);
    return;
  }
  if (detectando) return;
  detectando = true;

  async function detectFrame() {
    if (paused) {
      rafId = requestAnimationFrame(detectFrame);
      return;
    }
    try {
      resizeCanvas();
      // detect
      const predictions = await model.detect(video);
      drawPredictions(predictions);
      handleAnnouncements(predictions);
    } catch (e) {
      console.error("Erro de detecção:", e);
    }
    rafId = requestAnimationFrame(detectFrame);
  }

  detectFrame();
}

/* ----------------- Desenho de caixas ----------------- */
function drawPredictions(predictions) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!predictions || !predictions.length) {
    transcricao.innerText = "Nenhum objeto detectado.";
    srLive && (srLive.innerText = "Nenhum objeto detectado.");
    return;
  }

  const labels = predictions.map(p => `${p.class} (${(p.score*100).toFixed(0)}%)`);
  transcricao.innerText = labels.join(" • ");
  srLive && (srLive.innerText = transcricao.innerText);

  predictions.forEach(pred => {
    if (pred.score < 0.01) return;
    const [x, y, w, h] = pred.bbox;
    ctx.lineWidth = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) / 220));
    ctx.strokeStyle = "rgba(0,200,255,0.9)";
    ctx.fillStyle = "rgba(0,200,255,0.12)";
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();

    const text = `${pred.class} ${(pred.score*100).toFixed(0)}%`;
    const fontSize = Math.max(12, Math.round(canvas.width / 70));
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    const textWidth = ctx.measureText(text).width;
    const pad = 6;
    ctx.fillRect(x, y - fontSize - pad, textWidth + pad*2, fontSize + pad);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x + pad, y - pad/2);
  });
}

/* ----------------- Lógica de anúncios (evita spam) ----------------- */
function handleAnnouncements(predictions) {
  if (!ttsEnabled) return;
  const now = Date.now();

  // respeitar cooldown global
  if (now - lastGlobalSpeak < detectionSettings.globalCooldown) return;

  // filtrar por score e ordenar por score
  const good = (predictions || []).filter(p => p.score >= detectionSettings.minScore);
  if (!good.length) return;

  // escolher label prioritária (pessoa > animal > objeto)
  // prioridade básica: person, dog/cat, then others
  good.sort((a,b) => b.score - a.score);
  const priorityOrder = ["person", "dog", "cat", "bicycle", "car", "bottle", "cup"];
  let chosen = null;
  for (const p of good) {
    if (!chosen) chosen = p;
    const pi = priorityOrder.indexOf(p.class);
    const ci = priorityOrder.indexOf(chosen.class);
    if (pi !== -1 && (ci === -1 || pi < ci)) chosen = p;
  }

  // se não houver escolha lógica, pega o primeiro
  if (!chosen && good.length) chosen = good[0];
  if (!chosen) return;

  const label = chosen.class;
  const lastForLabel = lastSpokeForLabel[label] || 0;
  if (now - lastForLabel < detectionSettings.perLabelCooldown) {
    // já falou recentemente dessa label -> evitar repetir
    return;
  }

  // montar frase baseada no idioma
  const lang = speechSettings.lang || "pt-BR";
  let phrase = "";
  if (lang.startsWith("pt")) {
    const arr = LABEL_PHRASES_PT[label] || [ `Vejo um ${label}.` ];
    phrase = arr[Math.floor(Math.random()*arr.length)];
    // ajuste simples de gênero/forma para palavras específicas (garrafa -> "uma garrafa")
    // já colocamos frases amigáveis em LABEL_PHRASES_PT
  } else {
    const arr = LABEL_PHRASES_EN[label] || [ `I see a ${label}.` ];
    phrase = arr[Math.floor(Math.random()*arr.length)];
  }

  // incluir contexto espacial se houver múltiplos objetos e a caixa sugere "na mesa"?
  // (opcional) — omitido por simplicidade, mas podemos inferir com heurísticas de borda.

  // falar
  speak(phrase);
  lastGlobalSpeak = now;
  lastSpokeForLabel[label] = now;

  // atualiza região srLive
  srLive && (srLive.innerText = phrase);
}

/* ----------------- cleanup ----------------- */
window.addEventListener("beforeunload", () => {
  if (streamAtual) streamAtual.getTracks().forEach(t => t.stop());
  if (rafId) cancelAnimationFrame(rafId);
});
