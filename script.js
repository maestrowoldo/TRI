let usandoCameraFrontal = false;
let streamAtual = null;

// Função para iniciar câmera com base no modo
async function iniciarCamera() {
  if (streamAtual) {
    streamAtual.getTracks().forEach(t => t.stop());
  }

  try {
    const constraints = {
      video: {
        facingMode: usandoCameraFrontal ? "user" : "environment"
      }
    };

    streamAtual = await navigator.mediaDevices.getUserMedia(constraints);

    const video = document.getElementById("video");
    video.srcObject = streamAtual;
  } catch (err) {
    console.log("Erro ao acessar a câmera:", err);
  }
}

// Alternar entre frontal e traseira
document.getElementById("toggleCamera").addEventListener("click", () => {
  usandoCameraFrontal = !usandoCameraFrontal;
  iniciarCamera();
});

// Capturar imagem e enviar ao backend
document.getElementById("captureBtn").addEventListener("click", async () => {
  const video = document.getElementById("video");

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const base64Image = canvas.toDataURL("image/jpeg");

  // CHAMAR API DO BACKEND
  await enviarParaBackend(base64Image);
});

// Função para enviar imagem ao backend
async function enviarParaBackend(imagemBase64) {
  try {
    const response = await fetch("https://seu-backend.com/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagem: imagemBase64 })
    });

    const data = await response.json();
    console.log("Resposta do backend:", data);
  } catch (error) {
    console.error("Erro ao enviar imagem:", error);
  }
}

// Iniciar câmera ao abrir página
iniciarCamera();
