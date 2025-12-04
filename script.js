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

// ===== Menu de três pontos: abrir/fechar com acessibilidade =====
const menuToggle = document.getElementById("menuToggle");
const menuPanel = document.getElementById("menuPanel");
const closeMenuBtn = document.getElementById("closeMenu");

function setMenuOpen(open) {
  if (!menuPanel || !menuToggle) return;
  menuPanel.setAttribute("aria-hidden", String(!open));
  menuToggle.setAttribute("aria-expanded", String(open));
  if (open) {
    const first = menuPanel.querySelector("button, [tabindex]:not([tabindex='-1'])");
    if (first) first.focus();
  } else {
    menuToggle.focus();
  }
}

menuToggle?.addEventListener("click", (e) => {
  const isOpen = menuPanel?.getAttribute("aria-hidden") === "false";
  setMenuOpen(!isOpen);
});

document.addEventListener("click", (e) => {
  if (!menuPanel || !menuToggle) return;
  if (menuPanel.getAttribute("aria-hidden") === "false") {
    const target = e.target;
    if (!menuPanel.contains(target) && !menuToggle.contains(target)) {
      setMenuOpen(false);
    }
  }
}, { capture: true });

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (menuPanel && menuPanel.getAttribute("aria-hidden") === "false") {
      setMenuOpen(false);
    }
  }
});

closeMenuBtn?.addEventListener("click", () => setMenuOpen(false));


// ----------- AJUDA (MODAL) -------------
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const closeHelp = document.getElementById("closeHelp");
const helpSecondary = document.getElementById("helpSecondary");

helpBtn.onclick = () => helpModal.style.display = "flex";
helpSecondary.onclick = () => helpModal.style.display = "flex";
closeHelp.onclick = () => helpModal.style.display = "none";

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
   console.log('TTS toggled. now ttsEnabled=', ttsEnabled);

   try { localStorage.setItem('tri_ttsEnabled', ttsEnabled ? '1' : '0'); } catch(e){}
});

// ler preferência ao carregar
try {
  const saved = localStorage.getItem('tri_ttsEnabled');
  if (saved !== null) {
    ttsEnabled = saved === '1';
    if (ttsToggle) {
      ttsToggle.innerText = ttsEnabled ? "🔊 Falar" : "🔈 Mudo";
      ttsToggle.setAttribute("aria-pressed", String(ttsEnabled));
    }
  }
} catch(e){}


pauseBtn?.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.innerText = paused ? "▶️ Retomar" : "⏸ Pausar";
  if (!paused && !model) carregarModelo();
});

volumeRange?.addEventListener("input", () => {
  speechSettings.volume = Number.parseFloat(volumeRange.value);
});

rateRange?.addEventListener("input", () => {
  speechSettings.rate = Number.parseFloat(rateRange.value);
});

thresholdRange?.addEventListener("input", () => {
  detectionSettings.minScore = Number.parseFloat(thresholdRange.value);
});

/* ----------------- CONFIGS ----------------- */
const detectionSettings = {
  minScore: Number.parseFloat(thresholdRange?.value || 0.55),
  globalCooldown: 3000,        // ms mínimo entre falas
  perLabelCooldown: 7000      // ms antes de repetir a mesma label
};

const speechSettings = {
  lang: langSelect?.value || "pt-BR",
  volume: Number.parseFloat(volumeRange?.value || 0.9),
  rate: Number.parseFloat(rateRange?.value || 1),
  pitch: 1
};

langSelect?.addEventListener("change", () => {
  speechSettings.lang = langSelect.value;
});

/* ----------------- TTS helpers ----------------- */
// ----------------- TTS robusto + warm-up (cole/replace aqui) -----------------
let _voicesReady = false;
let _didWarmUp = false;

// beep fallback (data URI curto) — você pode ajustar
const beep = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");

// Tenta obter vozes, esperando evento voiceschanged (fallback timeout)
async function getVoicesOnce(timeout = 1800) {
  if (!('speechSynthesis' in window)) return [];
  const cached = speechSynthesis.getVoices();
  if (cached && cached.length) {
    _voicesReady = true;
    return cached;
  }
  return await new Promise(resolve => {
    let done = false;
    const handler = () => {
      if (done) return;
      done = true;
      _voicesReady = true;
      resolve(speechSynthesis.getVoices());
    };
    speechSynthesis.onvoiceschanged = handler;
    setTimeout(() => {
      if (done) return;
      done = true;
      _voicesReady = !!(speechSynthesis.getVoices().length);
      resolve(speechSynthesis.getVoices());
    }, timeout);
  });
}

// Warm-up: chamar em resposta a um gesto do usuário (click no menu, capture, etc.)
async function warmUpVoices() {
  if (_didWarmUp) return;
  _didWarmUp = true;
  try {
    const v = await getVoicesOnce(2000);
    console.log('warmUpVoices -> voices count =', v.length, v.map(vi => vi.lang + ' :: ' + vi.name));
  } catch (e) {
    console.warn('warmUpVoices erro', e);
  }
}

