#!/usr/bin/env bun
/**
 * Isi papan peringkat dengan data contoh, supaya tampilannya bisa dilihat dan
 * ditunjukkan sebelum tes yang sungguhan dijalankan.
 *
 *   bun run seed:dummy            # isi data contoh
 *   bun run seed:dummy --clear    # hapus data contoh, sisakan yang asli
 *
 * Semua baris contoh ditandai lewat kolom `seed` berawalan "dummy-", jadi bisa
 * dihapus lagi tanpa menyentuh percobaan asli yang sudah tercatat.
 */

import { periodOf } from "../src/lib/contract.ts";
import { insertAttempt, leaderboard, openDb } from "../server/db.ts";

const PREFIX = "dummy-";

/**
 * Angka yang masuk akal untuk kantor: cepat sekali ~70an, rata-rata 40–55,
 * yang masih belajar 20–30an. Akurasi turun seiring kecepatan naik.
 *
 * `at` adalah waktu UTC; periodenya dihitung ulang di WIB seperti percobaan asli.
 */
const CONTOH = [
	// Agustus 2026 — periode berjalan.
	{ name: "Rina", division: "Partnership", wpm: 74, accuracy: 98.6, consistency: 91, at: "2026-08-03T02:10:00Z" },
	{ name: "Rina", division: "Partnership", wpm: 69, accuracy: 97.2, consistency: 88, at: "2026-08-03T02:04:00Z" },
	{ name: "Fajar", division: "Tech", wpm: 71, accuracy: 96.1, consistency: 84, at: "2026-08-04T07:22:00Z" },
	{ name: "Nadia", division: "Marketing", wpm: 65, accuracy: 98.9, consistency: 90, at: "2026-08-05T03:41:00Z" },
	{ name: "Sari", division: "Business Development", wpm: 61, accuracy: 95.4, consistency: 82, at: "2026-08-05T04:02:00Z" },
	{ name: "Sari", division: "Business Development", wpm: 57, accuracy: 94.0, consistency: 78, at: "2026-08-05T03:55:00Z" },
	{ name: "Bayu", division: "Operations", wpm: 58, accuracy: 93.2, consistency: 76, at: "2026-08-06T06:15:00Z" },
	{ name: "Intan", division: "Finance", wpm: 54, accuracy: 97.8, consistency: 87, at: "2026-08-06T08:30:00Z" },
	{ name: "Reza", division: "Product", wpm: 52, accuracy: 92.5, consistency: 71, at: "2026-08-07T02:48:00Z" },
	{ name: "Ayu", division: "HRD", wpm: 49, accuracy: 96.7, consistency: 85, at: "2026-08-07T05:12:00Z" },
	{ name: "Galih", division: "Tech", wpm: 47, accuracy: 91.4, consistency: 68, at: "2026-08-10T03:33:00Z" },
	{ name: "Tika", division: "Marketing", wpm: 43, accuracy: 95.1, consistency: 80, at: "2026-08-11T04:20:00Z" },
	{ name: "Andi", division: "Warehouse", wpm: 38, accuracy: 93.8, consistency: 74, at: "2026-08-12T07:05:00Z" },
	{ name: "Andi", division: "Warehouse", wpm: 31, accuracy: 90.2, consistency: 62, at: "2026-08-12T06:58:00Z" },
	{ name: "Yuni", division: "Finance", wpm: 35, accuracy: 94.6, consistency: 77, at: "2026-08-13T02:25:00Z" },
	{ name: "Dimas", division: "Warehouse", wpm: 27, accuracy: 89.3, consistency: 59, at: "2026-08-14T08:44:00Z" },

	// Juli 2026 — arsip bulan lalu, supaya tombol periode dan "sepanjang masa" ada isinya.
	{ name: "Fajar", division: "Tech", wpm: 78, accuracy: 97.4, consistency: 89, at: "2026-07-08T03:15:00Z" },
	{ name: "Rina", division: "Partnership", wpm: 70, accuracy: 98.1, consistency: 90, at: "2026-07-09T02:30:00Z" },
	{ name: "Nadia", division: "Marketing", wpm: 60, accuracy: 97.6, consistency: 86, at: "2026-07-09T04:05:00Z" },
	{ name: "Bayu", division: "Operations", wpm: 55, accuracy: 92.8, consistency: 73, at: "2026-07-10T06:40:00Z" },
	{ name: "Ayu", division: "HRD", wpm: 44, accuracy: 95.9, consistency: 83, at: "2026-07-11T05:20:00Z" },
	{ name: "Dimas", division: "Warehouse", wpm: 24, accuracy: 88.1, consistency: 55, at: "2026-07-14T07:50:00Z" },
];

const db = openDb();

if (process.argv.includes("--clear")) {
	const { changes } = db.query(`DELETE FROM attempts WHERE seed LIKE '${PREFIX}%'`).run();
	console.log(`${changes} baris contoh dihapus. Percobaan asli tidak disentuh.`);
	process.exit(0);
}

const sudahAda = db
	.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM attempts WHERE seed LIKE '${PREFIX}%'`)
	.get();
if ((sudahAda?.n ?? 0) > 0) {
	console.log(
		`Sudah ada ${sudahAda?.n} baris contoh di basis data.\n` +
			"Jalankan `bun run seed:dummy --clear` dulu kalau mau menggantinya.",
	);
	process.exit(1);
}

for (const [i, orang] of CONTOH.entries()) {
	// Turunkan sisa angkanya dari wpm + akurasi supaya konsisten satu sama lain:
	// 60 detik, wpm = huruf benar / 5, lalu huruf salah mengikuti akurasinya.
	const correctChars = Math.round(orang.wpm * 5);
	const incorrectChars = Math.round((correctChars * (100 - orang.accuracy)) / orang.accuracy);
	const keystrokes = correctChars + incorrectChars;

	insertAttempt(db, {
		period: periodOf(new Date(orang.at)),
		name: orang.name,
		nameKey: orang.name.trim().toLowerCase(),
		division: orang.division,
		wpm: orang.wpm,
		rawWpm: Math.round(keystrokes / 5),
		accuracy: orang.accuracy,
		consistency: orang.consistency,
		correctChars,
		incorrectChars,
		keystrokes,
		durationMs: 60_000,
		seed: `${PREFIX}${i}`,
		flagged: false,
		createdAt: orang.at,
	});
}

const periodeIni = periodOf(new Date());
console.log(`${CONTOH.length} percobaan contoh dimasukkan.`);
console.log(`Papan ${periodeIni}: ${leaderboard(db, periodeIni).length} peserta.`);
console.log("Hapus lagi dengan: bun run seed:dummy --clear");
