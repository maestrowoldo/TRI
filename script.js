// script.js — Detector com TTS, tracking, posição/distância, vibração, OCR hook
// Substitua seu script.js atual por este. HTML e CSS permanecem os mesmos.
// Expectativa: IDs opcionais no HTML: splash, app, video, overlay, transcricao, captureBtn, toggleCamera,
// menuToggle, menuPanel, closeMenu, ttsToggle, pauseBtn, volumeRange, rateRange, thresholdRange, langSelect,
// srLive, enableVoiceBanner, descriptionMode, voicePreset, ocrBtn, toggleContrast

/* ========================= BOOT / UI INIT ========================= */
window.onload = () => {
  setTimeout(() => {
    const splash = document.getElementById("splash");
    if (splash) splash.style.display = "none";
    const app = document.getElementById("app");
    if (app) app.style.display = "block";
    iniciarCamera();
  }, 1200);
};

/* ========================= ELEMENT REFERENCES ========================= */
const menuToggle = document.getElementById("menuToggle");
const menuPanel = document.getElementById("menuPanel");
const closeMenuBtn = document.getElementById("closeMenu");

const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const closeHelp = document.getElementById("closeHelp");
const helpSecondary = document.getElementById("helpSecondary");

const ttsToggle = document.getElementById("ttsToggle");
const pauseBtn = document.getElementById("pauseBtn");
const volumeRange = document.getElementById("volumeRange");
const rateRange = document.getElementById("rateRange");
const thresholdRange = document.getElementById("thresholdRange");
const langSelect = document.getElementById("langSelect");
const srLive = document.getElementById("srLive");
const captureBtn = document.getElementById("captureBtn");

/* ========================= SIMPLE UI BEHAVIOR ========================= */
helpBtn?.addEventListener("click", () => { if (helpModal) helpModal.style.display = "flex"; });
helpSecondary?.addEventListener("click", () => { if (helpModal) helpModal.style.display = "flex"; });
closeHelp?.addEventListener("click", () => { if (helpModal) helpModal.style.display = "none"; });

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
menuToggle?.addEventListener("click", () => { const isOpen = menuPanel?.getAttribute("aria-hidden") === "false"; setMenuOpen(!isOpen); });
document.addEventListener("click", (e) => {
  if (!menuPanel || !menuToggle) return;
  if (menuPanel.getAttribute("aria-hidden") === "false") {
    const target = e.target;
    if (!menuPanel.contains(target) && !menuToggle.contains(target)) setMenuOpen(false);
  }
}, { capture: true });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenuOpen(false); });
closeMenuBtn?.addEventListener("click", () => setMenuOpen(false));

/* ========================= STATE & CONTROLS ========================= */
let ttsEnabled = true;
let paused = false;

// try to read saved preference
try {
  const saved = localStorage.getItem('tri_ttsEnabled');
  if (saved !== null) ttsEnabled = saved === '1';
} catch(e){}

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

// get voices once
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

/* attach warm-up to first gesture */
function attachWarmUpOnUserGesture() {
  if (typeof window === 'undefined') return;
  const gestureHandler = (e) => {
    try { warmUpVoices().catch(()=>{}); } catch(e){}
    document.removeEventListener('click', gestureHandler, { capture: true });
    document.removeEventListener('touchstart', gestureHandler, { capture: true });
  };
  document.addEventListener('click', gestureHandler, { capture: true });
  document.addEventListener('touchstart', gestureHandler, { capture: true });
  document.addEventListener('click', function _oneClick() {
    try { warmUpVoices().catch(()=>{}); } catch(e){}
    document.removeEventListener('click', _oneClick, { capture: false });
  }, { capture: false });
}
attachWarmUpOnUserGesture();

/* ========================= LABELS / ALIASES ========================= */
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

/* DEBUG (false em produção) */
const DEBUG_FORCE_SPEAK = false;

/* ========================= TRACKING & SPATIAL ========================= */
const TRACKING_IOU_THRESHOLD = 0.3;
const CONFIRM_FRAMES = 2;
const UNCONFIRM_FRAMES = 3;
const DISTANCE_AREAS = { near: 0.15, medium: 0.03 };

let tracks = {};
let nextTrackId = 1;

