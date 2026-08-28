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
  const r = parseFloat(revenue) || 0;
  const s = parseFloat(spend) || 0;
  if (s <= 0) return null;
  return r / s;
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

  const shareBox = document.getElementById("shareBox");
  shareBox.style.display = "block";
  const link = `${window.location.origin}${window.location.pathname.replace(/index\.html$/, "")}rapor/?t=${currentBrand.access_token}`;
  document.getElementById("shareLinkText").textContent = link;
  document.getElementById("copyLinkBtn").onclick = () => {
    navigator.clipboard.writeText(link);
    showToast("Link kopyalandı.");
  };

  await loadOrCreateReport();
}

// ---------------------------------------------------------------------------
// RAPOR (metrikler)
// ---------------------------------------------------------------------------

async function loadOrCreateReport() {
  document.getElementById("reportDate").value = todayISO();

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
    document.getElementById("reportDate").value = data.report_date;
    document.getElementById("fAdSpend").value = data.ad_spend;
    document.getElementById("fRevenue").value = data.revenue;
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
    report_date: document.getElementById("reportDate").value || todayISO(),
    ad_spend: parseFloat(document.getElementById("fAdSpend").value) || 0,
    revenue: parseFloat(document.getElementById("fRevenue").value) || 0,
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
initAuth();
