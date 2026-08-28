// ============================================================================
// VİDEO KESME MODÜLÜ
// Kullanıcı bir video dosyası seçtiğinde bu modal açılır, başlangıç/bitiş
// aralığı seçilir ve tarayıcı içinde (MediaRecorder ile) o segment yeni bir
// video dosyası olarak "kesilip" admin.js'e teslim edilir.
//
// Not: video.captureStream() + MediaRecorder Chrome/Edge/Firefox masaüstünde
// güvenilir çalışır. Safari'de kısıtlı olabilir — panel kullanımını Chrome
// veya Edge ile yapman önerilir.
// ============================================================================

const VideoTrim = (() => {
  let currentFile = null;
  let objectUrl = null;
  let onCompleteCallback = null;
  let recordedBlob = null;
  let originalDuration = 0;

  const el = {
    modal: () => document.getElementById("trimModal"),
    video: () => document.getElementById("trimVideoPreview"),
    startRange: () => document.getElementById("startRange"),
    endRange: () => document.getElementById("endRange"),
    startLabel: () => document.getElementById("startLabel"),
    endLabel: () => document.getElementById("endLabel"),
    durationNote: () => document.getElementById("trimDurationNote"),
    statusNote: () => document.getElementById("trimStatusNote"),
    titleInput: () => document.getElementById("hookTitleInput"),
    rateInput: () => document.getElementById("hookRateInput"),
    confirmBtn: () => document.getElementById("confirmTrimBtn"),
    previewBtn: () => document.getElementById("previewClipBtn"),
    progressWrap: () => document.getElementById("uploadProgressWrap"),
    progressBar: () => document.getElementById("uploadProgressBar"),
  };

  function fmt(t) {
    return `${t.toFixed(1)}s`;
  }

  function open(file, onComplete) {
    currentFile = file;
    onCompleteCallback = onComplete;
    recordedBlob = null;

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);

    const video = el.video();
    video.src = objectUrl;

    el.titleInput().value = "";
    el.rateInput().value = "";
    el.statusNote().textContent = "";
    el.statusNote().classList.remove("warn");
    el.progressWrap().style.display = "none";
    el.progressBar().style.width = "0%";
    el.confirmBtn().disabled = false;
    el.confirmBtn().textContent = "Kes ve Yükle";

    video.onloadedmetadata = () => {
      originalDuration = video.duration || 10;
      const defaultEnd = Math.min(4, originalDuration);
      el.startRange().max = originalDuration.toFixed(1);
      el.endRange().max = originalDuration.toFixed(1);
      el.startRange().value = 0;
      el.endRange().value = defaultEnd.toFixed(1);
      updateLabels();
    };

    el.modal().style.display = "flex";
  }

  function close() {
    el.modal().style.display = "none";
    const video = el.video();
    video.pause();
    video.src = "";
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    currentFile = null;
    recordedBlob = null;
  }

  function updateLabels() {
    let start = parseFloat(el.startRange().value);
    let end = parseFloat(el.endRange().value);
    if (end <= start) {
      end = Math.min(originalDuration, start + 0.5);
      el.endRange().value = end.toFixed(1);
    }
    el.startLabel().textContent = fmt(start);
    el.endLabel().textContent = fmt(end);
    const dur = end - start;
    const note = el.durationNote();
    note.textContent = `Klip süresi: ${dur.toFixed(1)} sn`;
    note.classList.toggle("warn", dur > 8);
  }

  function previewSegment() {
    const video = el.video();
    const start = parseFloat(el.startRange().value);
    const end = parseFloat(el.endRange().value);
    video.currentTime = start;
    video.muted = false;
    video.play();
    const onTick = () => {
      if (video.currentTime >= end) {
        video.pause();
        video.removeEventListener("timeupdate", onTick);
      }
    };
    video.addEventListener("timeupdate", onTick);
  }

  function pickMimeType() {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    for (const c of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  }

  function trimToBlob() {
    return new Promise((resolve, reject) => {
      const video = el.video();
      const start = parseFloat(el.startRange().value);
      const end = parseFloat(el.endRange().value);

      if (!video.captureStream && !video.mozCaptureStream) {
        reject(new Error("Bu tarayıcı video kesmeyi desteklemiyor. Lütfen Chrome veya Edge kullan."));
        return;
      }

      const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || "video/webm" });
        video.pause();
        video.muted = true;
        resolve(blob);
      };

      recorder.onerror = (e) => reject(e.error || new Error("Kayıt hatası"));

      video.currentTime = start;
      video.muted = true;

      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        recorder.start();
        video.play();

        const onTick = () => {
          if (video.currentTime >= end) {
            video.removeEventListener("timeupdate", onTick);
            recorder.stop();
          }
        };
        video.addEventListener("timeupdate", onTick);
      };
      video.addEventListener("seeked", onSeeked);
    });
  }

  async function confirm() {
    const title = el.titleInput().value.trim();
    const rate = el.rateInput().value;
    const confirmBtn = el.confirmBtn();
    const statusNote = el.statusNote();

    if (!title) {
      statusNote.textContent = "Lütfen video başlığı gir.";
      statusNote.classList.add("warn");
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = "Kesiliyor…";
    statusNote.classList.remove("warn");
    statusNote.textContent = "Klip taranıyor, lütfen bekle…";

    try {
      const blob = await trimToBlob();
      statusNote.textContent = "Yükleniyor…";

      const start = parseFloat(el.startRange().value);
      const end = parseFloat(el.endRange().value);

      await onCompleteCallback({
        blob,
        title,
        hookRate: rate ? parseFloat(rate) : null,
        clipStart: start,
        clipEnd: end,
        originalDuration,
        onProgress: (pct) => {
          el.progressWrap().style.display = "block";
          el.progressBar().style.width = `${pct}%`;
        },
      });

      close();
    } catch (err) {
      console.error(err);
      statusNote.textContent = err.message || "Bir hata oluştu, tekrar dener misin?";
      statusNote.classList.add("warn");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Kes ve Yükle";
    }
  }

  function init() {
    el.startRange().addEventListener("input", updateLabels);
    el.endRange().addEventListener("input", updateLabels);
    el.previewBtn().addEventListener("click", previewSegment);
    el.confirmBtn().addEventListener("click", confirm);
    document.getElementById("cancelTrimBtn").addEventListener("click", close);
    document.getElementById("closeTrimModal").addEventListener("click", close);
  }

  return { init, open, close };
})();

document.addEventListener("DOMContentLoaded", VideoTrim.init);
