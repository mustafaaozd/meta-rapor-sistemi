// ============================================================================
// VİDEO KESME MODÜLÜ (CapCut mantığı)
// Video native kontrollerle oynatılır/durdurulur, kullanıcı istediği saniyede
// "Başlangıcı Buraya Al" / "Bitişi Buraya Al" butonlarına basarak kanca
// aralığını işaretler. Bir zaman çizelgesi (timeline) canlı oynatma
// konumunu ve seçili aralığı gösterir.
// ============================================================================

const VideoTrim = (() => {
  let currentFile = null;
  let objectUrl = null;
  let onCompleteCallback = null;
  let originalDuration = 0;
  let clipStart = 0;
  let clipEnd = 0;

  const el = {
    modal: () => document.getElementById("trimModal"),
    video: () => document.getElementById("trimVideoPreview"),
    track: () => document.getElementById("timelineTrack"),
    range: () => document.getElementById("timelineRange"),
    playhead: () => document.getElementById("timelinePlayhead"),
    startLabel: () => document.getElementById("startLabel"),
    endLabel: () => document.getElementById("endLabel"),
    currentLabel: () => document.getElementById("currentLabel"),
    durationNote: () => document.getElementById("trimDurationNote"),
    statusNote: () => document.getElementById("trimStatusNote"),
    titleInput: () => document.getElementById("hookTitleInput"),
    rateInput: () => document.getElementById("hookRateInput"),
    confirmBtn: () => document.getElementById("confirmTrimBtn"),
    previewBtn: () => document.getElementById("previewClipBtn"),
    markStartBtn: () => document.getElementById("markStartBtn"),
    markEndBtn: () => document.getElementById("markEndBtn"),
    progressWrap: () => document.getElementById("uploadProgressWrap"),
    progressBar: () => document.getElementById("uploadProgressBar"),
  };

  function fmt(t) {
    return `${t.toFixed(1)}s`;
  }

  function open(file, onComplete) {
    currentFile = file;
    onCompleteCallback = onComplete;

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);

    const video = el.video();
    video.src = objectUrl;
    video.muted = false;

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
      clipStart = 0;
      clipEnd = Math.min(4, originalDuration);
      updateVisuals();
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
  }

  function updateVisuals() {
    if (clipEnd <= clipStart) clipEnd = Math.min(originalDuration, clipStart + 0.3);

    el.startLabel().textContent = `Başlangıç: ${fmt(clipStart)}`;
    el.endLabel().textContent = `Bitiş: ${fmt(clipEnd)}`;

    const startPct = originalDuration > 0 ? (clipStart / originalDuration) * 100 : 0;
    const widthPct = originalDuration > 0 ? ((clipEnd - clipStart) / originalDuration) * 100 : 0;
    el.range().style.left = `${startPct}%`;
    el.range().style.width = `${Math.max(widthPct, 0.5)}%`;

    const dur = clipEnd - clipStart;
    const note = el.durationNote();
    note.textContent = `Klip süresi: ${dur.toFixed(1)} sn`;
    note.classList.toggle("warn", dur > 8 || dur <= 0);
  }

  function updatePlayhead() {
    const video = el.video();
    if (!originalDuration) return;
    const pct = Math.min(100, (video.currentTime / originalDuration) * 100);
    el.playhead().style.left = `${pct}%`;
    el.currentLabel().textContent = `Şu an: ${fmt(video.currentTime)}`;
  }

  function seekFromTrackClick(e) {
    const track = el.track();
    const rect = track.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    el.video().currentTime = pct * originalDuration;
  }

  function markStart() {
    clipStart = el.video().currentTime;
    if (clipStart >= clipEnd) clipEnd = Math.min(originalDuration, clipStart + 1);
    updateVisuals();
  }

  function markEnd() {
    clipEnd = el.video().currentTime;
    if (clipEnd <= clipStart) clipStart = Math.max(0, clipEnd - 1);
    updateVisuals();
  }

  function previewSegment() {
    const video = el.video();
    video.currentTime = clipStart;
    video.muted = false;
    video.play();
    const onTick = () => {
      if (video.currentTime >= clipEnd) {
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
        resolve(blob);
      };

      recorder.onerror = (e) => reject(e.error || new Error("Kayıt hatası"));

      video.currentTime = clipStart;

      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        recorder.start();
        video.play();

        const onTick = () => {
          if (video.currentTime >= clipEnd) {
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
    if (clipEnd - clipStart <= 0) {
      statusNote.textContent = "Geçerli bir başlangıç/bitiş aralığı seç.";
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

      await onCompleteCallback({
        blob,
        title,
        hookRate: rate ? parseFloat(rate) : null,
        clipStart,
        clipEnd,
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
    el.video().addEventListener("timeupdate", updatePlayhead);
    el.track().addEventListener("click", seekFromTrackClick);
    el.markStartBtn().addEventListener("click", markStart);
    el.markEndBtn().addEventListener("click", markEnd);
    el.previewBtn().addEventListener("click", previewSegment);
    el.confirmBtn().addEventListener("click", confirm);
    document.getElementById("cancelTrimBtn").addEventListener("click", close);
    document.getElementById("closeTrimModal").addEventListener("click", close);
  }

  return { init, open, close };
})();

document.addEventListener("DOMContentLoaded", VideoTrim.init);
