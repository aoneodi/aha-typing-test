# Tes Ngetik AHA

Pengganti ngetikmaya.id untuk tes ngetik bulanan anak-anak AHA, dengan papan
peringkat yang tersimpan sendiri.

Berdiri sendiri — tidak ada kaitannya dengan repo `aha-coms`. Yang dipakai cuma
Bun; tidak ada Postgres, tidak ada layanan luar, tidak ada login.

## Jalankan

```bash
bun install
bun run dev
```

Buka <http://localhost:3210>. Untuk dipakai beneran (tanpa pemuatan ulang otomatis):

```bash
bun run start
```

Ganti port dengan `PORT=8080 bun run start`.

## Cara pakai tiap bulan

Tidak ada yang perlu disiapkan. Periode berjalan sendiri dari tanggal: percobaan
bulan Agustus masuk papan "Agustus 2026", bulan depan papannya berganti sendiri
dan yang lama pindah ke arsip. Bulan ditentukan menurut **WIB**, jadi yang
mengetik jam 23.30 tanggal 31 tetap masuk bulan itu.

1. Sebarkan alamatnya ke peserta.
2. Peserta isi nama + divisi sekali; peramban mengingatnya untuk bulan-bulan berikutnya.
3. Ketik 60 detik. Boleh mencoba berkali-kali — **yang masuk papan hasil terbaiknya**.
4. Buka tab "Papan Peringkat" saat pengumuman.

Ada **mode latihan** (kotak centang di atas tes): hasilnya tidak dicatat sama sekali.

## Aturan skornya

- **WPM** = huruf yang **benar** ÷ 5 ÷ menit. Huruf salah tidak menambah apa-apa.
  Spasi dihitung satu huruf, dan hanya benar kalau katanya diketik utuh dan tepat.
- **WPM kotor** menghitung semua yang diketuk, benar maupun salah — selisihnya dengan
  WPM bersih adalah ongkos salah ketik.
- **Akurasi** = ketukan benar ÷ seluruh ketukan. Backspace tidak dihitung ketukan,
  jadi membetulkan salah ketik hanya memakan waktu, bukan menghukum akurasi.
- **Kestabilan** = seberapa rata kecepatan dari detik ke detik.
- Kata tidak bisa diulang mundur setelah ditekan spasi, sama seperti ngetikmaya.

Aturannya ada di satu berkas, [`src/lib/engine.ts`](src/lib/engine.ts), dan berkas
itu dipakai browser **dan** server. Jadi angka di layar peserta dan angka di papan
peringkat tidak mungkin beda.

## Soal curang

Ini alat internal, bukan ujian bersertifikat. Yang ada:

- Tempel teks dimatikan.
- Server **menghitung ulang** skor dari `seed` + apa yang diketik. Kata disusun
  ulang di server, jadi browser tidak bisa mengarang kata pendek atau mengirim
  "WPM saya 300".
- Angka di luar nalar (di atas 200 wpm, atau ketukan lebih sedikit dari huruf yang
  benar) ditandai `flagged` di basis data — tetap masuk papan, tapi bisa ditinjau.

Yang **tidak** ada: tanpa login, siapa pun bisa mengetik nama siapa pun. Kalau
suatu saat perlu lebih ketat, yang paling murah adalah menempelkan login Google
akun AHA di depan.

## Datanya

Satu berkas SQLite di `data/typing.sqlite` — tidak masuk git. Salin berkas itu
untuk cadangan; hapus untuk mengosongkan papan.

```bash
# lihat isinya
bun run report            # periode berjalan
bun run report 2026-07    # bulan tertentu
bun run report all        # sepanjang masa

# kosongkan semuanya (tidak bisa dibatalkan)
rm -rf data/
```

### Data contoh

Papan yang kosong susah dinilai, jadi ada 22 percobaan contoh (14 orang di bulan
berjalan, 6 orang di bulan sebelumnya) untuk melihat tampilannya:

```bash
bun run seed:dummy            # isi
bun run seed:dummy --clear    # hapus lagi
```

`--clear` hanya menghapus baris contoh — semuanya ditandai lewat kolom `seed`
berawalan `dummy-`, jadi percobaan asli yang sudah tercatat tidak tersentuh.
**Jalankan `--clear` sebelum tes yang sungguhan** supaya papannya tidak bercampur
nama karangan.

Pindah tempat penyimpanan dengan `TYPING_DB=/jalur/lain.sqlite bun run start`.

Yang disimpan adalah **semua** percobaan, bukan cuma yang terbaik. Papan memilih
yang terbaik saat dibaca, jadi riwayat latihan tidak hilang dan aturan "yang mana
yang dihitung" bisa diubah tanpa kehilangan data lama.

## Kalau mau diubah

| Yang ingin diubah | Tempatnya |
|---|---|
| Daftar kata | `src/lib/words.ts` — `WORDS_ID` |
| Durasi tes | `src/lib/contract.ts` — `DURATION_MS` |
| Daftar divisi | `src/components/IdentityForm.tsx` — `DIVISIONS` |
| Batas "di luar nalar" | `server/index.ts` — `IMPLAUSIBLE_WPM` |
| Warna & tipografi | `src/styles.css` |

Menambah durasi 30/120 detik gampang secara kode, tapi papan peringkat langsung
terbelah jadi tiga dan tiap papan jadi tipis — itu alasannya ditahan di satu
durasi, bukan karena sulit.

## Tes

```bash
bun test
bun run typecheck
```

Tes menutupi aturan skor (`tests/engine.test.ts`) dan pemilihan peringkat
(`tests/db.test.ts`) — dua hal yang kalau salah membuat papan peringkat tidak
bisa dipercaya.
