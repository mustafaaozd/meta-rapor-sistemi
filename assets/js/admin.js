// ============================================================================
// ADMIN PANELİ — ana mantık
// ============================================================================

let currentBrand = null;
let currentReportId = null;
let brands = [];

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
  return new Date().toISOString().slice(0, 10);
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
  brands.push(data);
  renderBrandList();
  selectBrand(data.id);
  showToast(`"${name}" eklendi.`);
});

async function deleteBrand(id, name) {
  if (!confirm(`"${name}" markasını ve tüm raporlarını silmek istediğine emin misin? Bu işlem geri alınamaz.`)) return;

  const { error } = await supabaseClient.from("brands").delete().eq("id", id);
  if (error) {
    showToast("Marka silinemedi.", true);
    return;
  }

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
  currentBrand = brands.find((b) => b.id === id);
  if (!currentBrand) return;

  renderBrandList();
  document.getElementById("mainContent").style.display = "flex";
  document.getElementById("noBrandState").style.display = "none";
  document.getElementById("activeBrandTitle").textContent = currentBrand.name;
  updateLogoPreview();

  const shareBox = document.getElementById("shareBox");
  shareBox.style.display = "block";
  const base = `${window.location.origin}${window.location.pathname.replace(/index\.html$/, "")}`;
  const link = `${base}rapor/?t=${currentBrand.access_token}`;
  document.getElementById("shareLinkText").textContent = link;
  document.getElementById("copyLinkBtn").onclick = () => {
    navigator.clipboard.writeText(link);
    showToast("Link kopyalandı.");
  };
  const dailyLink = `${base}gunluk/?t=${currentBrand.access_token}`;
  document.getElementById("shareDailyLinkText").textContent = dailyLink;
  document.getElementById("copyDailyLinkBtn").onclick = () => {
    navigator.clipboard.writeText(dailyLink);
    showToast("Link kopyalandı.");
  };

  await loadOrCreateReport();
  if (currentMode === "daily") {
    await loadDailyEntries();
    await loadCreatives();
  }
}

// ---------------------------------------------------------------------------
// AYLIK / GÜNLÜK GEÇİŞ
// ---------------------------------------------------------------------------

let currentMode = "monthly";

document.getElementById("modeMonthlyBtn").addEventListener("click", () => switchMode("monthly"));
document.getElementById("modeDailyBtn").addEventListener("click", () => switchMode("daily"));

async function switchMode(mode) {
  currentMode = mode;
  document.getElementById("modeMonthlyBtn").classList.toggle("active", mode === "monthly");
  document.getElementById("modeDailyBtn").classList.toggle("active", mode === "daily");
  document.getElementById("monthlyView").style.display = mode === "monthly" ? "block" : "none";
  document.getElementById("dailyView").style.display = mode === "daily" ? "block" : "none";

  if (mode === "daily" && currentBrand) {
    await loadDailyEntries();
    await loadCreatives();
  }
}

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

async function loadOrCreateReport() {
  document.getElementById("reportDateStart").value = todayISO();
  document.getElementById("reportDateEnd").value = "";

  const { data, error } = await supabaseClient
    .from("reports")
    .select("*")
    .eq("brand_id", currentBrand.id)
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    showToast("Rapor yüklenemedi.", true);
    return;
  }

  if (data) {
    currentReportId = data.id;
    document.getElementById("reportDateStart").value = data.report_date;
    document.getElementById("reportDateEnd").value = data.report_date_end || "";
    document.getElementById("fAdSpend").value = formatTRNumber(data.ad_spend);
    document.getElementById("fRevenue").value = formatTRNumber(data.revenue);
    document.getElementById("fAddToCart").value = data.add_to_cart;
    document.getElementById("fCheckout").value = data.checkout_started;
    document.getElementById("fOrders").value = data.total_orders;
  } else {
    currentReportId = null;
    ["fAdSpend", "fRevenue", "fAddToCart", "fCheckout", "fOrders"].forEach((id) => {
      document.getElementById(id).value = "";
    });
  }

  updateRoasPreview();
  await loadVideos();
}

function updateRoasPreview() {
  const spend = document.getElementById("fAdSpend").value;
  const revenue = document.getElementById("fRevenue").value;
  const roas = computeRoas(revenue, spend);
  document.getElementById("roasPreview").textContent = roas === null ? "—" : `x${roas.toFixed(2)}`;
}

attachTRNumberInput(document.getElementById("fAdSpend"));
attachTRNumberInput(document.getElementById("fRevenue"));

["fAdSpend", "fRevenue"].forEach((id) => {
  document.getElementById(id).addEventListener("input", updateRoasPreview);
});

