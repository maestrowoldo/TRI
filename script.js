// script.js — Detector com TTS (PT-BR) — Versão revisada
// Requisitos: index.html deve conter elementos com IDs usados abaixo (video, overlay, splash, app, etc.)

/* ========================= INIT & UI ========================= */
window.onload = () => {
  setTimeout(() => {
    const splash = document.getElementById("splash");
    if (splash) splash.style.display = "none";
    const app = document.getElementById("app");
    if (app) app.style.display = "block";
    iniciarCamera();
  }, 1200);
};

// Top / menu controls (may be null if DOM order different)
const menuToggle = document.getElementById("menuToggle");
const menuPanel = document.getElementById("menuPanel");
const closeMenuBtn = document.getElementById("closeMenu");

// Help modal controls
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const closeHelp = document.getElementById("closeHelp");
const helpSecondary = document.getElementById("helpSecondary");

helpBtn?.addEventListener("click", () => { if (helpModal) helpModal.style.display = "flex"; });
helpSecondary?.addEventListener("click", () => { if (helpModal) helpModal.style.display = "flex"; });
closeHelp?.addEventListener("click", () => { if (helpModal) helpModal.style.display = "none"; });

// Menu open/close (keeps UI clean)
function setMenuOpen(open) {
  if (!menuPanel || !menuToggle) return;
  menuPanel.setAttribute("aria-hidden", String(!open));
  menuToggle.setAttribute("aria-expanded", String(open));
  if (open) {
    const first = menuPanel.querySelector("button, input, select, [tabindex]:not([tabindex='-1'])");
    if (first) first.focus();
  } else {
    menuToggle.focus();
  }
}
menuToggle?.addEventListener("click", () => {
  const isOpen = menuPanel?.getAttribute("aria-hidden") === "false";
  setMenuOpen(!isOpen);
});
document.addEventListener("click", (e) => {
  if (!menuPanel || !menuToggle) return;
  if (menuPanel.getAttribute("aria-hidden") === "false") {
    const target = e.target;
    if (!menuPanel.contains(target) && !menuToggle.contains(target)) setMenuOpen(false);
  }
}, { capture: true });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenuOpen(false); });
closeMenuBtn?.addEventListener("click", () => setMenuOpen(false));

/* ========================= CONTROLS & STATE ========================= */
const ttsToggle = document.getElementById("ttsToggle");
const pauseBtn = document.getElementById("pauseBtn");
const volumeRange = document.getElementById("volumeRange");
const rateRange = document.getElementById("rateRange");
const thresholdRange = document.getElementById("thresholdRange");
const langSelect = document.getElementById("langSelect");
const srLive = document.getElementById("srLive");

let ttsEnabled = true;
let paused = false;

// init ttsEnabled from localStorage
try {
  const saved = localStorage.getItem('tri_ttsEnabled');
  if (saved !== null) ttsEnabled = saved === '1';
} catch (e) { /* ignore */ }

// sync UI if buttons exist
if (ttsToggle) { ttsToggle.innerText = ttsEnabled ? "🔊 Falar" : "🔈 Mudo"; ttsToggle.setAttribute("aria-pressed", String(ttsEnabled)); }
ttsToggle?.addEventListener("click", () => {
  ttsEnabled = !ttsEnabled;
  ttsToggle.innerText = ttsEnabled ? "🔊 Falar" : "🔈 Mudo";
  ttsToggle.setAttribute("aria-pressed", String(ttsEnabled));
  console.log('TTS toggled. now ttsEnabled=', ttsEnabled);
  try { localStorage.setItem('tri_ttsEnabled', ttsEnabled ? '1' : '0'); } catch(e){}
});

pauseBtn?.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.innerText = paused ? "▶️ Retomar" : "⏸ Pausar";
  if (!paused && model == null) carregarModelo();
});

volumeRange?.addEventListener("input", () => { speechSettings.volume = Number.parseFloat(volumeRange.value); });
rateRange?.addEventListener("input", () => { speechSettings.rate = Number.parseFloat(rateRange.value); });
thresholdRange?.addEventListener("input", () => { detectionSettings.minScore = Number.parseFloat(thresholdRange.value); });

/* ========================= SETTINGS ========================= */
const detectionSettings = {
  minScore: Number.parseFloat(thresholdRange?.value || 0.55),
  globalCooldown: 3000,
  perLabelCooldown: 7000
};

const speechSettings = {
  lang: langSelect?.value || "pt-BR",
  volume: Number.parseFloat(volumeRange?.value || 0.9),
  rate: Number.parseFloat(rateRange?.value || 1),
  pitch: 1
};
langSelect?.addEventListener("change", () => { speechSettings.lang = langSelect.value; });

