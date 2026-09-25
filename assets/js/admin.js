// ============================================================================
// ADMIN PANELİ — ana mantık
// ============================================================================

let currentBrand = null;
let currentReportId = null;
let brands = [];
let reportArchive = [];
let reportDirty = false;
let googleEnabled = false;
let reportBusy = false;
let selectionVersion = 0;
let loadedPeriod = null;
const metricFields = { AdSpend: "ad_spend", Revenue: "revenue", AddToCart: "add_to_cart", Checkout: "checkout_started", Orders: "total_orders" };

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

function showToast(message, isError = false) {
  const root = document.getElementById("toastRoot");
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " toast--error" : ""}`;
  toast.textContent = message;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatCurrency(n) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n || 0);
}

function computeRoas(revenue, spend) {
  const r = parseTRNumber(revenue) || 0;
  const s = parseTRNumber(spend) || 0;
  if (s <= 0) return null;
  return r / s;
}

// Türkçe format: binlik ayırıcı nokta (.), ondalık ayırıcı virgül (,)
// Ekrandaki metni ("1.300.000,50") gerçek sayıya (1300000.5) çevirir
function parseTRNumber(str) {
  if (str === null || str === undefined) return 0;
  const s = String(str).trim();
  if (!s) return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// Ham sayıyı ("1300000.5") ekranda gösterilecek Türkçe metne ("1.300.000,5") çevirir
function formatTRNumber(num) {
  if (num === null || num === undefined || num === "") return "";
  const n = typeof num === "number" ? num : parseFloat(num);
  if (isNaN(n)) return "";
  const parts = n.toString().split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts[1] ? `${intPart},${parts[1]}` : intPart;
}

// Kullanıcı yazarken canlı biçimlendirme: sadece rakam/virgül kabul eder,
// binlik noktaları otomatik ekler. İmleç konumunu korumaya çalışır.
function attachTRNumberInput(inputEl) {
  inputEl.addEventListener("input", () => {
    const cursorFromEnd = inputEl.value.length - inputEl.selectionStart;
    let raw = inputEl.value.replace(/[^0-9,]/g, "");
    const firstComma = raw.indexOf(",");
    if (firstComma !== -1) {
      raw = raw.slice(0, firstComma + 1) + raw.slice(firstComma + 1).replace(/,/g, "");
    }
    const [intRaw, decRaw] = raw.split(",");
    const intFormatted = (intRaw || "").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    inputEl.value = decRaw !== undefined ? `${intFormatted},${decRaw}` : intFormatted;
    const newPos = Math.max(0, inputEl.value.length - cursorFromEnd);
    inputEl.setSelectionRange(newPos, newPos);
  });
}

// ---------------------------------------------------------------------------
// KİMLİK DOĞRULAMA
// ---------------------------------------------------------------------------

async function initAuth() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    showAdmin();
  } else {
    showLogin();
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) showAdmin();
    else showLogin();
  });
}

function showLogin() {
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("adminScreen").style.display = "none";
}

function showAdmin() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("adminScreen").style.display = "grid";
  loadBrands();
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorEl = document.getElementById("loginError");
  const btn = document.getElementById("loginBtn");

  errorEl.textContent = "";
  btn.disabled = true;
  btn.textContent = "Giriş yapılıyor…";

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.textContent = "Giriş Yap";

  if (error) {
    errorEl.textContent = "E-posta veya şifre hatalı.";
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  if (reportBusy || !canLeaveReport()) return;
  reportDirty = false;
  await supabaseClient.auth.signOut();
});

// ---------------------------------------------------------------------------
// MARKALAR
// ---------------------------------------------------------------------------

async function loadBrands() {
  const { data, error } = await supabaseClient
    .from("brands")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    showToast("Markalar yüklenemedi.", true);
    return;
  }

  brands = data || [];
  renderBrandList();

  if (brands.length && !currentBrand) {
    selectBrand(brands[0].id);
  } else if (!brands.length) {
    document.getElementById("mainContent").style.display = "none";
    document.getElementById("noBrandState").style.display = "flex";
    document.getElementById("shareBox").style.display = "none";
  }
}

function renderBrandList() {
  const list = document.getElementById("brandList");
  list.innerHTML = "";

  if (!brands.length) {
    list.innerHTML = `<div class="brand-list__empty">Henüz marka eklenmedi.</div>`;
    return;
  }

  brands.forEach((b) => {
    const item = document.createElement("div");
    item.className = `brand-list__item${currentBrand && currentBrand.id === b.id ? " active" : ""}`;
    item.innerHTML = `<span>${escapeHtml(b.name)}</span><button title="Markayı sil" data-id="${b.id}">🗑</button>`;
    item.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON") return;
      selectBrand(b.id);
    });
    item.querySelector("button").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteBrand(b.id, b.name);
    });
    list.appendChild(item);
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

document.getElementById("addBrandForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (reportBusy || !canLeaveReport()) return;
  const input = document.getElementById("newBrandName");
  const name = input.value.trim();
  if (!name) return;

  const { data, error } = await supabaseClient
    .from("brands")
    .insert({ name })
    .select()
    .single();

  if (error) {
    showToast("Marka eklenemedi.", true);
    return;
  }

  input.value = "";
  reportDirty = false;
  brands.push(data);
  renderBrandList();
  selectBrand(data.id);
  showToast(`"${name}" eklendi.`);
});

async function deleteBrand(id, name) {
  if (reportBusy || !canLeaveReport()) return;
  if (!confirm(`"${name}" markasını ve tüm raporlarını silmek istediğine emin misin? Bu işlem geri alınamaz.`)) return;

  const { error } = await supabaseClient.from("brands").delete().eq("id", id);
  if (error) {
    showToast("Marka silinemedi.", true);
    return;
  }

  reportDirty = false;
  brands = brands.filter((b) => b.id !== id);
  if (currentBrand && currentBrand.id === id) {
    currentBrand = null;
    currentReportId = null;
  }
  renderBrandList();

  if (brands.length) {
    selectBrand(brands[0].id);
  } else {
    document.getElementById("mainContent").style.display = "none";
    document.getElementById("noBrandState").style.display = "flex";
    document.getElementById("shareBox").style.display = "none";
  }
  showToast(`"${name}" silindi.`);
}

async function selectBrand(id) {
  if (reportBusy || !canLeaveReport()) return;
  const version = ++selectionVersion;
  currentReportId = null;
  loadedPeriod = null;
  currentBrand = brands.find((b) => b.id === id);
  if (!currentBrand) return;

  renderBrandList();
  document.getElementById("mainContent").style.display = "flex";
  document.getElementById("noBrandState").style.display = "none";
  document.getElementById("activeBrandTitle").textContent = currentBrand.name;
  updateLogoPreview();

  await loadReportArchive(version);
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// MARKA LOGOSU
// ---------------------------------------------------------------------------

function updateLogoPreview() {
  const img = document.getElementById("brandLogoPreviewImg");
  const text = document.getElementById("brandLogoPreviewText");
  if (currentBrand && currentBrand.logo_url) {
    img.src = currentBrand.logo_url;
    img.style.display = "block";
    text.style.display = "none";
  } else {
    img.style.display = "none";
    text.style.display = "block";
  }
}

document.getElementById("brandLogoUpload").addEventListener("click", () => {
  if (!currentBrand) return;
  document.getElementById("brandLogoInput").click();
});

document.getElementById("brandLogoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !currentBrand) return;

  const ext = file.name.split(".").pop();
  const path = `${currentBrand.id}/logo-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(LOGO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    showToast("Logo yüklenemedi.", true);
    return;
  }

  const { data: publicUrlData } = supabaseClient.storage.from(LOGO_BUCKET).getPublicUrl(path);

  const { error: updateError } = await supabaseClient
    .from("brands")
    .update({ logo_url: publicUrlData.publicUrl })
    .eq("id", currentBrand.id);

  if (updateError) {
    showToast("Logo kaydedilemedi.", true);
    return;
  }

  currentBrand.logo_url = publicUrlData.publicUrl;
  const idx = brands.findIndex((b) => b.id === currentBrand.id);
  if (idx > -1) brands[idx].logo_url = publicUrlData.publicUrl;

  updateLogoPreview();
  showToast("Logo güncellendi.");
});