document.getElementById("saveReportBtn").addEventListener("click", async () => {
  if (!currentBrand) return;
  const btn = document.getElementById("saveReportBtn");
  const status = document.getElementById("saveStatus");
  btn.disabled = true;
  status.textContent = "Kaydediliyor…";

  const payload = {
    brand_id: currentBrand.id,
    report_date: document.getElementById("reportDateStart").value || todayISO(),
    report_date_end: document.getElementById("reportDateEnd").value || null,
    ad_spend: parseTRNumber(document.getElementById("fAdSpend").value),
    revenue: parseTRNumber(document.getElementById("fRevenue").value),
    add_to_cart: parseInt(document.getElementById("fAddToCart").value) || 0,
    checkout_started: parseInt(document.getElementById("fCheckout").value) || 0,
    total_orders: parseInt(document.getElementById("fOrders").value) || 0,
  };

  let result;
  if (currentReportId) {
    result = await supabaseClient.from("reports").update(payload).eq("id", currentReportId).select().single();
  } else {
    result = await supabaseClient.from("reports").insert(payload).select().single();
  }

  btn.disabled = false;

  if (result.error) {
    status.textContent = "";
    showToast("Kaydedilemedi, tekrar dener misin?", true);
    return;
  }

  currentReportId = result.data.id;
  status.textContent = "Kaydedildi ✓";
  setTimeout(() => (status.textContent = ""), 2200);
});

// ---------------------------------------------------------------------------
// VİDEOLAR / KANCALAR
// ---------------------------------------------------------------------------

async function loadVideos() {
  const list = document.getElementById("adminHookList");
  const addTile = document.getElementById("addHookTile");

  [...list.querySelectorAll(".admin-hook-card")].forEach((n) => n.remove());

  if (!currentReportId) return;

  const { data, error } = await supabaseClient
    .from("videos")
    .select("*")
    .eq("report_id", currentReportId)
    .order("sort_order", { ascending: true });

  if (error) return;

  (data || []).forEach((v) => {
    const card = document.createElement("div");
    card.className = "admin-hook-card";
    card.innerHTML = `
      <video src="${v.video_url}" muted playsinline preload="metadata"></video>
      <div class="admin-hook-card__body">
        <div class="admin-hook-card__title">${escapeHtml(v.title || "Başlıksız")}</div>
        <div class="admin-hook-card__meta">
          <span>${v.hook_rate != null ? v.hook_rate + "% hook" : "—"}</span>
          <button data-id="${v.id}" data-path="${v.storage_path || ""}">Sil</button>
        </div>
      </div>`;
    card.querySelector("button").addEventListener("click", () => deleteVideo(v.id, v.video_url));
    list.insertBefore(card, addTile);
  });
}

document.getElementById("addHookTile").addEventListener("click", () => {
  if (!currentReportId) {
    showToast("Önce raporu kaydet, sonra video ekleyebilirsin.", true);
    return;
  }
  document.getElementById("videoFileInput").click();
});

document.getElementById("videoFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  VideoTrim.open(file, handleTrimComplete);
  e.target.value = "";
});

async function handleTrimComplete({ blob, title, hookRate, clipStart, clipEnd, originalDuration, onProgress }) {
  const fileName = `${currentBrand.id}/${currentReportId}/${Date.now()}.webm`;

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
    report_id: currentReportId,
    title,
    video_url: publicUrlData.publicUrl,
    hook_rate: hookRate,
    clip_start: clipStart,
    clip_end: clipEnd,
    original_duration: originalDuration,
    sort_order: Date.now(),
  });

  if (insertError) {
    throw new Error("Kayıt eklenemedi: " + insertError.message);
  }

  onProgress(100);
  showToast("Kanca eklendi.");
  await loadVideos();
}

async function deleteVideo(id, url) {
  if (!confirm("Bu videoyu silmek istediğine emin misin?")) return;

  await supabaseClient.from("videos").delete().eq("id", id);

  try {
    const path = decodeURIComponent(url.split(`/${VIDEO_BUCKET}/`)[1]);
    if (path) await supabaseClient.storage.from(VIDEO_BUCKET).remove([path]);
  } catch (_) {}

  showToast("Video silindi.");
  await loadVideos();
}

// ---------------------------------------------------------------------------
// GÜNLÜK TAKİP (Gün Gün Takip tablosu)
// ---------------------------------------------------------------------------

async function loadDailyEntries() {
  if (!currentBrand) return;
  const { data, error } = await supabaseClient
    .from("daily_entries")
    .select("*")
    .eq("brand_id", currentBrand.id)
    .order("entry_date", { ascending: false });

  if (error) return;
  renderDailyTable(data || []);
}

