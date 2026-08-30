// ============================================================================
// GÜNLÜK RAPOR SAYFASI (müşteri, salt okunur)
// ============================================================================

function formatCurrency(n) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n || 0);
}

function formatDateShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(d);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("t");

  if (!token) return showError();

  const { data: brand, error: brandError } = await supabaseClient
    .from("brands")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();

  if (brandError || !brand) return showError();

  const [{ data: entries }, { data: creatives }] = await Promise.all([
    supabaseClient
      .from("daily_entries")
      .select("*")
      .eq("brand_id", brand.id)
      .order("entry_date", { ascending: false }),
    supabaseClient
      .from("creatives")
      .select("*, creative_sets(*)")
      .eq("brand_id", brand.id)
      .order("sort_order", { ascending: true }),
  ]);

  render(brand, entries || [], creatives || []);
}

function showError() {
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("errorState").style.display = "flex";
}

function render(brand, entries, creatives) {
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("reportRoot").style.display = "block";

  document.getElementById("brandName").textContent = brand.name;
  document.title = `${brand.name} — Günlük Performans Raporu`;

  const logoEl = document.getElementById("brandLogo");
  if (brand.logo_url) logoEl.innerHTML = `<img src="${brand.logo_url}" alt="${brand.name} logo" />`;

  document.getElementById("dayCount").textContent = `${entries.length} gün`;

  const totalSpend = entries.reduce((s, e) => s + Number(e.ad_spend || 0), 0);
  const totalRevenue = entries.reduce((s, e) => s + Number(e.revenue || 0), 0);
  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : null;

  document.getElementById("mTotalSpend").textContent = formatCurrency(totalSpend);
  document.getElementById("mTotalRevenue").textContent = formatCurrency(totalRevenue);
  document.getElementById("mAvgRoas").textContent = avgRoas === null ? "—" : `x${avgRoas.toFixed(2)}`;

  renderDailyTable(entries);
  renderCreatives(creatives);
}

function renderDailyTable(entries) {
  const body = document.getElementById("dailyTableBody");
  const empty = document.getElementById("dailyEmpty");
  const table = document.getElementById("dailyTable");

  if (!entries.length) {
    table.style.display = "none";
    empty.style.display = "block";
    return;
  }

  body.innerHTML = entries
    .map((e) => {
      const roas = e.ad_spend > 0 ? (e.revenue / e.ad_spend).toFixed(2) : null;
      return `<tr>
        <td>${formatDateShort(e.entry_date)}</td>
        <td>₺${formatCurrency(e.ad_spend)}</td>
        <td>₺${formatCurrency(e.revenue)}</td>
        <td class="roas-cell">${roas ? "x" + roas : "—"}</td>
      </tr>`;
    })
    .join("");
}

function renderCreatives(creatives) {
  const list = document.getElementById("creativeList");
  if (!creatives.length) {
    list.innerHTML = `<div class="hooks-empty">Henüz kreatif eklenmedi.</div>`;
    return;
  }

  list.innerHTML = creatives
    .map((c) => {
      const mediaTag =
        c.media_type === "video"
          ? `<video src="${c.media_url}" controls playsinline preload="metadata"></video>`
          : `<img src="${c.media_url}" alt="" />`;

      const sets = (c.creative_sets || []).sort((a, b) => a.sort_order - b.sort_order);
      const rows = sets
        .map((s) => {
          const roas = s.spend > 0 ? (s.sales / s.spend).toFixed(2) : null;
          return `<tr>
            <td><span class="set-badge ${s.color}">${escapeHtml(s.label)}</span></td>
            <td>${formatDateShort(s.start_date)}</td>
            <td>₺${formatCurrency(s.spend)}</td>
            <td>${formatCurrency(s.sales)}</td>
            <td class="roas-cell">${roas ? "x" + roas : "—"}</td>
          </tr>`;
        })
        .join("");

      return `<div class="creative-view-card">
        <div class="creative-view-top">
          <div class="creative-view-media">${mediaTag}</div>
          <div class="creative-view-title">${escapeHtml(c.title || "Başlıksız")}</div>
        </div>
        ${
          sets.length
            ? `<div class="creative-view-sets">
                <table>
                  <thead><tr><th>Set</th><th>Tarih</th><th>Harcama</th><th>Satış</th><th>ROAS</th></tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>`
            : ""
        }
      </div>`;
    })
    .join("");
}

init();
