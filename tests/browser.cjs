const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const token = 'a'.repeat(32);
const metrics = { ad_spend: 1000, revenue: 5000, add_to_cart: 20, checkout_started: 12, total_orders: 10 };
const fixture = {
  brands: [{id:'brand-a', name:'Örnek Marka', access_token:token}],
  reports: [{id:'august',brand_id:'brand-a',report_date:'2026-08-01',report_date_end:'2026-08-31',created_at:'2026-09-01',...metrics,meta_data:{...metrics},google_data:{...metrics,ad_spend:500,revenue:1000}}],
  videos: [{id:'video-a',report_id:'august',title:'Eski raporun kancası',video_url:'',sort_order:0}]
};
function mockSDK() {
  window.supabase = { createClient(url,key,options) {
    if (options) window.customerHeaders = options.global.headers;
    return {
      auth: { getSession:async()=>({data:{session:{user:{id:'admin'}}}}),onAuthStateChange:()=>{},signOut:async()=>{},signInWithPassword:async()=>({}) },
      from(table) {
        let action='read',payload,filters=[],sorts=[],single=false;
        const q={
          select(){return q},eq(k,v){filters.push([k,v]);return q},order(k,o){sorts.push([k,o]);return q},limit(){return q},
          maybeSingle(){single=true;return q},single(){single=true;return q},
          insert(p){action='insert';payload=p;return q},update(p){action='update';payload=p;return q},delete(){action='delete';return q},
          then(resolve,reject){return Promise.resolve().then(()=>{
            if(window.failNext){window.failNext=false;return {data:null,error:{message:'Test failure'}}}
            const db=window.testDB;
            let rows=db[table].filter(r=>filters.every(([k,v])=>r[k]===v));
            if(action==='insert'){const row={id:crypto.randomUUID(),created_at:new Date().toISOString(),...payload};db[table].push(row);rows=[row]}
            if(action==='update')rows.forEach(r=>Object.assign(r,payload));
            if(action==='delete')db[table]=db[table].filter(r=>!rows.includes(r));
            rows.sort((a,b)=>{for(const [k,o] of sorts){const d=String(a[k]).localeCompare(String(b[k]));if(d)return o.ascending?d:-d}return 0});
            return {data:single?(rows[0]||null):structuredClone(rows),error:null};
          }).then(resolve,reject)}
        };return q;
      }
    };
  }};
}
const server=http.createServer((req,res)=>{
  let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name.endsWith('/'))name+='index.html';
  const file=path.join(root,name);
  if(!file.startsWith(root))return res.end();
  fs.readFile(file,(err,data)=>{
    if(err){res.statusCode=404;return res.end()}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data);
  });
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'text/javascript',body:`(${mockSDK.toString()})();`}));
    await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:''}));
    await context.addInitScript(data=>{window.testDB=data},fixture);
    const page=await context.newPage(); const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',d=>d.accept());
    await page.goto(base);await page.locator('#saveReportBtn:not([disabled])').waitFor();
    assert.equal(await page.locator('#reportSelect').inputValue(),'august');
    assert.equal(await page.getByText('Günlük Rapor',{exact:true}).count(),0);
    await page.locator('#newReportBtn').click();
    await page.locator('#reportDateStart').fill('2026-09-01');
    await page.locator('#reportDateEnd').fill('2026-09-30');
    for(const [prefix,spend,revenue] of [['f','2000','9000'],['meta','1500','7000']]){
      await page.locator('#'+prefix+'AdSpend').fill(spend);await page.locator('#'+prefix+'Revenue').fill(revenue);
    }
    await page.locator('#toggleGoogleBtn').click();
    await page.locator('#gAdSpend').fill('500');await page.locator('#gRevenue').fill('2000');
    await page.locator('#saveReportBtn').click();await page.getByText('Kaydedildi ✓',{exact:true}).waitFor();
    let db=await page.evaluate(()=>testDB);
    assert.equal(db.reports.length,2);assert.equal(db.reports[0].revenue,5000);assert.equal(db.videos[0].report_id,'august');
    const september=db.reports[1];assert.equal(september.meta_data.revenue,7000);assert.equal(september.google_data.revenue,2000);
    assert.ok((await page.locator('#shareLinkText').textContent()).includes('r='+september.id));
    // Aynı kaydı düzenlemek yeni dönem oluşturmaz.
    await page.locator('#fRevenue').fill('9500');await page.locator('#saveReportBtn').click();await page.getByText('Kaydedildi ✓',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>testDB.reports.length),2);
    // Güncelleme hatası taslağı korur.
    await page.locator('#fRevenue').fill('9600');await page.evaluate(()=>window.failNext=true);await page.locator('#saveReportBtn').click();
    await page.getByText('Kaydedilemedi. Veriler ekranda duruyor; tekrar deneyebilirsin.',{exact:true}).waitFor();
    assert.equal(await page.locator('#fRevenue').inputValue(),'9.600');
    await page.locator('#reportSelect').selectOption('august');
    await page.locator('#saveReportBtn:not([disabled])').waitFor();
    assert.equal(await page.locator('#fRevenue').inputValue(),'5.000');
    // Dönem değişmişken Google kaldırmak önceki dönemi temizlememeli.
    await page.locator('#reportDateStart').fill('2026-10-01');await page.locator('#reportDateEnd').fill('2026-10-31');
    await page.locator('#toggleGoogleBtn').click();
    assert.ok(await page.evaluate(()=>testDB.reports[0].google_data));
    await page.locator('#saveReportBtn').click();await page.getByText('Kaydedildi ✓',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>testDB.reports.length),3);
    // Google tek tıkla yalnızca seçili rapordan temizlenir.
    await page.locator('#reportSelect').selectOption(september.id);await page.locator('#saveReportBtn:not([disabled])').waitFor();
    await page.locator('#toggleGoogleBtn').click();
    await page.waitForFunction(()=>testDB.reports.find(r=>r.report_date==='2026-09-01').google_data===null);
    assert.equal(await page.locator('#googleFields').isVisible(),false);
    assert.ok(await page.evaluate(()=>testDB.reports[0].google_data));
    // Aynı dönem için ikinci kayıt engellenir.
    await page.locator('#newReportBtn').click();await page.locator('#reportDateStart').fill('2026-08-01');await page.locator('#reportDateEnd').fill('2026-08-31');
    await page.locator('#saveReportBtn').click();await page.getByText('Bu dönem zaten kayıtlı. Kayıtlı Raporlar listesinden açıp düzenleyebilirsin.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>testDB.reports.length),3);
    await page.locator('#reportSelect').selectOption('august');await page.locator('#saveReportBtn:not([disabled])').waitFor();
    await page.screenshot({path:path.join(root,'../admin-desktop.png'),fullPage:true,animations:'disabled'});
    db=await page.evaluate(()=>testDB);
    const customer=await context.newPage();customer.on('pageerror',e=>errors.push(e.message));
    await customer.addInitScript(data=>{window.testDB=data},db);
    await customer.goto(base+'/rapor/?t='+token+'&r=august');await customer.locator('#reportRoot').waitFor();
    assert.equal(await customer.locator('#mRevenue').textContent(),'5.000');
    assert.equal(await customer.locator('#metaSection').isVisible(),true);assert.equal(await customer.locator('#googleSection').isVisible(),true);
    assert.equal(await customer.evaluate(()=>customerHeaders['x-report-token']),token);
    await customer.screenshot({path:path.join(root,'../report-desktop.png'),fullPage:true,animations:'disabled'});
    await customer.locator('#reportSelect').selectOption(september.id);await customer.locator('#reportRoot').waitFor();
    assert.equal(await customer.locator('#googleSection').isVisible(),false);
    assert.equal(await customer.locator('#metaRevenue').textContent(),'7.000');
    await customer.setViewportSize({width:390,height:844});await customer.screenshot({path:path.join(root,'../report-mobile.png'),fullPage:true,animations:'disabled'});
    assert.equal(await customer.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'../admin-mobile.png'),fullPage:true,animations:'disabled'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await customer.goto(base+'/rapor/?t='+token+'&r=not-this-brand');await customer.locator('#errorState').waitFor();
    assert.equal(await customer.locator('#reportRoot').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: arşiv, yeni dönem, güncelleme, hata koruması, tek tık Google kaldırma, kanal verileri, sabit link, müşteri arşivi, mobil taşma ve JS hataları');
  } finally { await browser.close();server.close(); }
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