// ---------------------------------------------------------------------------
// RAPOR (metrikler)
// ---------------------------------------------------------------------------


function canLeaveReport() {
  return !reportDirty || confirm("Kaydedilmemiş değişiklikler var. Kaydetmeden devam edilsin mi?");
}

function setDirty() {
  reportDirty = true;
  document.getElementById("reportState").textContent = "Kaydedilmemiş değişiklikler";
}

function periodLabel(r) {
  return r.report_date_end && r.report_date_end !== r.report_date
    ? `${r.report_date} — ${r.report_date_end}` : r.report_date;
}

function updateShareLink() {
  const box = document.getElementById("shareBox");
  box.style.display = currentReportId ? "block" : "none";
  if (!currentReportId) return;
  const base = new URL("./", window.location.href);
  const url = new URL("rapor/", base);
  url.searchParams.set("t", currentBrand.access_token);
  url.searchParams.set("r", currentReportId);
  document.getElementById("shareLinkText").textContent = url.href;
  document.getElementById("copyLinkBtn").onclick = async () => {
    try {
      await navigator.clipboard.writeText(url.href);
      showToast("Seçili raporun linki kopyalandı.");
    } catch (_) { showToast("Link kopyalanamadı.", true); }
  };
}

function renderArchive() {
  const select = document.getElementById("reportSelect");
  select.replaceChildren();
  const draft = document.createElement("option");
  draft.value = "";
  draft.textContent = "Yeni rapor";
  select.appendChild(draft);
  reportArchive.forEach(r => {
    const option = document.createElement("option");
    option.value = r.id;
    option.textContent = periodLabel(r);
    select.appendChild(option);
  });
  select.value = currentReportId || "";
}