/* ========================= TTS HELPERS ========================= */
// flags
let _voicesReady = false;
let _didWarmUp = false;

// beep fallback
const beep = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");

// get voices once (waits for voiceschanged with timeout)
async function getVoicesOnce(timeout = 1800) {
  if (!('speechSynthesis' in window)) return [];
  const cached = speechSynthesis.getVoices();
  if (cached && cached.length) { _voicesReady = true; return cached; }
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

async function warmUpVoices() {
  if (_didWarmUp) return;
  _didWarmUp = true;
  try {
    const v = await getVoicesOnce(2000);
    console.log('warmUpVoices -> voices count =', v.length, v.map(vi => vi.lang + ' :: ' + vi.name));
  } catch (e) { console.warn('warmUpVoices erro', e); }
}

function playBeep() {
  try {
    beep.volume = Math.min(1, (speechSettings && speechSettings.volume) ? speechSettings.volume : 1);
    beep.currentTime = 0;
    beep.play().catch(err => console.warn('beep play blocked', err));
  } catch (e) {}
}

async function speak(text, opts = {}) {
  console.log('speak() chamado com:', text);
  if (typeof ttsEnabled !== 'undefined' && !ttsEnabled) { console.log('TTS desabilitado (ttsEnabled=false).'); return false; }
  if (!('speechSynthesis' in window)) { console.warn('SpeechSynthesis não disponível — beep fallback.'); playBeep(); return false; }
  if (!_didWarmUp) {
    console.log('warmUp não executado ainda; tentando agora antes de falar.');
    await warmUpVoices();
  }
  try {
    const voices = await getVoicesOnce(1500);
    const settings = { ...speechSettings, ...opts };
    const u = new SpeechSynthesisUtterance(text);
    u.lang = settings.lang || 'pt-BR';
    u.volume = typeof settings.volume === 'number' ? settings.volume : 1;
    u.rate = typeof settings.rate === 'number' ? settings.rate : 1;
    u.pitch = typeof settings.pitch === 'number' ? settings.pitch : 1;

    if (voices && voices.length) {
      const prefer = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(u.lang.toLowerCase()));
      if (prefer) { u.voice = prefer; console.log('speak -> usando voz preferida:', prefer.name, prefer.lang); }
      else { u.voice = voices[0]; console.log('speak -> usando voz fallback:', voices[0].name, voices[0].lang); }
    } else {
      console.warn('Nenhuma voice disponível; fallback para beep antes de tentar falar.');
      playBeep();
    }

    u.onstart = () => console.log('TTS onstart');
    u.onend = () => console.log('TTS onend');
    u.onerror = (e) => console.error('TTS onerror', e);

    speechSynthesis.speak(u);
    return true;
  } catch (err) {
    console.error('Erro em speak():', err);
    playBeep();
    return false;
  }
}

// attach warm-up to first user gesture (robust)
function attachWarmUpOnUserGesture() {
  if (typeof window === 'undefined') return;
  const gestureHandler = (e) => {
    try { warmUpVoices().catch(()=>{}); } catch(e){}
    document.removeEventListener('click', gestureHandler, { capture: true });
    document.removeEventListener('touchstart', gestureHandler, { capture: true });
  };
  document.addEventListener('click', gestureHandler, { capture: true });
  document.addEventListener('touchstart', gestureHandler, { capture: true });
  // redundancy: also run once non-capture
  document.addEventListener('click', function _oneClick() {
    try { warmUpVoices().catch(()=>{}); } catch(e){}
    document.removeEventListener('click', _oneClick, { capture: false });
  }, { capture: false });
}
attachWarmUpOnUserGesture();

/* ========================= LABELS & ANNOUNCE ========================= */
// expanded phrases + aliases
const LABEL_PHRASES_PT = {
  person: ["Vejo uma pessoa.", "Há alguém aqui."],
  bottle: ["Vejo uma garrafa.", "Há uma garrafa na superfície."],
  cup: ["Vejo um copo."],
  "cell phone": ["Vejo um telefone celular.", "Há um celular."],
  cell_phone: ["Vejo um telefone celular.", "Há um celular."],
  phone: ["Vejo um telefone.", "Há um celular."],
  dog: ["Vejo um cachorro."],
  cat: ["Vejo um gato."],
  chair: ["Há uma cadeira."],
  table: ["Há uma mesa."],
  car: ["Vejo um carro."],
  bicycle: ["Vejo uma bicicleta."],
  backpack: ["Vejo uma mochila."],
  person_sitting: ["Vejo uma pessoa sentada."]
};
const LABEL_PHRASES_EN = { person: ["I see a person."], bottle: ["I see a bottle."] };
const LABEL_ALIASES = {
  "cellphone": "cell phone",
  "mobile_phone": "cell phone",
  "mobile": "cell phone",
  "handbag": "backpack",
  "pottedplant": "plant",
  "tvmonitor": "tv"
};

