const video = document.getElementById("video");
const pixelCanvas = document.getElementById("pixelCanvas");
const pixelCtx = pixelCanvas.getContext("2d", { willReadFrequently: true });
const rawCanvas = document.createElement("canvas");
const rawCtx = rawCanvas.getContext("2d", { willReadFrequently: true });
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const landmarkCanvas = document.getElementById("landmarkCanvas");
const landmarkCtx = landmarkCanvas.getContext("2d");
const viewport = document.getElementById("viewport");
const cameraMessage = document.getElementById("cameraMessage");
const startCameraBtn = document.getElementById("startCameraBtn");
const handStatus = document.getElementById("handStatus");
const handStatusText = document.getElementById("handStatusText");
const gestureValue = document.getElementById("gestureValue");
const gestureDetail = document.getElementById("gestureDetail");
const actionValue = document.getElementById("actionValue");
const fpsReadout = document.getElementById("fpsReadout");
const modeButtons = document.querySelectorAll(".mode-btn");
const drawOnly = document.querySelectorAll(".draw-only");
const remoteOnly = document.querySelectorAll(".remote-only");
const swatches = document.querySelectorAll(".swatch");
const clearBtn = document.getElementById("clearBtn");
const saveBtn = document.getElementById("saveBtn");
const audio = document.getElementById("audio");
const songUpload = document.getElementById("songUpload");
const pixelFilter = document.getElementById("pixelFilter");
const thresholdSlider = document.getElementById("thresholdSlider");
const thresholdValue = document.getElementById("thresholdValue");
const noiseSlider = document.getElementById("noiseSlider");
const noiseValue = document.getElementById("noiseValue");
const matrixChannel = document.getElementById("matrixChannel");
const pixelMatrix = document.getElementById("pixelMatrix");
const matrixCaption = document.getElementById("matrixCaption");
const sampleX = document.getElementById("sampleX");
const sampleY = document.getElementById("sampleY");
const pixelSampleBox = document.getElementById("pixelSampleBox");
const interpretBtn = document.getElementById("interpretBtn");
const recognitionStatus = document.getElementById("recognitionStatus");
const recognizedWord = document.getElementById("recognizedWord");
const imageResult = document.getElementById("imageResult");