async function loadReportArchive(version = selectionVersion) {
  const brandId = currentBrand.id;
  setReportBusy(true);
  try {
    const { data, error } = await supabaseClient.from("reports").select("*")
      .eq("brand_id", brandId).order("report_date", { ascending: false })
      .order("created_at", { ascending: false }).order("id", { ascending: false });
    if (version !== selectionVersion) return;
    if (error) throw error;
    reportArchive = data || [];
    renderArchive();
    await openReport(reportArchive[0] || null);
  } catch (_) {
    currentReportId = null;
    reportArchive = [];
    renderArchive();
    updateShareLink();
    document.getElementById("mainContent").style.display = "none";
    showToast("Raporlar yüklenemedi. Markayı yeniden seçerek tekrar dene.", true);
  } finally { setReportBusy(false); }
}

function fillMetrics(prefix, data) {
  Object.entries(metricFields).forEach(([suffix, key]) => {
    document.getElementById(prefix + suffix).value = data ? formatTRNumber(data[key] ?? 0) : "";
  });
  // Adet alanlarında Türkçe binlik ayırıcı kullanılmaz.
  ["AddToCart", "Checkout", "Orders"].forEach(suffix => {
    document.getElementById(prefix + suffix).value = data ? (data[metricFields[suffix]] ?? 0) : "";
  });
}

function readMetrics(prefix, allowEmpty = false) {
  const values = Object.entries(metricFields).map(([suffix, key], index) => {
    const input = document.getElementById(prefix + suffix);
    const raw = input.value.trim();
    const value = index < 2 ? parseTRNumber(raw) : Number(raw || 0);
    if (!Number.isFinite(value) || value < 0 || (index >= 2 && !Number.isInteger(value))) {
      throw new Error("Metrikler negatif olamaz; adet alanları tam sayı olmalı.");
    }
    return [key, value, raw];
  });
  if (allowEmpty && values.every(v => !v[2])) return null;
  return Object.fromEntries(values.map(([key, value]) => [key, value]));
}

function updateRoasPreview() {
  [["f", "roasPreview"], ["meta", "metaRoasPreview"], ["g", "googleRoasPreview"]].forEach(([prefix, id]) => {
    const roas = computeRoas(document.getElementById(prefix + "Revenue").value, document.getElementById(prefix + "AdSpend").value);
    document.getElementById(id).textContent = roas === null ? "—" : `x${roas.toFixed(2)}`;
  });
}

function renderGoogle() {
  document.getElementById("googleFields").hidden = !googleEnabled;
  const btn = document.getElementById("toggleGoogleBtn");
  btn.textContent = googleEnabled ? "Google Verilerini Kaldır" : "+ Google Ekle";
  btn.setAttribute("aria-expanded", String(googleEnabled));
}