function iou(boxA, boxB) {
  const [ax, ay, aw, ah] = boxA;
  const [bx, by, bw, bh] = boxB;
  const ax2 = ax + aw, ay2 = ay + ah;
  const bx2 = bx + bw, by2 = by + bh;
  const interLeft = Math.max(ax, bx);
  const interTop = Math.max(ay, by);
  const interRight = Math.min(ax2, bx2);
  const interBottom = Math.min(ay2, by2);
  const interW = Math.max(0, interRight - interLeft);
  const interH = Math.max(0, interBottom - interTop);
  const interArea = interW * interH;
  const areaA = aw * ah;
  const areaB = bw * bh;
  const union = areaA + areaB - interArea;
  return union === 0 ? 0 : interArea / union;
}

function normalizeLabelSimple(label) {
  if (!label) return label;
  return LABEL_ALIASES[label] || label;
}

function inferPositionAndDistance(bbox, frameWidth, frameHeight) {
  const cx = bbox[0] + bbox[2] / 2;
  const areaRatio = (bbox[2] * bbox[3]) / (frameWidth * frameHeight);
  const third = frameWidth / 3;
  const horizontal = cx < third ? 'à esquerda' : (cx > 2*third ? 'à direita' : 'no centro');
  let distance = 'longe';
  if (areaRatio >= DISTANCE_AREAS.near) distance = 'perto';
  else if (areaRatio >= DISTANCE_AREAS.medium) distance = 'média distância';
  return { horizontal, distance, areaRatio };
}

const VIBRATION_PATTERNS = {
  person: [30, 60, 30],
  car: [80, 40, 80],
  default: [20]
};

function vibrateForLabel(label) {
  try {
    if (!('vibrate' in navigator)) return;
    const normalized = normalizeLabelSimple(label);
    const pattern = VIBRATION_PATTERNS[normalized] || VIBRATION_PATTERNS.default;
    navigator.vibrate(pattern);
  } catch(e) {}
}

function updateTracks(predictions) {
  // mark unmatched initially
  Object.values(tracks).forEach(t => { t.matched = false; });

  for (const p of predictions) {
    let bestTrack = null;
    let bestIou = 0;
    for (const id in tracks) {
      const t = tracks[id];
      if (t.label !== p.class) continue;
      const score = iou(t.bbox, p.bbox);
      if (score > bestIou) { bestIou = score; bestTrack = t; }
    }
    if (bestTrack && bestIou >= TRACKING_IOU_THRESHOLD) {
      bestTrack.bbox = p.bbox;
      bestTrack.lastSeen = Date.now();
      bestTrack.seenCount = (bestTrack.seenCount || 0) + 1;
      bestTrack.lostCount = 0;
      bestTrack.score = p.score;
      bestTrack.matched = true;
      bestTrack.lastPred = p;
    } else {
      const id = String(nextTrackId++);
      tracks[id] = { id, label: p.class, bbox: p.bbox, lastSeen: Date.now(), seenCount: 1, lostCount: 0, score: p.score, matched: true, lastPred: p, confirmed: false };
    }
  }

  for (const id in tracks) {
    const t = tracks[id];
    if (!t.matched) t.lostCount = (t.lostCount || 0) + 1;
    if (!t.confirmed && (t.seenCount >= CONFIRM_FRAMES)) t.confirmed = true;
  }

  for (const id in tracks) {
    if (tracks[id].lostCount >= UNCONFIRM_FRAMES) delete tracks[id];
  }
}

function getConfirmedTracks() {
  return Object.values(tracks).filter(t => t.confirmed);
}

function formatPhrase(label, positionInfo, score, mode='short') {
  const basePt = LABEL_PHRASES_PT[label] ? LABEL_PHRASES_PT[label][0] : `Vejo um ${label}`;
  if (mode === 'short') return `${basePt} ${positionInfo.horizontal}.`;
  const confidence = Math.round((score || 0) * 100);
  return `${basePt} ${positionInfo.horizontal}, ${positionInfo.distance} — confiança ${confidence} por cento.`;
}

/* ========================= ANNOUNCER (UTILIZA O TRACKING) ========================= */
let lastGlobalSpeak = 0;
const lastSpokeForLabel = {};

