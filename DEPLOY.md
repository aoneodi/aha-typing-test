# Deploy

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
