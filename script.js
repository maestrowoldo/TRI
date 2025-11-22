let usandoFrontal = false;
let model;
let speechEnabled = true;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const transcricao = document.getElementById("transcricao");

/* -------------------------------------------
      INICIAR CÂMERA
------------------------------------------- */
async function iniciarCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: usandoFrontal ? "user" : "environment" }
  });
  video.srcObject = stream;
}

document.getElementById("toggleCamera").addEventListener("click", () => {
  usandoFrontal = !usandoFrontal;
  iniciarCamera();
});

/* -------------------------------------------
      CAPTURAR FOTO
------------------------------------------- */
document.getElementById("captureBtn").addEventListener("click", () => {
  const c = document.createElement("canvas");
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext("2d").drawImage(video, 0, 0);
});

/* -------------------------------------------
      AJUDA
------------------------------------------- */
const helpModal = document.getElementById("helpModal");
document.getElementById("helpBtn").onclick = () => helpModal.classList.remove("hidden");
document.getElementById("closeHelp").onclick = () => helpModal.classList.add("hidden");

/* -------------------------------------------
      TRANSCRIÇÃO DE VOZ (Web Speech API)
------------------------------------------- */
let recognizer = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognizer.lang = "pt-BR";
recognizer.continuous = true;

recognizer.onresult = e => {
  const text = e.results[e.results.length - 1][0].transcript;
  transcricao.innerText = text;
};

recognizer.start();

/* -------------------------------------------
      DETECÇÃO DE OBJETOS
------------------------------------------- */
async function carregarModelo() {
  model = await cocoSsd.load();
  detectar();
}

async function detectar() {
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const objetos = await model.detect(video);
  const nomes = [];

  objetos.forEach(obj => {
    if (obj.score < 0.6) return;

    nomes.push(obj.class);

    ctx.strokeStyle = "#00FF00";
    ctx.lineWidth = 3;
    ctx.strokeRect(obj.bbox[0], obj.bbox[1], obj.bbox[2], obj.bbox[3]);

    ctx.fillStyle = "#00FF00";
    ctx.fillText(obj.class, obj.bbox[0], obj.bbox[1] - 5);
  });

  // Fala automática
  if (nomes.length) {
    falar("Vejo " + [...new Set(nomes)].join(", "));
  }

  requestAnimationFrame(detectar);
}

/* -------------------------------------------
      VOZ (SpeechSynthesis)
------------------------------------------- */
let ultimaFrase = "";
function falar(texto) {
  if (!speechEnabled) return;
  if (texto === ultimaFrase) return;

  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "pt-BR";
  speechSynthesis.speak(u);

  ultimaFrase = texto;
}

/* -------------------------------------------
      INICIAR SISTEMA
------------------------------------------- */
video.addEventListener("loadeddata", () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
});

iniciarCamera();
carregarModelo();