const colors = [...swatches].map((swatch) => swatch.dataset.color);
const tracks = [
  { title: "Neon Current", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  { title: "Soft Focus", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { title: "Night Transit", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
];
let mode = "draw";
let colorIndex = 0;
let currentColor = colors[0];
let lastGesture = "none";
let lastPoint = null;
let handLandmarker;
let stream;
let lastActionAt = 0;
let swipeHistory = [];
let currentTrack = 0;
let isPlaying = false;
let fakePosition = 0;
let lastFrameAt = performance.now();
let animationStarted = false;
let smoothedPoint = null;
let filterSwipeStartX = null;
let swipeGestureStartX = null;
let lastFilterChangeAt = 0;
let filterIndex = 0;
const filters = [
  { name: "NORMAL", value: "normal" },
  { name: "GRAYSCALE", value: "grayscale" },
  { name: "BINARY", value: "binary" },
  { name: "SALT & PEPPER", value: "noise" },
  { name: "X-RAY", value: "xray" },
  { name: "SEPIA", value: "sepia" },
  { name: "HIGH CONTRAST", value: "contrast" },
];
let rawFrame = null;
let noiseMask = null;
let sourceWidth = 0;
let sourceHeight = 0;
let samplePositionInitialized = false;
let lastPixelProcessAt = 0;
let lastMatrixUpdateAt = 0;
let recognitionTimer;
const pixelProcessInterval = 1000 / 24;
const matrixUpdateInterval = 1000 / 8;
const maxPixelWidth = 640;
const matrixSize = 16;
const sampleSize = matrixSize;
const handConnections = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

function resizeCanvas() {
  const old = document.createElement("canvas");
  old.width = canvas.width;
  old.height = canvas.height;
  if (old.width && old.height) old.getContext("2d").drawImage(canvas, 0, 0);
  const rect = viewport.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  landmarkCanvas.width = rect.width;
  landmarkCanvas.height = rect.height;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (old.width && old.height) ctx.drawImage(old, 0, 0, old.width, old.height, 0, 0, canvas.width, canvas.height);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function setActiveSwatch(color) {
  swatches.forEach((swatch) => swatch.classList.toggle("active", swatch.dataset.color === color));
}

function cycleColor() {
  colorIndex = (colorIndex + 1) % colors.length;
  currentColor = colors[colorIndex];
  setActiveSwatch(currentColor);
  gestureDetail.textContent = `Trail color: ${currentColor}`;
}

swatches.forEach((swatch, index) => swatch.addEventListener("click", () => {
  colorIndex = index;
  currentColor = swatch.dataset.color;
  setActiveSwatch(currentColor);
}));

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  lastPoint = null;
  clearTimeout(recognitionTimer);
}

function cycleFilter(direction) {
  filterIndex = (filterIndex + direction + filters.length) % filters.length;
  const activeFilter = filters[filterIndex];
  pixelFilter.value = activeFilter.value;
  document.getElementById("filterName").textContent = activeFilter.name;
  gestureDetail.textContent = `Live filter: ${activeFilter.name}`;
}

function clampSamplePosition() {
  const maxX = Math.max(sourceWidth - sampleSize, 0);
  const maxY = Math.max(sourceHeight - sampleSize, 0);
  sampleX.max = String(maxX);
  sampleY.max = String(maxY);
  sampleX.value = String(Math.min(Math.max(Number(sampleX.value) || 0, 0), maxX));
  sampleY.value = String(Math.min(Math.max(Number(sampleY.value) || 0, 0), maxY));
}

function updateSampleBox() {
  if (!sourceWidth || !sourceHeight) return;
  const rect = viewport.getBoundingClientRect();
  const x = Number(sampleX.value) || 0;
  const y = Number(sampleY.value) || 0;
  const mirroredX = sourceWidth - x - sampleSize;
  pixelSampleBox.style.left = `${(mirroredX / sourceWidth) * rect.width}px`;
  pixelSampleBox.style.top = `${(y / sourceHeight) * rect.height}px`;
  pixelSampleBox.style.width = `${Math.max(8, (sampleSize / sourceWidth) * rect.width)}px`;
  pixelSampleBox.style.height = `${Math.max(8, (sampleSize / sourceHeight) * rect.height)}px`;
}

function matrixValue(red, green, blue, index) {
  const gray = Math.round(.299 * red + .587 * green + .114 * blue);
  if (matrixChannel.value === "red") return red;
  if (matrixChannel.value === "green") return green;
  if (matrixChannel.value === "blue") return blue;
  if (matrixChannel.value === "grayscale") return gray;
  if (matrixChannel.value === "binary") return gray >= Number(thresholdSlider.value) ? 255 : 0;
  return noiseMask?.[index] ? (noiseMask[index] === 2 ? 255 : 0) : gray;
}

function updatePixelMatrix() {
  if (!rawFrame || !sourceWidth || !sourceHeight) return;
  const x = Number(sampleX.value) || 0;
  const y = Number(sampleY.value) || 0;
  const rows = [];
    for (let row = 0; row < matrixSize; row += 1) {
    const cells = [];
    for (let col = 0; col < matrixSize; col += 1) {
      const index = ((y + row) * sourceWidth + x + col) * 4;
      cells.push(`<td>${matrixValue(rawFrame.data[index], rawFrame.data[index + 1], rawFrame.data[index + 2], y + row * sourceWidth + x + col)}</td>`);
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  pixelMatrix.innerHTML = rows.join("");
  matrixCaption.textContent = `${matrixChannel.options[matrixChannel.selectedIndex].text} / rows = y, cols = x`;
  updateSampleBox();
}

function applyPixelFilter() {
  if (!rawFrame || !sourceWidth || !sourceHeight) return;
  const threshold = Number(thresholdSlider.value);
  const noiseAmount = Number(noiseSlider.value) / 100;
  const output = new Uint8ClampedArray(rawFrame.data);
  noiseMask = new Uint8Array(sourceWidth * sourceHeight);
  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < sourceWidth; x += 1) {
      const pixel = y * sourceWidth + x;
      const index = pixel * 4;
      const red = rawFrame.data[index];
      const green = rawFrame.data[index + 1];
      const blue = rawFrame.data[index + 2];
      const gray = Math.round(.299 * red + .587 * green + .114 * blue);
      if (Math.random() < noiseAmount) noiseMask[pixel] = Math.random() < .5 ? 1 : 2;
      if (pixelFilter.value === "grayscale") output[index] = output[index + 1] = output[index + 2] = gray;
      if (pixelFilter.value === "binary") output[index] = output[index + 1] = output[index + 2] = gray >= threshold ? 255 : 0;
      if (pixelFilter.value === "noise" && noiseMask[pixel]) output[index] = output[index + 1] = output[index + 2] = noiseMask[pixel] === 2 ? 255 : 0;
      if (pixelFilter.value === "xray") output[index] = output[index + 1] = output[index + 2] = 255 - gray;
      if (pixelFilter.value === "sepia") { output[index] = Math.min(255, gray + 45); output[index + 1] = Math.min(255, gray + 20); output[index + 2] = Math.max(0, gray - 10); }
      if (pixelFilter.value === "contrast") { output[index] = Math.max(0, Math.min(255, (red - 128) * 1.7 + 128)); output[index + 1] = Math.max(0, Math.min(255, (green - 128) * 1.7 + 128)); output[index + 2] = Math.max(0, Math.min(255, (blue - 128) * 1.7 + 128)); }
    }
  }
  pixelCtx.putImageData(new ImageData(output, sourceWidth, sourceHeight), 0, 0);
  updateSampleBox();
}

function processPixelFrame(now) {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
  if (now - lastPixelProcessAt < pixelProcessInterval) return;
  lastPixelProcessAt = now;
  const scale = Math.min(1, maxPixelWidth / video.videoWidth);
  const nextWidth = Math.max(1, Math.round(video.videoWidth * scale));
  const nextHeight = Math.max(1, Math.round(video.videoHeight * scale));
  if (sourceWidth !== nextWidth || sourceHeight !== nextHeight) {
    sourceWidth = nextWidth;
    sourceHeight = nextHeight;
    rawCanvas.width = pixelCanvas.width = sourceWidth;
    rawCanvas.height = pixelCanvas.height = sourceHeight;
    if (!samplePositionInitialized) {
      sampleX.value = String(Math.floor((sourceWidth - sampleSize) / 2));
      sampleY.value = String(Math.floor((sourceHeight - sampleSize) / 2));
      samplePositionInitialized = true;
    }
    clampSamplePosition();
  }
  rawCtx.drawImage(video, 0, 0, sourceWidth, sourceHeight);
  rawFrame = rawCtx.getImageData(0, 0, sourceWidth, sourceHeight);
  applyPixelFilter();
  if (now - lastMatrixUpdateAt >= matrixUpdateInterval) {
    lastMatrixUpdateAt = now;
    updatePixelMatrix();
  }
}

pixelFilter.addEventListener("change", () => {
  const selected = filters.find((filter) => filter.value === pixelFilter.value);
  if (selected) document.getElementById("filterName").textContent = selected.name;
  if (rawFrame) { applyPixelFilter(); updatePixelMatrix(); }
});
thresholdSlider.addEventListener("input", () => {
  thresholdValue.textContent = thresholdSlider.value;
  if (rawFrame) { applyPixelFilter(); updatePixelMatrix(); }
});
noiseSlider.addEventListener("input", () => {
  noiseValue.textContent = `${noiseSlider.value}%`;
  if (rawFrame) { applyPixelFilter(); updatePixelMatrix(); }
});
function updateMatrixChannel() {
  matrixCaption.textContent = `${matrixChannel.options[matrixChannel.selectedIndex].text} / rows = y, cols = x`;
  updatePixelMatrix();
}
matrixChannel.addEventListener("input", updateMatrixChannel);
matrixChannel.addEventListener("change", updateMatrixChannel);
[sampleX, sampleY].forEach((control) => control.addEventListener("input", () => {
  clampSamplePosition();
  updatePixelMatrix();
  updateSampleBox();
}));

clearBtn.addEventListener("click", clearCanvas);
saveBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "aircast-trail.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

function getRecognitionCanvas() {
  const recognitionCanvas = document.createElement("canvas");
  recognitionCanvas.width = canvas.width;
  recognitionCanvas.height = canvas.height;
  const recognitionCtx = recognitionCanvas.getContext("2d");
  recognitionCtx.fillStyle = "#ffffff";
  recognitionCtx.fillRect(0, 0, recognitionCanvas.width, recognitionCanvas.height);
  recognitionCtx.translate(recognitionCanvas.width, 0);
  recognitionCtx.scale(-1, 1);
  recognitionCtx.drawImage(canvas, 0, 0);
  return recognitionCanvas;
}

function scheduleImageLookup() {
  clearTimeout(recognitionTimer);
  recognitionTimer = setTimeout(() => findImageForDrawing(), 1200);
  recognitionStatus.textContent = "Pause after writing to find the image...";
}

async function findImageForDrawing() {
  if (!window.Tesseract) {
    recognitionStatus.textContent = "Text recognition is unavailable. Check your internet connection.";
    return;
  }
  interpretBtn.disabled = true;
  recognitionStatus.textContent = "Reading your drawing...";
  recognizedWord.textContent = "";
  imageResult.removeAttribute("src");
  imageResult.classList.add("hidden");
  try {
    const result = await window.Tesseract.recognize(getRecognitionCanvas(), "eng");
    const word = result.data.text.trim().replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").split(" ")[0];
    if (!word) throw new Error("No word found");
    recognizedWord.textContent = word;
    recognitionStatus.textContent = "Searching for an image...";
    const query = encodeURIComponent(word);
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime&iiurlwidth=900&format=json&origin=*`);
    if (!response.ok) throw new Error("Image search failed");
    const data = await response.json();
    const page = Object.values(data.query?.pages || {}).find((item) => item.imageinfo?.[0]?.mime?.startsWith("image/"));
    if (!page) throw new Error("No image found");
    imageResult.src = page.imageinfo[0].thumburl || page.imageinfo[0].url;
    imageResult.alt = `Image result for ${word}`;
    imageResult.classList.remove("hidden");
    recognitionStatus.textContent = "Image found";
  } catch (error) {
    recognitionStatus.textContent = "Could not recognize that word. Try writing larger and more slowly.";
  } finally {
    interpretBtn.disabled = false;
  }
}

interpretBtn.addEventListener("click", findImageForDrawing);

function setMode(nextMode) {
  mode = nextMode;
  document.body.classList.toggle("mode-remote", mode === "remote");
  modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  drawOnly.forEach((element) => element.classList.toggle("hidden", mode !== "draw"));
  remoteOnly.forEach((element) => element.classList.toggle("hidden", mode !== "remote"));
  lastPoint = null;
  swipeHistory = [];
  actionValue.textContent = "Waiting for a gesture...";
}

modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));

function drawSegment(from, to) {
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = 5;
  ctx.shadowColor = currentColor;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.shadowBlur = 0;
  scheduleImageLookup();
}

function eraseAt(point) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(point.x, point.y, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLandmarks(landmarks) {
  landmarkCtx.clearRect(0, 0, landmarkCanvas.width, landmarkCanvas.height);
  const points = landmarks.map((landmark) => ({ x: landmark.x * landmarkCanvas.width, y: landmark.y * landmarkCanvas.height }));
  landmarkCtx.strokeStyle = "rgba(242, 240, 234, .7)";
  landmarkCtx.lineWidth = 1.5;
  handConnections.forEach(([from, to]) => {
    landmarkCtx.beginPath();
    landmarkCtx.moveTo(points[from].x, points[from].y);
    landmarkCtx.lineTo(points[to].x, points[to].y);
    landmarkCtx.stroke();
  });
  points.forEach((point, index) => {
    landmarkCtx.beginPath();
    landmarkCtx.arc(point.x, point.y, index === 8 ? 6 : 3.5, 0, Math.PI * 2);
    landmarkCtx.fillStyle = index === 8 ? "#43E5FF" : "#F2F0EA";
    landmarkCtx.shadowColor = index === 8 ? "#43E5FF" : "transparent";
    landmarkCtx.shadowBlur = index === 8 ? 12 : 0;
    landmarkCtx.fill();
  });
  landmarkCtx.shadowBlur = 0;
}

function fingersUp(landmarks, handedness) {
  const up = [];
  up.push(handedness === "Right" ? landmarks[4].x < landmarks[3].x : landmarks[4].x > landmarks[3].x);
  [[8, 6], [12, 10], [16, 14], [20, 18]].forEach(([tip, pip]) => up.push(landmarks[tip].y < landmarks[pip].y));
  return up;
}

function classifyGesture(landmarks, handedness) {
  const [thumb, index, middle, ring, pinky] = fingersUp(landmarks, handedness);
  const pinchDistance = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y);
  if (pinchDistance < 0.055) return "pinch";
  const count = [thumb, index, middle, ring, pinky].filter(Boolean).length;
  if (count === 0) return "fist";
  if (count === 5) return "open_palm";
  if (index && middle && ring && !pinky && !thumb) return "three_fingers";
  if (index && middle && ring && pinky && !thumb) return "four_fingers";
  if (index && !middle && !ring && !pinky) return "point";
  if (index && middle && !ring && !pinky) return "peace";
  if (thumb && !index && !middle && !ring && !pinky) return landmarks[4].y > landmarks[3].y + .08 ? "thumbs_down" : "thumbs_up";
  return "none";
}

const gestureNames = { point: "Point", three_fingers: "Three fingers", four_fingers: "Four fingers", fist: "Fist", thumbs_down: "Thumbs down", thumbs_up: "Thumbs up", open_palm: "Open palm", peace: "Peace sign", pinch: "Pinch", none: "No clear gesture" };

function showGesture(gesture, handPresent) {
  gestureValue.textContent = handPresent ? gestureNames[gesture] : "No hand detected";
  gestureDetail.textContent = handPresent ? (mode === "draw" ? "Tracking 21 landmarks" : "Ready for a remote action") : "Place your hand inside the frame";
  handStatus.classList.toggle("active", handPresent);
  handStatusText.textContent = handPresent ? "Hand tracked" : "No hand detected";
}

function playerRender() {
  document.getElementById("trackTitle").textContent = tracks[currentTrack].title;
  document.getElementById("trackNumber").textContent = String(currentTrack + 1).padStart(2, "0");
  document.getElementById("playBtn").textContent = isPlaying ? "Ⅱ" : "▶";
  document.getElementById("playBtn").setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

function setAction(label) {
  actionValue.textContent = label;
  lastActionAt = performance.now();
}

function togglePlayback() {
  if (isPlaying) {
    audio.pause();
    isPlaying = false;
    setAction("Playback paused");
    playerRender();
    return;
  }
  audio.play().then(() => {
    isPlaying = true;
    setAction("Playback started");
    playerRender();
  }).catch(() => {
    isPlaying = false;
    setAction("Audio unavailable - check your connection");
    playerRender();
  });
}

function changeTrack(direction) {
  currentTrack = (currentTrack + direction + tracks.length) % tracks.length;
  fakePosition = 0;
  audio.src = tracks[currentTrack].url;
  audio.load();
  isPlaying = false;
  setAction(direction > 0 ? "Next track" : "Previous track");
  playerRender();
}

document.getElementById("playBtn").addEventListener("click", togglePlayback);
document.getElementById("prevBtn").addEventListener("click", () => changeTrack(-1));
document.getElementById("nextBtn").addEventListener("click", () => changeTrack(1));
audio.src = tracks[0].url;
songUpload.addEventListener("change", () => {
  const file = songUpload.files[0];
  if (!file) return;
  tracks.push({ title: file.name.replace(/\.[^/.]+$/, ""), url: URL.createObjectURL(file), local: true });
  currentTrack = tracks.length - 1;
  audio.src = tracks[currentTrack].url;
  audio.load();
  isPlaying = false;
  fakePosition = 0;
  playerRender();
  setAction("Local song added");
});
audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  fakePosition = audio.currentTime;
  document.getElementById("trackTime").textContent = `${Math.floor(audio.currentTime / 60)}:${String(Math.floor(audio.currentTime % 60)).padStart(2, "0")}`;
  document.getElementById("trackProgress").style.width = `${(audio.currentTime / audio.duration) * 100}%`;
});
audio.addEventListener("ended", () => changeTrack(1));

function remoteAction(gesture, fingertipX, now) {
  const edge = gesture !== lastGesture;
  if (edge && now - lastActionAt > 550) {
    if (gesture === "fist") togglePlayback();
    if (gesture === "open_palm") { isPlaying = false; audio.pause(); audio.currentTime = 0; playerRender(); setAction("Playback stopped"); }
    if (gesture === "thumbs_up") setAction("Volume up");
    if (gesture === "pinch") setAction("Volume down");
  }

  if (gesture === "three_fingers" && edge && now - lastActionAt > 700) {
    changeTrack(1);
    return;
  }

  if (gesture === "four_fingers" && edge && now - lastActionAt > 700) {
    changeTrack(-1);
    return;
  }

  swipeGestureStartX = null;
}

function handleFrame(result, now) {
  const landmarks = result.landmarks?.[0];
  if (!landmarks) {
    landmarkCtx.clearRect(0, 0, landmarkCanvas.width, landmarkCanvas.height);
    showGesture("none", false);
    lastPoint = null;
    smoothedPoint = null;
    filterSwipeStartX = null;
    swipeHistory = [];
    lastGesture = "none";
    return;
  }
  const handedness = result.handednesses?.[0]?.[0]?.categoryName || "Right";
  const gesture = classifyGesture(landmarks, handedness);
  drawLandmarks(landmarks);
  showGesture(gesture, true);
  const tip = landmarks[8];
  const rawPoint = { x: tip.x * canvas.width, y: tip.y * canvas.height };
  if (!smoothedPoint) smoothedPoint = rawPoint;
  const smoothing = gesture === "point" ? .3 : .5;
  const point = { x: smoothedPoint.x + (rawPoint.x - smoothedPoint.x) * smoothing, y: smoothedPoint.y + (rawPoint.y - smoothedPoint.y) * smoothing };
  smoothedPoint = point;
  if (mode === "draw") {
    if (gesture === "three_fingers" && lastGesture !== "three_fingers" && now - lastFilterChangeAt > 700) {
      cycleFilter(1);
      lastFilterChangeAt = now;
      lastPoint = null;
    } else if (gesture === "four_fingers" && lastGesture !== "four_fingers" && now - lastFilterChangeAt > 700) {
      cycleFilter(-1);
      lastFilterChangeAt = now;
      lastPoint = null;
    } else {
      filterSwipeStartX = null;
      if (gesture === "pinch" && lastGesture !== "pinch") cycleColor();
      if (gesture === "point") {
        if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) > 2) drawSegment(lastPoint, point);
        lastPoint = point;
      }
      else if (gesture === "peace") { eraseAt(point); lastPoint = null; }
      else if (gesture === "open_palm" && lastGesture !== "open_palm") clearCanvas();
      else lastPoint = null;
    }
  } else remoteAction(gesture, tip.x, now);
  lastGesture = gesture;
}

function updatePlayerClock() {
  if (audio.src && !audio.paused && Number.isFinite(audio.duration)) return;
  if (isPlaying) fakePosition = (fakePosition + 0.04) % 180;
  const minutes = Math.floor(fakePosition / 60);
  const seconds = String(Math.floor(fakePosition % 60)).padStart(2, "0");
  document.getElementById("trackTime").textContent = `${minutes}:${seconds}`;
  document.getElementById("trackProgress").style.width = `${(fakePosition / 180) * 100}%`;
}

async function startCamera() {
  let cameraStarted = false;
  try {
    startCameraBtn.disabled = true;
    const existingStream = stream?.getTracks().some((track) => track.readyState === "live");
    if (!existingStream) {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 }, resizeMode: "none", facingMode: "user" }, audio: false });
      const cameraTrack = stream.getVideoTracks()[0];
      const cameraZoom = cameraTrack.getCapabilities?.().zoom;
      if (cameraZoom) await cameraTrack.applyConstraints({ advanced: [{ zoom: cameraZoom.min }] });
    }
    cameraStarted = true;
    video.srcObject = stream;
    await video.play();
    // Match the viewport box to the camera's real aspect ratio so the
    // full frame is shown instead of object-fit:cover cropping in tight
    // (which is what was making the feed look "zoomed in").
    if (video.videoWidth && video.videoHeight) {
      document.querySelector(".viewport").style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    }
    handStatusText.textContent = "Looking for a hand...";
    startCameraBtn.textContent = "Loading model...";
    let visionApi;
    try {
      visionApi = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs");
    } catch (primaryImportError) {
      visionApi = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm");
    }
    const { FilesetResolver, HandLandmarker } = visionApi;
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    const modelOptions = { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" };
    try {
      handLandmarker = await HandLandmarker.createFromOptions(vision, { baseOptions: { ...modelOptions, delegate: "GPU" }, runningMode: "VIDEO", numHands: 1, minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5 });
    } catch (gpuError) {
      handLandmarker = await HandLandmarker.createFromOptions(vision, { baseOptions: { ...modelOptions, delegate: "CPU" }, runningMode: "VIDEO", numHands: 1, minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5 });
    }
    cameraMessage.classList.add("ready");
    startCameraBtn.textContent = "Camera enabled";
    startCameraBtn.disabled = true;
    handStatusText.textContent = "Looking for a hand...";
    if (!animationStarted) {
      animationStarted = true;
      requestAnimationFrame(loop);
    }
  } catch (error) {
    startCameraBtn.disabled = false;
    if (cameraStarted) {
      cameraMessage.classList.remove("ready");
      startCameraBtn.textContent = "Retry hand tracking";
      handStatusText.textContent = "Camera on / tracker offline";
      gestureValue.textContent = "Hand tracker unavailable";
      gestureDetail.textContent = "Check internet access, then retry";
      if (!animationStarted) {
        animationStarted = true;
        requestAnimationFrame(loop);
      }
    } else {
      startCameraBtn.textContent = "Try again";
      cameraMessage.classList.remove("ready");
      cameraMessage.querySelector("span").textContent = error.name === "NotAllowedError" ? "Camera permission was blocked. Open this URL in desktop Chrome or Edge, allow the camera, then try again." : error.name === "NotFoundError" ? "No camera was found. Connect a webcam, then try again." : "The camera could not start. Check that no other app is using it, then try again.";
    }
  }
}

function loop(now) {
  processPixelFrame(now);
  if (video.readyState >= 2 && handLandmarker) {
    try {
      const result = handLandmarker.detectForVideo(video, now);
      handleFrame(result, now);
      const fps = Math.round(1000 / Math.max(now - lastFrameAt, 1));
      fpsReadout.textContent = `${Math.min(fps, 60)} FPS`;
      lastFrameAt = now;
    } catch (error) {
      handStatus.classList.remove("active");
      handStatusText.textContent = "Tracking paused - move hand into frame";
      gestureValue.textContent = "Detector unavailable";
      gestureDetail.textContent = "Reload and enable the camera again";
    }
  }
  updatePlayerClock();
  requestAnimationFrame(loop);
}

playerRender();
startCameraBtn.addEventListener("click", startCamera);