function handleAnnouncements(predictions) {
  console.log('handleAnnouncements chamado. ttsEnabled=', ttsEnabled, 'predictions=', predictions && predictions.length);
  if (typeof ttsEnabled !== 'undefined' && !ttsEnabled) { console.log('TTS disabled'); return; }
  const now = Date.now();
  if (!DEBUG_FORCE_SPEAK && (now - lastGlobalSpeak < detectionSettings.globalCooldown)) { console.log('skip globalCooldown'); return; }

  const good = (predictions || []).filter(p => p.score >= detectionSettings.minScore);
  if (!good.length) { console.log('no good predictions'); return; }

  updateTracks(good);
  const confirmed = getConfirmedTracks();
  if (!confirmed.length) return;

  confirmed.sort((a,b) => (b.score || 0) - (a.score || 0));
  const chosen = confirmed[0];
  const label = normalizeLabelSimple(chosen.label);

  const frameWidth = (video && video.videoWidth) || (canvas && canvas.width) || 640;
  const frameHeight = (video && video.videoHeight) || (canvas && canvas.height) || 360;
  const positionInfo = inferPositionAndDistance(chosen.bbox, frameWidth, frameHeight);

  const modeEl = document.getElementById('descriptionMode');
  const mode = (modeEl && modeEl.value) ? modeEl.value : 'short';
  const phrase = formatPhrase(label, positionInfo, chosen.score, mode);

  const lastForLabel = lastSpokeForLabel[label] || 0;
  if (!DEBUG_FORCE_SPEAK && (now - lastForLabel < detectionSettings.perLabelCooldown)) {
    console.log(`label "${label}" cooldown ${now - lastForLabel}ms`); return;
  }

  const didSpeak = speak(phrase);
  console.log('didSpeak=', didSpeak, 'phrase=', phrase);

  vibrateForLabel(label);

  lastGlobalSpeak = Date.now();
  lastSpokeForLabel[label] = Date.now();

  if (srLive) srLive.innerText = phrase;
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

document.getElementById("toggleCamera")?.addEventListener("click", async () => {
  usandoCameraFrontal = !usandoCameraFrontal;
  await iniciarCamera();
});

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

/* ========================= DETECTION LOOP (with optional frame skip) ========================= */
let frameCounter = 0;
const FRAME_SKIP = 1; // increase to 2 or 3 to save CPU

async function startDetectionLoop() {
  if (model == null || !video || video.readyState < 2) { setTimeout(startDetectionLoop, 300); return; }
  if (detectando) return;
  detectando = true;

  async function detectFrame() {
    if (paused) { rafId = requestAnimationFrame(detectFrame); return; }
    try {
      resizeCanvas();
      frameCounter = (frameCounter + 1) % FRAME_SKIP;
      if (frameCounter === 0) {
        const predictions = await model.detect(video);
        drawPredictions(predictions);
        handleAnnouncements(predictions);
      }
    } catch (e) {
      console.error("Erro de detecção:", e);
    }
    rafId = requestAnimationFrame(detectFrame);
  }
  detectFrame();
}

/* ========================= DRAW PREDICTIONS ========================= */
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

/* ========================= UNLOCK BANNER & OCR HOOK ========================= */
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

// OCR (optional) — requires tesseract.js in HTML to work
async function runOCR() {
  if (!video) { console.warn('OCR: video não pronto'); return; }
  const tmp = document.createElement('canvas');
  tmp.width = video.videoWidth; tmp.height = video.videoHeight;
  const c = tmp.getContext('2d'); c.drawImage(video, 0, 0, tmp.width, tmp.height);
  const dataURL = tmp.toDataURL('image/png');
  if (transcricao) transcricao.innerText = 'Lendo texto...';
  try {
    const { Tesseract } = window;
    if (!Tesseract) { console.warn('Tesseract não carregado. Adicione o script CDN no HTML.'); if (transcricao) transcricao.innerText = 'Tesseract.js não disponível.'; return; }
    const worker = Tesseract.createWorker({ logger: m => console.log('ocr', m) });
    await worker.load(); await worker.loadLanguage('por+eng'); await worker.initialize('por+eng');
    const { data: { text } } = await worker.recognize(dataURL);
    await worker.terminate();
    console.log('OCR resultado:', text);
    if (transcricao) transcricao.innerText = `Texto: ${text.slice(0,200)}`;
    speak(`Texto detectado: ${text.split('\n').slice(0,2).join(' , ')}`);
  } catch (e) {
    console.error('OCR erro', e);
    if (transcricao) transcricao.innerText = 'Erro OCR. Veja console.';
  }
}
document.getElementById('ocrBtn')?.addEventListener('click', () => { runOCR().catch(()=>{}); });

/* voice presets and contrast toggle (UI hooks) */
document.getElementById('voicePreset')?.addEventListener('change', (e) => {
  const v = e.target.value;
  if (v === 'fast') { speechSettings.rate = 1.3; speechSettings.volume = 0.95; }
  else if (v === 'slow') { speechSettings.rate = 0.85; speechSettings.volume = 0.9; }
  else { speechSettings.rate = 1.0; speechSettings.volume = 0.9; }
});

document.getElementById('toggleContrast')?.addEventListener('click', () => {
  document.documentElement.classList.toggle('high-contrast');
});