async function openReport(report) {
  ++selectionVersion;
  currentReportId = report ? report.id : null;
  loadedPeriod = report ? { start: report.report_date, end: report.report_date_end || null } : null;
  document.getElementById("reportDateStart").value = report ? report.report_date : todayISO().slice(0, 7) + "-01";
  document.getElementById("reportDateEnd").value = report ? (report.report_date_end || "") : todayISO();
  fillMetrics("f", report);
  fillMetrics("meta", report && report.meta_data);
  fillMetrics("g", report && report.google_data);
  googleEnabled = !!(report && report.google_data);
  renderGoogle();
  updateRoasPreview();
  reportDirty = false;
  document.getElementById("reportState").textContent = report ? "Kayıtlı rapor" : "Yeni rapor";
  document.getElementById("saveReportBtn").textContent = report ? "Raporu Güncelle" : "Raporu Kaydet";
  document.getElementById("saveStatus").textContent = "";
  document.getElementById("reportSelect").value = currentReportId || "";
  updateDeleteReportButton();
  updateShareLink();
  await loadVideos();
}

function setReportBusy(busy) {
  reportBusy = busy;
  document.getElementById("mainContent").querySelectorAll("input, button, select").forEach(el => { el.disabled = busy; });
  updateDeleteReportButton();
}

function isSavedReportPeriod() {
  return !!(currentReportId && loadedPeriod &&
    document.getElementById("reportDateStart").value === loadedPeriod.start &&
    (document.getElementById("reportDateEnd").value || null) === loadedPeriod.end);
}

function updateDeleteReportButton() {
  const btn = document.getElementById("deleteReportBtn");
  btn.hidden = !currentReportId;
  btn.disabled = reportBusy || !isSavedReportPeriod();
  btn.title = isSavedReportPeriod() ? "Seçili kayıtlı raporu kalıcı olarak sil" : "Silmek için kayıtlı raporu listeden yeniden seç";
}

document.getElementById("deleteReportBtn").addEventListener("click", async () => {
  if (reportBusy || !currentBrand || !isSavedReportPeriod()) return;
  const report = reportArchive.find(r => r.id === currentReportId);
  if (!report) return;
  const message = `"${currentBrand.name}" — ${periodLabel(report)} raporu ve bu rapora bağlı kanca kayıtları kalıcı olarak silinecek. Diğer raporlar etkilenmez. Bu işlem geri alınamaz.` +
    (reportDirty ? "\nKaydedilmemiş değişiklikler de kaybolacak." : "") + "\n\nRaporu silmek istediğine emin misin?";
  if (!confirm(message)) return;
  const brandId = currentBrand.id;
  setReportBusy(true);
  try {
    const { data, error } = await supabaseClient.from("reports").delete()
      .eq("id", report.id).eq("brand_id", brandId).select("id").single();
    if (error || !data || data.id !== report.id) throw new Error("delete failed");
    reportArchive = reportArchive.filter(r => r.id !== report.id);
    renderArchive();
    await openReport(reportArchive[0] || null);
    showToast("Rapor silindi.");
  } catch (_) {
    showToast("Rapor silinemedi. Liste ve form korundu; tekrar deneyebilirsin.", true);
  } finally { setReportBusy(false); }
});

document.getElementById("newReportBtn").addEventListener("click", async () => {
  if (!reportBusy && canLeaveReport()) {
    setReportBusy(true);
    try { await openReport(null); } finally { setReportBusy(false); }
  }
});
document.getElementById("reportSelect").addEventListener("change", async e => {
  const id = e.target.value;
  if (reportBusy || !canLeaveReport()) { e.target.value = currentReportId || ""; return; }
  setReportBusy(true);
  try { await openReport(reportArchive.find(r => r.id === id) || null); } finally { setReportBusy(false); }
});

