# Meta Raporu — Kurulum Rehberi

Kod bilmene gerek yok, aşağıdaki adımları sırayla takip et. Toplam kurulum ~20 dakika sürer ve **bir kere** yapılır. Sonrasında her ay sadece panelden veri gireceksin.

---

## 1) Supabase hesabı aç (ücretsiz veritabanı + video depolama)

1. https://supabase.com adresine git, **"Start your project"** ile GitHub veya e-posta ile ücretsiz kaydol.
2. **"New project"** de, bir isim ver (örn. `meta-rapor`), bir veritabanı şifresi belirle (bir yere not al) ve bölge olarak Avrupa'ya yakın bir yer seç (örn. `Frankfurt`).
3. Proje birkaç dakikada hazır olacak.

## 2) Veritabanı tablolarını oluştur

1. Sol menüden **SQL Editor**'a tıkla.
2. **"New query"** de.
3. Bu projedeki `supabase/schema.sql` dosyasının **tüm içeriğini** kopyala, oraya yapıştır.
4. Sağ alttaki **RUN** butonuna bas. "Success" yazısını görmelisin.

## 3) Video/logo depolama alanlarını (bucket) oluştur

1. Sol menüden **Storage**'a tıkla.
2. **"New bucket"** → isim: `hook-videos` → **Public bucket** seçeneğini AÇIK yap → oluştur.
3. Tekrar **"New bucket"** → isim: `brand-logos` → **Public bucket** AÇIK → oluştur.
   (Bucket isimlerini birebir bu şekilde yazmazsan sistem çalışmaz.)

## 4) Kendi admin hesabını oluştur

1. Sol menüden **Authentication** → **Users**'a tıkla.
2. **"Add user"** → **"Create new user"**.
3. Kendi e-postanı ve bir şifre belirle → **"Auto Confirm User"** kutucuğunu işaretle → oluştur.
4. Bu e-posta/şifre ile panele (`index.html`) giriş yapacaksın.

## 5) Bağlantı bilgilerini projeye ekle

1. Sol menüden **Project Settings** (dişli ikonu) → **API**.
2. **Project URL** ve **anon public** anahtarını kopyala.
3. Bu projedeki `assets/js/supabaseClient.js` dosyasını aç:
   - `BURAYA_SUPABASE_PROJECT_URL` yazan yeri **Project URL** ile değiştir.
   - `BURAYA_SUPABASE_ANON_KEY` yazan yeri **anon public** anahtar ile değiştir.
4. Dosyayı kaydet.

## 6) GitHub'a yükle ve yayınla (GitHub Pages)

1. https://github.com üzerinde yeni bir **repository** oluştur (örn. `meta-rapor`), **Public** veya **Private** olabilir.
2. Bu proje klasöründeki tüm dosyaları o repository'ye yükle (GitHub'ın web arayüzünden "Add file → Upload files" ile sürükle-bırak yapabilirsin, komut satırına gerek yok).
3. Repository içinde **Settings → Pages**'e git.
4. **Branch**: `main`, klasör: `/ (root)` seç → **Save**.
5. Birkaç dakika içinde şu formatta bir link aktif olur:
   `https://kullaniciadin.github.io/meta-rapor/`
6. Bu link senin **admin panelin** olur (`index.html`). Müşteri raporu ise panelden kopyalayacağın özel linkle (`.../rapor/?t=...`) açılır.

---

## Kullanım

- **Panele giriş:** yayınladığın ana link → e-posta/şifre ile giriş.
- **Marka ekleme:** sol panelden "Ekle".
- **Aylık veri girme:** marka seç → sayıları gir → "Raporu Kaydet". ROAS otomatik hesaplanır.
- **Video ekleme:** "Video Ekle" → cihazından bir video seç → açılan pencerede kaydırıcılarla 3-4 saniyelik kancayı seç → başlık ve hook rate gir → "Kes ve Yükle".
- **Müşteriyle paylaşma:** sol panelde markayı seçtiğinde çıkan "Müşteri Linki" kutusundan "Kopyala" de, bu linki müşteriye gönder. Müşteri bu linkle şifresiz, direkt raporu görür ve hiçbir şey düzenleyemez.

## Önemli notlar

- **Video kesme özelliği** (tarayıcı içi kırpma) en sorunsuz **Chrome veya Edge** masaüstünde çalışır. Bu özelliği sadece sen (admin) kullanacağın için sorun olmaz.
- Her marka için sistem otomatik olarak "en son tarihli" raporu müşteriye gösterir — yani her ay aynı markada "Raporu Kaydet" dediğinde en güncel ay görünür. İstersen her ay için ayrı tarih seçip yeni kayıt da oluşturabilirsin, geçmiş aylar veritabanında saklı kalır.
- Ücretsiz Supabase planı bu kullanım için (birkaç müşteri, aylık birkaç video) fazlasıyla yeterlidir.
