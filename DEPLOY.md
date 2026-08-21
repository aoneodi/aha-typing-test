# Deploy

## Yang sekarang jalan

**<https://aha-typing-test-45tyczfska-et.a.run.app>**

| | |
|---|---|
| Layanan | Cloud Run `aha-typing-test`, region `asia-southeast2` |
| Project | `fbi-dev-484410` |
| Image | `asia-southeast2-docker.pkg.dev/fbi-dev-484410/cloud-run-source-deploy/aha-typing-test` |
| Service account | `aha-typing-test-run@fbi-dev-484410.iam.gserviceaccount.com` |
| Basis data | `gs://aha-typing-test-data-484410/typing.sqlite` |
| Akses | publik (`allUsers` → `run.invoker`), tanpa login |
| Skala | `maxInstanceCount: 1` — **jangan dinaikkan**, lihat bagian di bawah |

> **Layanan ini dideploy dengan tangan dan TIDAK tercatat di OpenTofu.** Project
> `fbi-dev-484410` berisi COMS produksi yang dikelola tofu, jadi siapa pun yang
> menjalankan `tofu plan` di sana akan melihat layanan ini sebagai sesuatu yang
> tidak dikenal. Kalau ini jadi permanen, daftarkan ke IaC-nya. Labelnya sudah
> ditandai `managed-by=manual` supaya ketahuan asalnya.

Service account-nya sengaja dibuat khusus dan hanya diberi `objectAdmin` **pada
satu bucket itu** — bukan SA compute bawaan, yang di banyak project punya hak
Editor ke seluruh isi project.

### Perbarui versi yang jalan

```bash
# 1. kirim sumber (hanya berkas yang dilacak git)
git archive --format=tar.gz -o /tmp/source.tgz HEAD
gcloud storage cp /tmp/source.tgz gs://aha-typing-test-data-484410/build/source.tgz

# 2. bangun image
gcloud builds submit --no-source \
  --substitutions=_IMG=asia-southeast2-docker.pkg.dev/fbi-dev-484410/cloud-run-source-deploy/aha-typing-test:v2 \
  --config=- <<'YAML'
steps:
  - name: gcr.io/cloud-builders/docker
    args: ['build', '-t', '$_IMG', '.']
images: ['$_IMG']
options: { logging: CLOUD_LOGGING_ONLY }
YAML

# 3. arahkan layanan ke image baru
gcloud run deploy aha-typing-test --region=asia-southeast2 \
  --image=asia-southeast2-docker.pkg.dev/fbi-dev-484410/cloud-run-source-deploy/aha-typing-test:v2
```

Perlu `gcloud auth login` yang masih hidup. Kalau CLI-nya terkunci reauth,
semuanya bisa dikerjakan lewat REST memakai token
`gcloud auth application-default print-access-token`.

### Kalau papan perlu dikosongkan atau diisi ulang

Basis datanya satu objek di Cloud Storage, jadi kelola dari sana:

```bash
# ambil yang sekarang
gcloud storage cp gs://aha-typing-test-data-484410/typing.sqlite /tmp/now.sqlite

# siapkan yang baru secara lokal, lalu naikkan
TYPING_DB=/tmp/baru.sqlite bun run seed:dummy
gcloud storage cp /tmp/baru.sqlite gs://aha-typing-test-data-484410/typing.sqlite
```

Instance yang sedang jalan sudah memegang salinannya di memori, jadi paksa
instance baru supaya membaca objek itu:

```bash
gcloud run services update aha-typing-test --region=asia-southeast2 \
  --update-annotations=reload=$(date +%s)
```

**Sebelum tes bulanan yang sungguhan, kosongkan data contohnya** — sekarang
papan yang live masih berisi 13 nama karangan.

## Satu hal yang menentukan segalanya

Papan peringkat disimpan di **satu berkas SQLite**. Itu pilihan yang bagus untuk
alat sekali sebulan — tanpa Postgres, tanpa biaya, tanpa yang perlu dijaga — tapi
akibatnya dua:

1. **Harus satu instance.** Dua instance = dua berkas basis data yang berbeda,
   dan papan peringkat jadi bergantung siapa yang kebetulan melayani. Selalu
   `--max-instances=1`.
2. **Butuh penyimpanan yang awet.** Cakram Cloud Run itu hanya di memori: begitu
   instance mati (dan dia mati sendiri saat sepi), semua hasil tes ikut hilang.
   Papan peringkat yang mengosongkan diri adalah kegagalan total untuk aplikasi
   ini, jadi ini bukan detail teknis yang bisa ditunda.

Pilih **satu** dari ini sebelum dipakai untuk tes bulanan yang sungguhan.

## Pilihan A — host dengan cakram sungguhan (paling cocok)

Fly.io, Render, atau Railway memberi volume yang benar-benar awet, dan
`bun:sqlite` jalan di atasnya tanpa perubahan kode sama sekali.

Fly.io, misalnya:

```bash
fly launch --no-deploy            # buat aplikasi, jangan langsung deploy
fly volumes create data --size 1  # 1 GB sudah kelewat cukup
fly secrets set TYPING_DB=/data/typing.sqlite
fly deploy
```

Pastikan `fly.toml` memasang volume itu ke `/data` dan menahan jumlah mesin di
satu. Perlu login akun Fly lebih dulu (`fly auth login`) — itu harus dilakukan
pemilik akun, bukan lewat sesi ini.

## Pilihan B — Cloud Run (kalau memang harus di GCP)

Cloud Run **tidak punya cakram awet**. Supaya SQLite tetap hidup, dua jalan:

- **Cloud SQL (Postgres) + ganti lapisan penyimpanan.** Paling tahan lama,
  tapi berarti menulis ulang `server/db.ts` dan menambah biaya bulanan.
- **Cadangkan berkas SQLite ke Cloud Storage** — pulihkan saat start, unggah
  sesudah tiap tulis. Beban tulisnya beberapa kali sebulan, jadi ini murah dan
  sederhana; tetap butuh `--max-instances=1`.

Jangan pasang bucket Cloud Storage sebagai volume lalu menaruh SQLite di sana:
Google sendiri menyatakan SQLite tidak didukung di atas GCS FUSE, dan berkasnya
bisa rusak, bukan cuma lambat.

Kalau layanannya masuk project yang dikelola OpenTofu (mis. `fbi-dev-484410`,
tempat COMS produksi tinggal), **daftarkan di IaC-nya**, jangan deploy dengan
tangan — layanan hasil `gcloud run deploy` tidak akan terlihat oleh tofu dan
akan jadi kejutan bagi yang mengurus project itu.

## Pilihan C — untuk pamer hari ini saja

Tidak perlu host, tidak perlu akun: jalankan lokal, lalu buka satu terowongan
publik sementara.

```bash
bun run start                              # jendela 1
ssh -R 80:localhost:3210 nokey@localhost.run   # jendela 2, kasih URL publik
```

URL-nya hidup selama kedua perintah itu jalan dan mati begitu laptop tidur.
Cukup untuk rapat, **tidak** cukup untuk tes bulanan. Perlu diingat juga
tautannya bisa dibuka siapa pun yang punya URL-nya, dan aplikasi ini tanpa login.

## Yang belum ada di mana pun

Tanpa login, siapa pun yang punya tautannya bisa mengetik nama siapa pun. Untuk
acara internal itu tidak masalah; kalau nanti hasilnya dipakai untuk sesuatu yang
serius, pasang login Google akun AHA di depan lebih dulu.
