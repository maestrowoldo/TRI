// ----------- SPLASH SCREEN -------------
window.onload = () => {
  setTimeout(() => {
    document.getElementById("splash").style.display = "none";
    document.getElementById("app").style.display = "block";
    iniciarCamera();          // inicia camera e modelo
  }, 1500);
};

// ----------- AJUDA (MODAL) -------------
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const closeHelp = document.getElementById("closeHelp");
const helpSecondary = document.getElementById("helpSecondary");

helpBtn.onclick = () => helpModal.style.display = "flex";
helpSecondary.onclick = () => helpModal.style.display = "flex";
closeHelp.onclick = () => helpModal.style.display = "none";

// ----------- CÂMERA e DETECÇÃO -------------
let usandoCameraFrontal = false;
let streamAtual = null;
let model = null;
let detectando = false;

const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const transcricao = document.getElementById("transcricao");

const ALERT_OBJECTS = new Set(["person", "car", "bicycle", "motorcycle", "dog", "cat"]); // objetos que geram som
const beep = new Audio(); // som simples via data URI (curto beep)
beep.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

async function carregarModelo() {
  try {
    transcricao.innerText = "Carregando modelo de detecção...";
    // carrega coco-ssd
    model = await cocoSsd.load();
    transcricao.innerText = "Modelo carregado. Detectando...";
    startDetectionLoop();
  } catch (e) {
    console.error("Erro ao carregar modelo:", e);
    transcricao.innerText = "Erro ao carregar modelo. Veja console.";
  }
}

async function iniciarCamera() {
  if (streamAtual) {
    streamAtual.getTracks().forEach(t => t.stop());
    streamAtual = null;
  }

  try {
    const constraints = {
      audio: false,
      video: {
        facingMode: usandoCameraFrontal ? "user" : "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    streamAtual = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = streamAtual;

    // espera o vídeo ter dimensões
    await new Promise(resolve => {
      video.onloadedmetadata = () => {
        // ajustar canvas para overlay
        resizeCanvas();
        resolve();
      };
    });

    // carregar modelo (uma vez)
    if (!model) {
      await carregarModelo();
    } else {
      startDetectionLoop();
    }

  } catch (e) {
    console.error("Erro ao acessar câmera:", e);
    transcricao.innerText = "Erro ao acessar câmera. Verifique permissões.";
  }
}

function resizeCanvas() {
  // canvas com mesmo tamanho exibido do video
  const rect = video.getBoundingClientRect();
  // usar video.videoWidth/Height para escala real
  canvas.width = video.videoWidth || rect.width;
  canvas.height = video.videoHeight || rect.height;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
}

document.getElementById("toggleCamera").addEventListener("click", async () => {
  usandoCameraFrontal = !usandoCameraFrontal;
  await iniciarCamera();
});

// capturar imagem (snapshot) e salvar
document.getElementById("captureBtn").addEventListener("click", async () => {
  if (!video || !canvas) return;
  const tmp = document.createElement("canvas");
  tmp.width = video.videoWidth;
  tmp.height = video.videoHeight;
  const c = tmp.getContext("2d");
  c.drawImage(video, 0, 0, tmp.width, tmp.height);
  // incluir caixas desenhadas no overlay (mesma escala)
  c.drawImage(canvas, 0, 0, tmp.width, tmp.height);

  const dataURL = tmp.toDataURL("image/jpeg", 0.9);
  // forçar download
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = `tri_capture_${Date.now()}.jpg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

// Loop de detecção usando requestAnimationFrame
let rafId = null;
async function startDetectionLoop() {
  if (!model || !video || video.readyState < 2) {
    // se o vídeo não estiver pronto, tente de novo depois
    setTimeout(startDetectionLoop, 300);
    return;
  }
  if (detectando) return; // já rodando
  detectando = true;

  // função que realmente roda a cada frame (com controle para reduzir custo)
  async function detectFrame() {
    try {
      resizeCanvas(); // garante tamanho correto
      // executar detecção
      const predictions = await model.detect(video);
      drawPredictions(predictions);
    } catch (e) {
      console.error("Erro na detecção:", e);
    }
    rafId = requestAnimationFrame(detectFrame);
  }

  detectFrame();
}

function drawPredictions(predictions) {
  // limpa canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // se tiver previsões, desenhe
  if (!predictions || !predictions.length) {
    transcricao.innerText = "Nenhum objeto detectado.";
    return;
  }

  // texto resumo
  const labels = predictions.map(p => `${p.class} (${(p.score*100).toFixed(0)}%)`);
  transcricao.innerText = labels.join(" • ");

  // desenhar cada caixa
  predictions.forEach(pred => {
    const [x, y, w, h] = pred.bbox;
    // escala: vídeo já está em natural pixels (videoWidth/videoHeight)
    // estilo das caixas
    ctx.lineWidth = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) / 200));
    ctx.strokeStyle = "rgba(0,200,255,0.9)";
    ctx.fillStyle = "rgba(0,200,255,0.15)";

    // retângulo
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();

    // label
    const text = `${pred.class} ${(pred.score*100).toFixed(0)}%`;
    const fontSize = Math.max(12, Math.round(canvas.width / 60));
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    const textWidth = ctx.measureText(text).width;
    const pad = 6;
    // background rect
    ctx.fillRect(x, y - fontSize - pad, textWidth + pad*2, fontSize + pad);
    // text
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x + pad, y - pad/2);
  });

  // alerta sonoro se algum objeto do conjunto aparecer com confiança > 0.55
  const foundImportant = predictions.some(p => ALERT_OBJECTS.has(p.class) && p.score > 0.55);
  if (foundImportant) {
    // tocar beep curto
    try { beep.play().catch(()=>{}); } catch(e){}
  }
}

// limpar quando fechar / trocar pagina
window.addEventListener('beforeunload', () => {
  if (streamAtual) streamAtual.getTracks().forEach(t => t.stop());
  if (rafId) cancelAnimationFrame(rafId);
});