// set false in production (true forces speak ignoring cooldowns)
const DEBUG_FORCE_SPEAK = false;

// announcement tracking
let lastGlobalSpeak = 0;
const lastSpokeForLabel = {};

// normalize helper
function normalizeLabel(label) {
  if (!label) return label;
  if (LABEL_ALIASES[label]) return LABEL_ALIASES[label];
  return label;
}

// single authoritative handleAnnouncements (keeps logic consistent)
function handleAnnouncements(predictions) {
  console.log('handleAnnouncements chamado. ttsEnabled=', ttsEnabled, 'predictions=', predictions && predictions.length);
  if (typeof ttsEnabled !== 'undefined' && !ttsEnabled) { console.log('TTS disabled'); return; }

  const now = Date.now();
  if (!DEBUG_FORCE_SPEAK && (now - lastGlobalSpeak < detectionSettings.globalCooldown)) { console.log('skip globalCooldown'); return; }

  const good = (predictions || []).filter(p => p.score >= detectionSettings.minScore);
  if (!good.length) { console.log('no good predictions'); return; }

  good.sort((a,b) => b.score - a.score);
  const priorityOrder = ["person", "dog", "cat", "bicycle", "car", "bottle", "cup"];
  let chosen = good[0];
  for (const p of good) {
    const pi = priorityOrder.indexOf(p.class);
    const ci = priorityOrder.indexOf(chosen.class);
    if (pi !== -1 && (ci === -1 || pi < ci)) chosen = p;
  }

  let label = normalizeLabel(chosen.class);
  let phrase = null;
  if (speechSettings.lang && speechSettings.lang.startsWith('pt')) {
    const arr = LABEL_PHRASES_PT[label] || LABEL_PHRASES_PT[label.toLowerCase()] || null;
    phrase = arr ? arr[Math.floor(Math.random()*arr.length)] : `Vejo um ${label}.`;
  } else {
    const arr = LABEL_PHRASES_EN[label] || null;
    phrase = arr ? arr[Math.floor(Math.random()*arr.length)] : `I see a ${label}.`;
  }

  console.log('announcement: chosen=', chosen, 'label=', label, 'phrase=', phrase, 'score=', chosen.score);

  const lastForLabel = lastSpokeForLabel[label] || 0;
  if (!DEBUG_FORCE_SPEAK && (now - lastForLabel < detectionSettings.perLabelCooldown)) {
    console.log(`label "${label}" cooldown ${now - lastForLabel}ms`); return;
  }

  const didSpeak = speak(phrase);
  console.log('didSpeak=', didSpeak);

  lastGlobalSpeak = now;
  lastSpokeForLabel[label] = now;

  srLive && (srLive.innerText = phrase);
}

/* ========================= CAMERA / MODEL / CANVAS ========================= */
let model = null;
let streamAtual = null;
let usandoCameraFrontal = false;
let detectando = false;
let rafId = null;

const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas ? canvas.getContext("2d") : null;
const transcricao = document.getElementById("transcricao");
const captureBtn = document.getElementById("captureBtn");

// load model
async function carregarModelo() {
  try {
    if (transcricao) transcricao.innerText = "Carregando modelo de detecção...";
    model = await cocoSsd.load();
    if (transcricao) transcricao.innerText = "Modelo carregado. Detectando...";
    startDetectionLoop();
  } catch (e) {
    console.error("Erro ao carregar modelo:", e);
    if (transcricao) transcricao.innerText = "Erro ao carregar modelo. Ver console.";
  }
}

// corrected iniciarCamera
async function iniciarCamera() {
  if (streamAtual) {
    try { streamAtual.getTracks().forEach(t => t.stop()); } catch (e) { console.warn('erro parando tracks', e); }
    streamAtual = null;
  }

  try {
    const constraints = { audio: false, video: { facingMode: usandoCameraFrontal ? "user" : "environment", width: { ideal: 1280 }, height: { ideal: 720 } } };
    streamAtual = await navigator.mediaDevices.getUserMedia(constraints);
    if (video) video.srcObject = streamAtual;

    await new Promise(resolve => { if (!video) return resolve(); video.onloadedmetadata = () => { resizeCanvas(); resolve(); }; });

    if (model == null) await carregarModelo(); else startDetectionLoop();
  } catch (e) {
    console.error("Erro ao acessar câmera:", e);
    if (transcricao) transcricao.innerText = "Permita acesso à câmera. Veja console.";
  }
}

