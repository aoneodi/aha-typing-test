/**
 * Sumber kata untuk tes, plus pengacak yang bisa diulang.
 *
 * Aliran kata dibangkitkan dari satu `seed`, jadi server bisa menyusun ulang
 * kata persis sama tanpa peserta perlu mengirim daftarnya — dan tanpa bisa
 * mengarang kata yang lebih pendek supaya WPM-nya naik.
 */

/**
 * Kata umum bahasa Indonesia, semua huruf kecil, tanpa tanda baca.
 * Ditulis pendek-pendek supaya yang diuji kecepatan mengetik, bukan kosakata.
 */
export const WORDS_ID = [
	"ada", "agar", "air", "akan", "akhir", "aku", "alam", "alasan", "amat", "anak",
	"anda", "angka", "antar", "apa", "arah", "asal", "atas", "atau", "awal", "ayah",
	"bagi", "bagus", "bahan", "bahwa", "baik", "balik", "banyak", "barang", "baru", "batas",
	"bawah", "beban", "bebas", "beda", "belajar", "beli", "belum", "benar", "bentuk", "berat",
	"berhasil", "berita", "bersama", "besar", "biasa", "biaya", "bicara", "bila", "bisa", "buah",
	"buat", "buka", "bukan", "bulan", "bumi", "bunga", "cara", "cepat", "cerita", "cinta",
	"coba", "cukup", "dalam", "dan", "dapat", "dari", "dasar", "data", "datang", "daya",
	"dekat", "demi", "dengan", "depan", "desa", "dewan", "diri", "dua", "dunia", "empat",
	"enak", "erat", "gagal", "ganti", "gedung", "gerak", "guna", "guru", "hadir", "hal",
	"hanya", "harga", "hari", "harus", "hasil", "hati", "hebat", "hidup", "hijau", "hingga",
	"hubungan", "hukum", "ibu", "ide", "ikut", "ilmu", "indah", "induk", "ingat", "ingin",
	"ini", "isi", "istri", "itu", "jadi", "jalan", "jam", "jangan", "jauh", "jawab",
	"jelas", "jenis", "juga", "jumlah", "kabar", "kali", "kami", "kamu", "kanan", "kantor",
	"kapal", "karena", "kata", "kaya", "keadaan", "kecil", "kedua", "kelas", "keluar", "kembali",
	"kemudian", "kenal", "kepala", "kerja", "kertas", "khusus", "kini", "kira", "kirim", "kita",
	"kota", "kuat", "kurang", "lagi", "lahir", "lain", "laku", "lalu", "lama", "langsung",
	"lanjut", "laut", "lebih", "lengkap", "lewat", "libur", "lihat", "lima", "luar", "luas",
	"maju", "makan", "makin", "malam", "mampu", "mana", "masa", "masih", "masuk", "mata",
	"mau", "melihat", "memang", "mereka", "merah", "milik", "minta", "modal", "mudah", "mulai",
	"muncul", "murah", "musim", "nama", "naik", "namun", "negara", "nilai", "nyata", "orang",
	"pagi", "paling", "panjang", "pasar", "pasti", "pekan", "penuh", "perlu", "pertama", "pesan",
	"pihak", "pilih", "pindah", "pintu", "pokok", "proses", "pukul", "pula", "punya", "putih",
	"rakyat", "ramai", "rasa", "ratus", "rekan", "rencana", "ringan", "ruang", "rumah", "sabar",
	"saat", "sadar", "saja", "salah", "sama", "sambil", "sampai", "sangat", "satu", "saudara",
	"sebab", "sebagai", "sedang", "segera", "sehat", "sekali", "selalu", "selama", "seluruh", "semua",
	"sendiri", "sering", "serta", "sesuai", "siap", "siapa", "sikap", "sisi", "situ", "suara",
	"sudah", "sulit", "sumber", "supaya", "surat", "susah", "syarat", "tahu", "tahun", "tambah",
	"tampak", "tanah", "tangan", "tanpa", "tanya", "tapi", "tarik", "tempat", "tengah", "tentu",
	"terus", "tetap", "tiap", "tidak", "tiga", "tinggi", "tingkat", "toko", "tua", "tugas",
	"tuju", "tulis", "tutup", "uang", "ujung", "umum", "untuk", "upaya", "usaha", "utama",
	"waktu", "warga", "warna", "yang", "kirim", "pesan", "produk", "harga", "pesanan", "kirimkan",
] as const;

/** Berapa kata yang disiapkan — jauh lebih banyak dari yang bisa habis dalam 2 menit. */
export const WORD_COUNT = 320;

/** PRNG mulberry32: kecil, cepat, dan hasilnya sama di browser maupun di server. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Ubah seed berbentuk teks menjadi angka 32-bit (FNV-1a). */
function hashSeed(seed: string): number {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/**
 * Aliran kata untuk satu tes. Seed yang sama selalu menghasilkan kata yang sama.
 * Kata yang sama tidak diulang berturut-turut supaya tidak terasa aneh.
 */
export function generateWords(seed: string, count = WORD_COUNT): string[] {
	const rand = mulberry32(hashSeed(seed));
	const out: string[] = [];
	let previous = "";
	while (out.length < count) {
		const word = WORDS_ID[Math.floor(rand() * WORDS_ID.length)] ?? "dan";
		if (word === previous) continue;
		out.push(word);
		previous = word;
	}
	return out;
}

/** Seed acak untuk satu percobaan baru. */
export function newSeed(): string {
	return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
