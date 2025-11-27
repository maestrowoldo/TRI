// ----------- SPLASH SCREEN -------------
window.onload = () => {
  setTimeout(() => {
    document.getElementById("splash").style.display = "none";
    document.getElementById("app").style.display = "block";
    iniciarCamera();
  }, 3000);
};

// ----------- AJUDA (MODAL) -------------
const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const closeHelp = document.getElementById("closeHelp");
const helpSecondary = document.getElementById("helpSecondary");

helpBtn.onclick = () => helpModal.style.display = "flex";
helpSecondary.onclick = () => helpModal.style.display = "flex";
closeHelp.onclick = () => helpModal.style.display = "none";

// ----------- CÂMERA -------------
let usandoCameraFrontal = false;
let streamAtual = null;

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
    document.getElementById("video").srcObject = streamAtual;

  } catch (e) {
    console.error("Erro ao acessar câmera:", e);
  }
}

// alternar câmera
document.getElementById("toggleCamera").addEventListener("click", () => {
  usandoCameraFrontal = !usandoCameraFrontal;
  iniciarCamera();
});

// capturar imagem
document.getElementById("captureBtn").addEventListener("click", async () => {
  const video = document.getElementById("video");

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const base64Image = canvas.toDataURL("image/jpeg");

  console.log("Capturado:", base64Image);
});