// fallback sonoro simples
function playBeep() {
  try {
    beep.volume = Math.min(1, (speechSettings && speechSettings.volume) ? speechSettings.volume : 1);
    beep.currentTime = 0;
    beep.play().catch(err => console.warn('beep play blocked', err));
  } catch (e) {}
}

// Função speak mais robusta
async function speak(text, opts = {}) {
  console.log('speak() chamado com:', text);

  // checa se TTS está habilitado por configuração da sua app
  if (typeof ttsEnabled !== 'undefined' && !ttsEnabled) {
    console.log('TTS desabilitado (ttsEnabled=false).');
    return false;
  }

  if (!('speechSynthesis' in window)) {
    console.warn('SpeechSynthesis não disponível no navegador — usando beep fallback.');
    playBeep();
    return false;
  }

  // garantia: se não houve interação do usuário, algumas plataformas bloqueiam vozes.
  // warmUpVoices deve ter sido chamado após um gesto do usuário (ver listener abaixo).
  if (!_didWarmUp) {
    console.log('warmUp não executado ainda; tentando agora antes de falar.');
    await warmUpVoices();
  }

  try {
    const voices = await getVoicesOnce(1500);
    const settings = { ...speechSettings, ...opts };

    // monta utterance
    const u = new SpeechSynthesisUtterance(text);
    u.lang = settings.lang || 'pt-BR';
    u.volume = typeof settings.volume === 'number' ? settings.volume : 1;
    u.rate = typeof settings.rate === 'number' ? settings.rate : 1;
    u.pitch = typeof settings.pitch === 'number' ? settings.pitch : 1;

    // seleciona voz preferida (match no começo da tag lang)
    if (voices && voices.length) {
      const prefer = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(u.lang.toLowerCase()));
      if (prefer) {
        u.voice = prefer;
        console.log('speak -> usando voz preferida:', prefer.name, prefer.lang);
      } else {
        u.voice = voices[0];
        console.log('speak -> usando voz fallback:', voices[0].name, voices[0].lang);
      }
    } else {
      console.warn('Nenhuma voice disponível; fallback para beep antes de tentar falar.');
      // tocar beep curto para sinalizar tentativa
      playBeep();
      // ainda assim tentamos falar (pode falhar silenciosamente)
    }

    u.onstart = () => console.log('TTS onstart');
    u.onend = () => console.log('TTS onend');
    u.onerror = (e) => console.error('TTS onerror', e);

    // NÃO chame speechSynthesis.cancel() aqui — browsers podem bloquear se usado incorretamente.
    // Se você quiser cancelar fala anterior, faça isso com lógica específica (ex: ao pausar/stop).

    speechSynthesis.speak(u);
    return true;
  } catch (err) {
    console.error('Erro em speak():', err);
    // fallback auditivo
    playBeep();
    return false;
  }
}

// ----------------- Garantir warm-up em interação do usuário -----------------
// Chamar warmUpVoices() em gestos comuns: clique no menu, botão capturar, ou primeiro toque no body.
function attachWarmUpOnUserGesture() {
  if (typeof window === 'undefined') return;
  const gestureHandler = (e) => {
    warmUpVoices().catch(() => {});
    // remove os listeners após primeiro gesto
    document.removeEventListener('click', gestureHandler, { capture: true });
    document.removeEventListener('touchstart', gestureHandler, { capture: true });
  };
  document.addEventListener('click', gestureHandler, { capture: true });
  document.addEventListener('touchstart', gestureHandler, { capture: true });
  document.addEventListener('click', () => { try { warmUpVoices(); } catch(e){} }, { once: true });

}
// executar agora para garantir escuta do primeiro gesto
attachWarmUpOnUserGesture();

// exemplo: também ligar ao abrir do menu (se já tiver menuToggle)
menuToggle?.addEventListener('click', () => { warmUpVoices().catch(()=>{}); });
captureBtn?.addEventListener('click', () => { warmUpVoices().catch(()=>{}); });


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
  if (streamAtual) streamAtual.getTracks().for(t => t.stop());
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

/* Teste simples
if ('speechSynthesis' in window) {
  console.log('speechSynthesis OK');
  console.log('voices (imediatas):', speechSynthesis.getVoices());
  speechSynthesis.onvoiceschanged = () => {
    console.log('voices changed event — voices agora:', speechSynthesis.getVoices());
  };
  const u = new SpeechSynthesisUtterance('Teste de fala. Se você ouvir isto, a síntese funciona.');
  u.lang = 'pt-BR';
  u.volume = 1;
  u.rate = 1;
  u.pitch = 1;
  u.onstart = () => console.log('TTS: começou');
  u.onend = () => console.log('TTS: terminou');
  u.onerror = (e) => console.log('TTS erro', e);
  speechSynthesis.speak(u);
} else {
  console.log('SpeechSynthesis não disponível neste navegador.');
}*/