["f", "meta", "g"].forEach(prefix => {
  Object.keys(metricFields).forEach(suffix => {
    const input = document.getElementById(prefix + suffix);
    if (suffix === "AdSpend" || suffix === "Revenue") attachTRNumberInput(input);
    input.addEventListener("input", () => { setDirty(); updateRoasPreview(); });
  });
});
["reportDateStart", "reportDateEnd"].forEach(id => {
  document.getElementById(id).addEventListener("input", () => {
    setDirty();
    const changed = loadedPeriod && (document.getElementById("reportDateStart").value !== loadedPeriod.start ||
      (document.getElementById("reportDateEnd").value || null) !== loadedPeriod.end);
    document.getElementById("saveReportBtn").textContent = changed ? "Yeni Dönem Olarak Kaydet" : currentReportId ? "Raporu Güncelle" : "Raporu Kaydet";
    updateDeleteReportButton();
  });
});
window.addEventListener("beforeunload", e => {
  if (reportDirty || reportBusy) { e.preventDefault(); e.returnValue = ""; }
});

document.getElementById("toggleGoogleBtn").addEventListener("click", async () => {
  if (reportBusy) return;
  if (!googleEnabled) { googleEnabled = true; renderGoogle(); setDirty(); return; }
  // Sadece bu kaydın Google alanını temizle; diğer taslak değişikliklere dokunma.
  setReportBusy(true);
  try {
    const changedPeriod = loadedPeriod && (document.getElementById("reportDateStart").value !== loadedPeriod.start ||
      (document.getElementById("reportDateEnd").value || null) !== loadedPeriod.end);
    if (currentReportId && !changedPeriod) {
      const { data, error } = await supabaseClient.from("reports").update({ google_data: null })
        .eq("id", currentReportId).eq("brand_id", currentBrand.id).select().single();
      if (error) throw error;
      reportArchive = reportArchive.map(r => r.id === data.id ? data : r);
    }
    googleEnabled = false;
    fillMetrics("g", null);
    renderGoogle();
    updateRoasPreview();
    showToast("Google bölümü ve verileri bu rapordan kaldırıldı.");
  } catch (_) { showToast("Google verileri kaldırılamadı.", true); }
  finally { setReportBusy(false); }
});

document.getElementById("saveReportBtn").addEventListener("click", async () => {
  if (!currentBrand || reportBusy) return;
  const status = document.getElementById("saveStatus");
  try {
    const start = document.getElementById("reportDateStart").value;
    const end = document.getElementById("reportDateEnd").value || null;
    if (!start || (end && end < start)) throw new Error("Geçerli bir tarih aralığı seç.");
    const newPeriod = loadedPeriod && (start !== loadedPeriod.start || end !== loadedPeriod.end);
    const saveId = newPeriod ? null : currentReportId;
    if (reportArchive.some(r => r.id !== saveId && r.report_date === start && (r.report_date_end || null) === end)) {
      throw new Error("Bu dönem zaten kayıtlı. Kayıtlı Raporlar listesinden açıp düzenleyebilirsin.");
    }
    const payload = { brand_id: currentBrand.id, report_date: start, report_date_end: end,
      ...readMetrics("f"), meta_data: readMetrics("meta", true), google_data: googleEnabled ? readMetrics("g") : null };
    setReportBusy(true);
    status.textContent = "Kaydediliyor…";
    const result = saveId
      ? await supabaseClient.from("reports").update(payload).eq("id", saveId).eq("brand_id", currentBrand.id).select().single()
      : await supabaseClient.from("reports").insert(payload).select().single();
    if (result.error) throw new Error("Kaydedilemedi. Veriler ekranda duruyor; tekrar deneyebilirsin.");
    reportArchive = reportArchive.filter(r => r.id !== result.data.id);
    reportArchive.push(result.data);
    reportArchive.sort((a, b) => b.report_date.localeCompare(a.report_date) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    renderArchive();
    await openReport(result.data);
    status.textContent = "Kaydedildi ✓";
    if (newPeriod) showToast("Yeni dönem kaydedildi. Önceki rapor ve videoları arşivde korundu.");
  } catch (err) { status.textContent = ""; showToast(err.message, true); }
  finally { setReportBusy(false); }
});

// ---------------------------------------------------------------------------
// VİDEOLAR / KANCALAR
// ---------------------------------------------------------------------------

async function loadVideos() {
  const list = document.getElementById("adminHookList");
  const addTile = document.getElementById("addHookTile");

  [...list.querySelectorAll(".admin-hook-card")].forEach((n) => n.remove());

  if (!currentReportId) return;
  const reportId = currentReportId;

  const { data, error } = await supabaseClient
    .from("videos")
    .select("*")
    .eq("report_id", reportId)
    .order("sort_order", { ascending: true });

  if (reportId !== currentReportId) return;
  if (error) { showToast("Kancalar yüklenemedi.", true); return; }

  (data || []).forEach((v) => {
    const card = document.createElement("div");
    card.className = "admin-hook-card";
    card.draggable = true;
    card.dataset.id = v.id;
    card.innerHTML = `
      <div class="admin-hook-card__drag" title="Taşımak için sürükle">⠿</div>
      <video src="${v.video_url}" muted playsinline preload="metadata"></video>
      <div class="admin-hook-card__body">
        <div class="admin-hook-card__title">${escapeHtml(v.title || "Başlıksız")}</div>
        <div class="admin-hook-card__meta">
          <span>${v.hook_rate != null ? v.hook_rate + "% hook" : "—"}</span>
          <button data-id="${v.id}" >Sil</button>
        </div>
      </div>`;
    card.querySelector("button").addEventListener("click", () => deleteVideo(v.id, v.video_url));
    attachDragReorder(card, list, addTile);
    list.insertBefore(card, addTile);
  });
}

// Kanca kartlarını sürükle-bırakla yeniden sıralama
function attachDragReorder(card, list, addTile) {
  card.addEventListener("dragstart", () => {
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", async () => {
    card.classList.remove("dragging");
    await persistHookOrder(list, addTile);
  });
  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    const dragging = list.querySelector(".dragging");
    if (!dragging || dragging === card) return;
    const rect = card.getBoundingClientRect();
    const before = e.clientX < rect.left + rect.width / 2;
    list.insertBefore(dragging, before ? card : card.nextSibling);
  });
}

