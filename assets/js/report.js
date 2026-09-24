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

function formatDateRange(startIso, endIso) {
  if (!startIso) return "—";
  if (!endIso || endIso === startIso) return formatDate(startIso);
  const start = new Date(startIso + "T00:00:00");
  const end = new Date(endIso + "T00:00:00");
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startFmt = sameMonth
    ? new Intl.DateTimeFormat("tr-TR", { day: "2-digit" }).format(start)
    : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long" }).format(start);
  const endFmt = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric" }).format(end);
  return `${startFmt} – ${endFmt}`;
}


let client;
let currentBrand;
let archive = [];
let reportRequest = 0;

async function init() {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("t");
    if (!token || !/^[a-f0-9]{32}$/i.test(token)) return showError();
    client = createReportClient(token);
    const { data: brand, error: brandError } = await client.from("brands")
      .select("id,name,logo_url").eq("access_token", token).maybeSingle();
    if (brandError || !brand) return showError();
    currentBrand = brand;
    const { data, error } = await client.from("reports").select("*").eq("brand_id", brand.id)
      .order("report_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false });
    if (error) return showError();
    archive = data || [];
    const select = document.getElementById("reportSelect");
    select.replaceChildren();
    archive.forEach(report => {
      const option = document.createElement("option");
      option.value = report.id;
      option.textContent = formatDateRange(report.report_date, report.report_date_end);
      select.appendChild(option);
    });
    select.disabled = !archive.length;
    const requestedId = params.get("r");
    const report = requestedId ? archive.find(r => r.id === requestedId) : archive[0];
    if (requestedId && !report) return showError();
    select.addEventListener("change", () => {
      const next = archive.find(r => r.id === select.value);
      const url = new URL(window.location.href);
      url.searchParams.set("r", next.id);
      window.history.replaceState(null, "", url);
      showReport(next);
    });
    await showReport(report || null);
  } catch (_) { showError(); }
}

async function showReport(report) {
  const request = ++reportRequest;
  document.getElementById("loadingState").style.display = "flex";
  document.getElementById("errorState").style.display = "none";
  document.getElementById("reportRoot").style.display = "none";
  try {
    let videos = [];
    if (report) {
      const { data, error } = await client.from("videos").select("*")
        .eq("report_id", report.id).order("sort_order", { ascending: true });
      if (error) throw error;
      videos = data || [];
      document.getElementById("reportSelect").value = report.id;
    }
    if (request !== reportRequest) return;
    render(currentBrand, report, videos);
  } catch (_) { if (request === reportRequest) showError(); }
}

function showError() {
  document.getElementById("reportRoot").style.display = "none";
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
    const img = document.createElement("img");
    img.src = brand.logo_url;
    img.alt = `${brand.name} logo`;
    logoEl.replaceChildren(img);
  }

  document.getElementById("reportDate").textContent = report ? formatDateRange(report.report_date, report.report_date_end) : "—";

  const adSpend = report ? report.ad_spend : 0;
  const revenue = report ? report.revenue : 0;
  const roas = adSpend > 0 ? revenue / adSpend : null;

  document.getElementById("mAdSpend").textContent = formatCurrency(adSpend);
  document.getElementById("mRevenue").textContent = formatCurrency(revenue);
  document.getElementById("mRoas").textContent = roas === null ? "—" : `x${roas.toFixed(2)}`;
  document.getElementById("mAddToCart").textContent = report ? report.add_to_cart : 0;
  document.getElementById("mCheckout").textContent = report ? report.checkout_started : 0;
  document.getElementById("mOrders").textContent = report ? report.total_orders : 0;

  renderChannel("meta", report && report.meta_data);
  renderChannel("google", report && report.google_data);
  renderHooks(videos);
}

function renderChannel(prefix, data) {
  const section = document.getElementById(prefix + "Section");
  section.hidden = !data;
  if (!data) return;
  const fields = { AdSpend: "ad_spend", Revenue: "revenue", AddToCart: "add_to_cart", Checkout: "checkout_started", Orders: "total_orders" };
  Object.entries(fields).forEach(([suffix, key]) => {
    document.getElementById(prefix + suffix).textContent = formatCurrency(data[key]);
  });
  document.getElementById(prefix + "Roas").textContent = data.ad_spend > 0 ? `x${(data.revenue / data.ad_spend).toFixed(2)}` : "—";
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