function renderDailyTable(rows) {
  const body = document.getElementById("dailyTableBody");
  const emptyHint = document.getElementById("dailyEmptyHint");
  body.innerHTML = "";

  emptyHint.style.display = rows.length ? "none" : "block";

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const roas = row.ad_spend > 0 ? (row.revenue / row.ad_spend).toFixed(2) : "—";
    tr.innerHTML = `
      <td><input type="date" value="${row.entry_date}" data-field="entry_date" /></td>
      <td><input type="text" inputmode="decimal" value="${formatTRNumber(row.ad_spend)}" data-field="ad_spend" /></td>
      <td><input type="text" inputmode="decimal" value="${formatTRNumber(row.revenue)}" data-field="revenue" /></td>
      <td class="roas-cell">${roas === "—" ? "—" : "x" + roas}</td>
      <td><button class="row-delete" title="Sil">🗑</button></td>`;

    const roasCell = tr.querySelector(".roas-cell");
    tr.querySelectorAll('input[type="text"]').forEach(attachTRNumberInput);
    tr.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", async () => {
        const field = input.dataset.field;
        const value = field === "entry_date" ? input.value : parseTRNumber(input.value);
        await supabaseClient.from("daily_entries").update({ [field]: value }).eq("id", row.id);
        const spend = parseTRNumber(tr.querySelector('[data-field="ad_spend"]').value);
        const rev = parseTRNumber(tr.querySelector('[data-field="revenue"]').value);
        roasCell.textContent = spend > 0 ? "x" + (rev / spend).toFixed(2) : "—";
      });
    });
    tr.querySelector(".row-delete").addEventListener("click", async () => {
      if (!confirm("Bu günü silmek istediğine emin misin?")) return;
      await supabaseClient.from("daily_entries").delete().eq("id", row.id);
      await loadDailyEntries();
    });

    body.appendChild(tr);
  });
}

document.getElementById("addDayBtn").addEventListener("click", async () => {
  if (!currentBrand) return;
  const { error } = await supabaseClient.from("daily_entries").insert({
    brand_id: currentBrand.id,
    entry_date: todayISO(),
    ad_spend: 0,
    revenue: 0,
    sort_order: Date.now(),
  });
  if (error) {
    showToast("Gün eklenemedi.", true);
    return;
  }
  await loadDailyEntries();
});

// ---------------------------------------------------------------------------
// KREATİF TEST SONUÇLARI (görsel/video + reklam setleri)
// ---------------------------------------------------------------------------

const SET_COLORS = ["blue", "red", "green"];

async function loadCreatives() {
  if (!currentBrand) return;
  const { data, error } = await supabaseClient
    .from("creatives")
    .select("*, creative_sets(*)")
    .eq("brand_id", currentBrand.id)
    .order("sort_order", { ascending: true });

  if (error) return;
  renderCreatives(data || []);
}

function renderCreatives(creatives) {
  const list = document.getElementById("creativeList");
  list.innerHTML = "";

  if (!creatives.length) {
    list.innerHTML = `<p class="empty-hint">Henüz kreatif eklenmedi.</p>`;
    return;
  }

  creatives.forEach((creative) => {
    const card = document.createElement("div");
    card.className = "creative-card";

    const mediaTag =
      creative.media_type === "video"
        ? `<video src="${creative.media_url}" muted playsinline></video>`
        : `<img src="${creative.media_url}" alt="" />`;

    card.innerHTML = `
      <div class="creative-card__top">
        <div class="creative-card__media">${mediaTag}</div>
        <div class="creative-card__info">
          <input type="text" value="${escapeHtml(creative.title || "")}" placeholder="Kreatif adı" data-field="title" />
          <textarea placeholder="Not (örn. tıklama oranı düşük, sepete ekleme maliyeti yüksek...)" data-field="note">${escapeHtml(creative.note || "")}</textarea>
        </div>
        <button class="creative-card__delete" title="Kreatifi sil">🗑</button>
      </div>
      <div class="creative-sets">
        <table>
          <thead><tr><th>Set</th><th>Tarih</th><th>Harcama (₺)</th><th>Satış</th><th>ROAS</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
        <button class="add-set-btn" type="button">+ Set Ekle</button>
      </div>`;

    card.querySelector('[data-field="title"]').addEventListener("change", async (e) => {
      await supabaseClient.from("creatives").update({ title: e.target.value }).eq("id", creative.id);
    });
    card.querySelector('[data-field="note"]').addEventListener("change", async (e) => {
      await supabaseClient.from("creatives").update({ note: e.target.value }).eq("id", creative.id);
    });
    card.querySelector(".creative-card__delete").addEventListener("click", () => deleteCreative(creative));

    const tbody = card.querySelector("tbody");
    const sets = (creative.creative_sets || []).sort((a, b) => a.sort_order - b.sort_order);
    sets.forEach((set) => renderSetRow(tbody, creative, set));

    card.querySelector(".add-set-btn").addEventListener("click", () => addSet(creative, tbody));

    list.appendChild(card);
  });
}