async function persistHookOrder(list, addTile) {
  const cards = [...list.querySelectorAll(".admin-hook-card")];
  const updates = cards.map((card, index) =>
    supabaseClient.from("videos").update({ sort_order: index }).eq("id", card.dataset.id)
  );
  await Promise.all(updates);
}

document.getElementById("addHookTile").addEventListener("click", () => {
  if (reportDirty || !currentReportId) {
    showToast("Önce raporu kaydet, sonra video ekleyebilirsin.", true);
    return;
  }
  document.getElementById("videoFileInput").click();
});

document.getElementById("videoFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const brandId = currentBrand.id;
  const reportId = currentReportId;
  VideoTrim.open(file, args => handleTrimComplete({ ...args, brandId, reportId }));
  e.target.value = "";
});

async function handleTrimComplete({ blob, title, hookRate, clipStart, clipEnd, originalDuration, onProgress, brandId, reportId }) {
  const fileName = `${brandId}/${reportId}/${Date.now()}.webm`;

  onProgress(20);

  const { error: uploadError } = await supabaseClient.storage
    .from(VIDEO_BUCKET)
    .upload(fileName, blob, { contentType: blob.type || "video/webm", upsert: false });

  if (uploadError) {
    throw new Error("Video yüklenemedi: " + uploadError.message);
  }

  onProgress(70);

  const { data: publicUrlData } = supabaseClient.storage.from(VIDEO_BUCKET).getPublicUrl(fileName);

  const { error: insertError } = await supabaseClient.from("videos").insert({
    report_id: reportId,
    title,
    video_url: publicUrlData.publicUrl,
    hook_rate: hookRate,
    clip_start: clipStart,
    clip_end: clipEnd,
    original_duration: originalDuration,
    sort_order: Date.now(),
  });

  if (insertError) {
    await supabaseClient.storage.from(VIDEO_BUCKET).remove([fileName]);
    throw new Error("Kayıt eklenemedi: " + insertError.message);
  }

  onProgress(100);
  showToast("Kanca eklendi.");
  await loadVideos();
}

async function deleteVideo(id, url) {
  if (!confirm("Bu videoyu silmek istediğine emin misin?")) return;

  const { error } = await supabaseClient.from("videos").delete().eq("id", id);
  if (error) { showToast("Video silinemedi.", true); return; }

  try {
    const path = decodeURIComponent(url.split(`/${VIDEO_BUCKET}/`)[1]);
    if (path) await supabaseClient.storage.from(VIDEO_BUCKET).remove([path]);
  } catch (_) {}

  showToast("Video silindi.");
  await loadVideos();
}

initAuth();
