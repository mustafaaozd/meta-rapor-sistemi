// ============================================================================
// MÜŞTERİ RAPOR SAYFASI
// URL'deki ?t=TOKEN parametresi ile markayı bulur, en güncel raporu ve
// kanca videolarını çeker, salt-okunur olarak gösterir.
// ============================================================================

function formatCurrency(n) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n || 0);
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric" }).format(d);
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("t");

  if (!token) {
    showError();
    return;
  }

  const { data: brand, error: brandError } = await supabaseClient
    .from("brands")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();

  if (brandError || !brand) {
    showError();
    return;
  }

  const { data: report, error: reportError } = await supabaseClient
    .from("reports")
    .select("*")
    .eq("brand_id", brand.id)
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reportError) {
    showError();
    return;
  }

  let videos = [];
  if (report) {
    const { data: videoData } = await supabaseClient
      .from("videos")
      .select("*")
      .eq("report_id", report.id)
      .order("sort_order", { ascending: true });
    videos = videoData || [];
  }

  render(brand, report, videos);
}

function showError() {
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("errorState").style.display = "flex";
}

function render(brand, report, videos) {
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("reportRoot").style.display = "block";

  document.getElementById("brandName").textContent = brand.name;
  document.title = `${brand.name} — Performans Raporu`;

  const logoEl = document.getElementById("brandLogo");
  if (brand.logo_url) {
    logoEl.innerHTML = `<img src="${brand.logo_url}" alt="${brand.name} logo" />`;
  }

  document.getElementById("reportDate").textContent = report ? formatDate(report.report_date) : "—";

  const adSpend = report ? report.ad_spend : 0;
  const revenue = report ? report.revenue : 0;
  const roas = adSpend > 0 ? revenue / adSpend : null;

  document.getElementById("mAdSpend").textContent = formatCurrency(adSpend);
  document.getElementById("mRevenue").textContent = formatCurrency(revenue);
  document.getElementById("mRoas").textContent = roas === null ? "—" : `x${roas.toFixed(2)}`;
  document.getElementById("mAddToCart").textContent = report ? report.add_to_cart : 0;
  document.getElementById("mCheckout").textContent = report ? report.checkout_started : 0;
  document.getElementById("mOrders").textContent = report ? report.total_orders : 0;

  renderHooks(videos);
}

function renderHooks(videos) {
  const grid = document.getElementById("hooksGrid");
  if (!videos.length) {
    grid.innerHTML = `<div class="hooks-empty">Bu aya ait kanca videosu henüz eklenmedi.</div>`;
    return;
  }

  grid.innerHTML = "";
  videos.forEach((v) => {
    const card = document.createElement("div");
    card.className = "hook-card";

    card.innerHTML = `
      <div class="hook-card__media">
        <video src="${v.video_url}" controls playsinline preload="metadata"></video>
      </div>
      <div class="hook-card__body">
        <p class="hook-card__title">${escapeHtml(v.title || "Başlıksız")}</p>
        ${v.hook_rate != null ? `
        <div class="hook-card__stat">
          <span class="hook-card__stat-label">Hook Rate</span>
          <span class="hook-card__stat-value">%${v.hook_rate}</span>
        </div>` : ""}
      </div>`;
    grid.appendChild(card);
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

init();
