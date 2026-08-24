# Bun menyajikan halaman dan API dari satu proses.
#
# Halamannya dibangun lebih dulu ke dist/ dan disajikan oleh server kita sendiri,
# bukan lewat rute HTML bawaan Bun. Alasannya cuma satu: rute bawaan tidak
# menerima kepala kustom, jadi halamannya tersaji tanpa `cache-control` dan orang
# terus melihat versi lama berhari-hari sesudah deploy.
FROM oven/bun:1.3.14-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.14-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock index.html tsconfig.json ./
COPY src ./src
COPY server ./server
COPY scripts ./scripts

# Nama berkas hasilnya memuat sidik isi, jadi aset boleh di-cache selamanya
# sementara kerangka HTML-nya tidak pernah di-cache.
RUN bun run build

ENV NODE_ENV=production
# Cloud Run dan sebagian besar host menyuntikkan PORT sendiri; ini hanya cadangan.
ENV PORT=8080
EXPOSE 8080

# PENTING: basis datanya SQLite satu berkas. Jalankan **satu instance saja**
# (`--max-instances=1`) dan pasangkan penyimpanan yang benar-benar awet ke
# TYPING_DB — kalau tidak, papan peringkat ikut hilang tiap kali instance baru
# dibuat. Lihat DEPLOY.md.
CMD ["bun", "server/index.ts"]