function renderSetRow(tbody, creative, set) {
  const tr = document.createElement("tr");
  const roas = set.spend > 0 ? (set.sales / set.spend).toFixed(2) : "—";
  tr.innerHTML = `
    <td><span class="set-badge ${set.color}">${escapeHtml(set.label)}</span></td>
    <td><input type="date" value="${set.start_date || ""}" data-field="start_date" /></td>
    <td><input type="text" inputmode="decimal" value="${formatTRNumber(set.spend)}" data-field="spend" /></td>
    <td><input type="text" inputmode="decimal" value="${formatTRNumber(set.sales)}" data-field="sales" /></td>
    <td class="set-roas">${roas === "—" ? "—" : "x" + roas}</td>
    <td><button class="row-delete" title="Sil">🗑</button></td>`;

  const roasCell = tr.querySelector(".set-roas");
  tr.querySelectorAll('input[type="text"]').forEach(attachTRNumberInput);
  tr.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", async () => {
      const field = input.dataset.field;
      const value = field === "start_date" ? input.value : parseTRNumber(input.value);
      await supabaseClient.from("creative_sets").update({ [field]: value }).eq("id", set.id);
      const spend = parseTRNumber(tr.querySelector('[data-field="spend"]').value);
      const sales = parseTRNumber(tr.querySelector('[data-field="sales"]').value);
      roasCell.textContent = spend > 0 ? "x" + (sales / spend).toFixed(2) : "—";
    });
  });

  tr.querySelector(".set-badge").addEventListener("click", async () => {
    const nextColor = SET_COLORS[(SET_COLORS.indexOf(set.color) + 1) % SET_COLORS.length];
    set.color = nextColor;
    await supabaseClient.from("creative_sets").update({ color: nextColor }).eq("id", set.id);
    tr.querySelector(".set-badge").className = `set-badge ${nextColor}`;
  });

  tr.querySelector(".row-delete").addEventListener("click", async () => {
    if (!confirm("Bu seti silmek istediğine emin misin?")) return;
    await supabaseClient.from("creative_sets").delete().eq("id", set.id);
    tr.remove();
  });

  tbody.appendChild(tr);
}

async function addSet(creative, tbody) {
  const count = tbody.querySelectorAll("tr").length + 1;
  const { data, error } = await supabaseClient
    .from("creative_sets")
    .insert({
      creative_id: creative.id,
      label: `Set #${count}`,
      color: SET_COLORS[(count - 1) % SET_COLORS.length],
      start_date: todayISO(),
      spend: 0,
      sales: 0,
      sort_order: Date.now(),
    })
    .select()
    .single();

  if (error) {
    showToast("Set eklenemedi.", true);
    return;
  }
  renderSetRow(tbody, creative, data);
}

async function deleteCreative(creative) {
  if (!confirm(`"${creative.title || "Bu kreatif"}" silinsin mi? Tüm setleri de silinir.`)) return;

  await supabaseClient.from("creatives").delete().eq("id", creative.id);

  try {
    const path = decodeURIComponent(creative.media_url.split(`/${CREATIVE_BUCKET}/`)[1]);
    if (path) await supabaseClient.storage.from(CREATIVE_BUCKET).remove([path]);
  } catch (_) {}

  showToast("Kreatif silindi.");
  await loadCreatives();
}

document.getElementById("addCreativeBtn").addEventListener("click", () => {
  if (!currentBrand) return;
  document.getElementById("creativeFileInput").click();
});

document.getElementById("creativeFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !currentBrand) return;

  const mediaType = file.type.startsWith("video") ? "video" : "image";
  const ext = file.name.split(".").pop();
  const path = `${currentBrand.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(CREATIVE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    showToast("Kreatif yüklenemedi.", true);
    return;
  }

  const { data: publicUrlData } = supabaseClient.storage.from(CREATIVE_BUCKET).getPublicUrl(path);

  const { error: insertError } = await supabaseClient.from("creatives").insert({
    brand_id: currentBrand.id,
    title: file.name.replace(/\.[^.]+$/, ""),
    media_type: mediaType,
    media_url: publicUrlData.publicUrl,
    sort_order: Date.now(),
  });

  if (insertError) {
    showToast("Kreatif kaydedilemedi.", true);
    return;
  }

  showToast("Kreatif eklendi.");
  await loadCreatives();
});

// ---------------------------------------------------------------------------
initAuth();
