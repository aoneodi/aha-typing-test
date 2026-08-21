/** Bentuk data yang lewat antara browser dan server, plus urusan periode bulanan. */

import type { Keypress, Summary } from "./engine.ts";

/**
 * Satu durasi resmi saja. Menambah 30/120 detik gampang secara kode, tapi papan
 * peringkat langsung terbelah jadi tiga dan tiap papan jadi tipis untuk tim
 * sebesar AHA — itu alasannya ditahan, bukan karena sulit.
 */
export const DURATION_MS = 60_000;

/** Zona waktu yang menentukan sebuah percobaan masuk bulan yang mana. */
export const TIMEZONE = "Asia/Jakarta";

/**
 * Saklar yang dibaca peramban saat mulai.
 *
 * Papan peringkat bisa dimatikan lewat env `TYPING_LEADERBOARD=off` tanpa
 * membangun ulang apa pun — dipakai saat aplikasinya sudah dipasang tapi papannya
 * belum mau ditunjukkan.
 */
export type AppConfig = {
	leaderboard: boolean;
};

export type AttemptPayload = {
	name: string;
	division: string;
	/** Seed kata — server menyusun ulang kata dari sini, bukan dari kiriman peserta. */
	seed: string;
	durationMs: number;
	entries: string[];
	input: string;
	keypresses: Keypress[];
};

export type LeaderboardRow = {
	rank: number;
	name: string;
	division: string;
	wpm: number;
	accuracy: number;
	consistency: number;
	/** Berapa kali orang ini mencoba di periode tersebut. */
	attempts: number;
	/** ISO-8601 UTC, selalu dengan `Z`. */
	achievedAt: string;
};

export type LeaderboardResponse = {
	period: string;
	rows: LeaderboardRow[];
	/** Semua periode yang punya isi, terbaru dulu. */
	periods: { period: string; attempts: number; people: number }[];
	totals: { attempts: number; people: number };
};

export type SubmitResponse = {
	summary: Summary;
	period: string;
	rank: number;
	/** Percobaan ini memecahkan rekor pribadi peserta di periode berjalan. */
	personalBest: boolean;
	/** Angkanya di luar nalar — tetap dicatat, tapi ditandai supaya bisa ditinjau. */
	flagged: boolean;
};

/**
 * Periode "YYYY-MM" untuk sebuah momen, dihitung di WIB.
 *
 * Percobaan jam 23.30 tanggal 31 masuk bulan itu menurut jam peserta, bukan
 * menurut UTC yang sudah pindah bulan enam jam lebih awal.
 */
export function periodOf(date: Date, timeZone = TIMEZONE): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
	}).formatToParts(date);
	const year = parts.find((p) => p.type === "year")?.value ?? "0000";
	const month = parts.find((p) => p.type === "month")?.value ?? "01";
	return `${year}-${month}`;
}

const MONTHS_ID = [
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "2026-08" → "Agustus 2026". */
export function periodLabel(period: string): string {
	const [year, month] = period.split("-");
	const name = MONTHS_ID[Number(month) - 1];
	return name && year ? `${name} ${year}` : period;
}

/** Nama disamakan untuk pencocokan: huruf kecil, spasi dirapikan. */
export function normalizeName(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, " ");
}