function resizeCanvas() {
  if (!canvas || !video) return;
  canvas.width = video.videoWidth || video.clientWidth;
  canvas.height = video.videoHeight || video.clientHeight;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
}

// toggle camera
document.getElementById("toggleCamera")?.addEventListener("click", async () => {
  usandoCameraFrontal = !usandoCameraFrontal;
  await iniciarCamera();
});

// capture snapshot
captureBtn?.addEventListener("click", () => {
  if (!video) return;
  const tmp = document.createElement("canvas");
  tmp.width = video.videoWidth;
  tmp.height = video.videoHeight;
  const c = tmp.getContext("2d");
  c.drawImage(video, 0, 0, tmp.width, tmp.height);
  if (canvas) c.drawImage(canvas, 0, 0, tmp.width, tmp.height);
  const dataURL = tmp.toDataURL("image/jpeg", 0.9);
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = `tri_capture_${Date.now()}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

/* ========================= DETECTION LOOP ========================= */
async function startDetectionLoop() {
  if (model == null || !video || video.readyState < 2) { setTimeout(startDetectionLoop, 300); return; }
  if (detectando) return;
  detectando = true;

  async function detectFrame() {
    if (paused) { rafId = requestAnimationFrame(detectFrame); return; }
    try {
      resizeCanvas();
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

/* ========================= DRAW ========================= */
function drawPredictions(predictions) {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!predictions || !predictions.length) {
    if (transcricao) transcricao.innerText = "Nenhum objeto detectado.";
    if (srLive) srLive.innerText = "Nenhum objeto detectado.";
    return;
  }

  const labels = predictions.map(p => `${p.class} (${(p.score*100).toFixed(0)}%)`);
  if (transcricao) transcricao.innerText = labels.join(" • ");
  if (srLive) srLive.innerText = transcricao.innerText;

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

/* ========================= CLEANUP ========================= */
window.addEventListener("beforeunload", () => {
  try { if (streamAtual) streamAtual.getTracks().forEach(t => t.stop()); } catch(e){}
  if (rafId) cancelAnimationFrame(rafId);
});

/* ========================= UNLOCK BANNER (for published site) ========================= */
const enableVoiceBanner = document.getElementById('enableVoiceBanner');
speechSynthesis.onvoiceschanged = () => { console.log('onvoiceschanged -> voices:', speechSynthesis.getVoices().map(v => v.lang + ' :: ' + v.name)); };

async function waitForVoices(timeout = 3000) {
  const start = Date.now();
  let v = speechSynthesis.getVoices();
  if (v && v.length) return v;
  return await new Promise(resolve => {
    const check = () => {
      const got = speechSynthesis.getVoices();
      if (got && got.length) { resolve(got); return; }
      if (Date.now() - start > timeout) { resolve(got || []); return; }
      setTimeout(check, 200);
    };
    check();
  });
}

async function enableVoiceNow() {
  try {
    ttsEnabled = true;
    try { localStorage.setItem('tri_ttsEnabled', '1'); } catch(e){}
    if (typeof warmUpVoices === 'function') { await warmUpVoices().catch(()=>{}); } else { await waitForVoices(2500); }
    console.log('voices after enable:', speechSynthesis.getVoices());
    try { await speak('Voz ativada. Vou avisar o que eu detectar.'); console.log('speak() chamado para teste.'); } catch(e){ console.warn('Erro speak test', e); }
    if (enableVoiceBanner && enableVoiceBanner.parentNode) enableVoiceBanner.remove();
  } catch (err) { console.error('enableVoiceNow erro', err); }
}

if (enableVoiceBanner) {
  try { if (localStorage.getItem('tri_ttsEnabled') === '1') enableVoiceBanner.remove(); } catch(e){}
  enableVoiceBanner.addEventListener('click', async () => { await enableVoiceNow(); }, { once: true, passive: true });
}

// redundancy: also run warmUp on first click anywhere
document.addEventListener('click', function _firstClickHandler() {
  try { if (typeof warmUpVoices === 'function') warmUpVoices().catch(()=>{}); } catch(e){}
  document.removeEventListener('click', _firstClickHandler, { capture: false });
}, { capture: false });

/* ========================= END OF FILE ========================= */
