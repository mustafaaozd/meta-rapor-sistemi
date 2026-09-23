# Meta Raporu

Markalara ait dönem raporlarını Toplam, Meta ve isteğe bağlı Google bölümleriyle paylaşan statik yönetim paneli. Mevcut logo, kanca videosu ve ROAS işlevleri korunur.

## Kullanım

- Marka seç → **Yeni Rapor** → tarih aralığı ve metrikler → **Raporu Kaydet**.
- **Kayıtlı Raporlar** listesinden önceki dönemi aç. Aynı dönemde **Raporu Güncelle** yalnızca seçili kaydı günceller.
- Mevcut raporun tarih aralığını değiştirirsen düğme **Yeni Dönem Olarak Kaydet** olur. Önceki kayıt ve kancaları korunur; yeni döneme video ayrıca eklenir.
- **Toplam**, **Meta** ve **Google** ayrı veri gruplarıdır. Toplamı bağımsız gir: reklam platformları aynı satışı kendilerine atfedebileceği için kanal ciroları otomatik toplanmaz.
- Meta alanları tamamen boşsa müşteriye Meta bölümü gösterilmez. Eski kayıtların toplamları kanallara otomatik dağıtılmaz.
- **Google Ekle** ile Google alanlarını aç, değerlerini gir ve raporu kaydet.
- **Google Verilerini Kaldır** seçili kayıtlı rapordaki Google verisini hemen temizler ve müşteri sayfasından bölümü kaldırır. Toplam, Meta ve diğer dönemler değişmez. Yeni dönem taslağındaysan yalnızca taslağın Google alanları temizlenir.
- **Seçili Rapor Linki** belirli dönemi açar: `rapor/?t=MARKA_TOKENI&r=RAPOR_ID`. Müşteri aynı markanın diğer dönemlerini listeden açabilir. Eski `?t=...` bağlantıları en yeni dönemi açmaya devam eder.
- Video eklemek için raporu önce kaydet. Video üzerinde başlangıç/bitiş işaretle, başlık ve hook rate gir, **Kes ve Yükle** düğmesine bas. Masaüstü Chrome/Edge önerilir.

## İlk kurulum

1. Supabase projesi oluştur.
2. Authentication → Users üzerinden yönetici hesabını oluştur. Kurulum tek mevcut hesabı yönetici olarak yetkilendirir; birden fazla hesap varsa yönetici açıkça seçilmelidir.
3. SQL Editor'da `supabase/schema.sql` dosyasını çalıştır.
4. Storage içinde `hook-videos` ve `brand-logos` public bucketlarını oluştur.
5. `assets/js/supabaseClient.js` içindeki proje adresini ve **publishable** anahtarı ayarla. Secret/service-role anahtarını tarayıcı koduna koyma.
6. Dosyaları GitHub Pages'te `main / (root)` üzerinden yayınla.

## Mevcut sistemi yükseltme

Önce yedek al. Kesintiyi azaltmak için önce `reports` tablosuna nullable `meta_data jsonb` ve `google_data jsonb` sütunlarını ekle. Yeni ön yüzü yayınladıktan sonra `supabase/upgrade_report_archive.sql` dosyasını uygula. Uygulama içindeki hiçbir toplam değer veya kanca kaydı değişmez.

Günlük modül kaldırılmıştır. Eski günlük tablolar `retired_daily` şemasına taşınır ve istemci erişimleri kaldırılır. Eski günlük medya dosyaları geri dönüş için saklanır; günlük medya listeleme/yükleme politikaları kaldırılır. Bilinen eski public medya URL'leri için public bucket davranışı devam eder.

## Erişim modeli

- Anonim istekler yalnızca `x-report-token` başlığındaki tokenla eşleşen markayı, onun raporlarını ve kancalarını okuyabilir. Token yoksa veya yanlışsa veri dönmez.
- Yazma ve medya yönetimi yalnızca `private.report_admins` listesinde bulunan hesaba açıktır. Yeni bir hesabın sadece giriş yapabilmesi yönetici yetkisi vermez.
- Müşteri tokenı paylaşım anahtarıdır; bu bağlantıya sahip kişi markanın rapor arşivini okuyabilir. Müşteri istemcisi yönetici oturumunu kullanmaz.
- Logo/kanca bucketları mevcut davranışı korumak için public kalır. Bilinen medya URL'leri açılır; anonim dosya listeleme kapalıdır.
- Günlük arşiv ve yönetici listesi Data API'ye açık olmayan şemalardadır.

## Doğrulama

`tests/browser.cjs`, Playwright ve kurulu Microsoft Edge ile tarayıcı akışlarını izole test verileri üzerinde doğrular; canlı veriye yazmaz.

```sh
node tests/browser.cjs
```

Playwright kurulu değilse yükle; paket farklı konumdaysa `PLAYWRIGHT_PATH` ortam değişkenini ayarla. `supabase/tests/access.sql` dosyası erişim ve yazma kontrollerini bir işlem içinde test eder ve sonunda geri alır.
