/**
 * Penyimpanan percobaan. SQLite lewat `bun:sqlite` — satu berkas, tanpa server
 * basis data, cukup disalin kalau mau dipindah atau dicadangkan.
 *
 * Yang disimpan adalah *semua* percobaan, bukan hanya yang terbaik. Papan
 * peringkat memilih yang terbaik saat dibaca, jadi riwayat latihan tidak hilang
 * dan aturan "yang mana yang dihitung" bisa diubah tanpa kehilangan data.
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { LeaderboardRow } from "../src/lib/contract.ts";

export type AttemptRecord = {
	period: string;
	name: string;
	nameKey: string;
	division: string;
	wpm: number;
	rawWpm: number;
	accuracy: number;
	consistency: number;
	correctChars: number;
	incorrectChars: number;
	keystrokes: number;
	durationMs: number;
	seed: string;
	flagged: boolean;
	createdAt: string;
};

/**
 * Diikat ke folder proyek, bukan ke direktori kerja — supaya leaderboard yang
 * sama ditemukan dari mana pun perintahnya dijalankan.
 */
const DEFAULT_PATH = join(import.meta.dir, "..", "data", "typing.sqlite");

export function openDb(path = process.env.TYPING_DB ?? DEFAULT_PATH): Database {
	if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
	const db = new Database(path, { create: true });
	db.exec("PRAGMA journal_mode = WAL");
	db.exec(`
		CREATE TABLE IF NOT EXISTS attempts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			period TEXT NOT NULL,
			name TEXT NOT NULL,
			name_key TEXT NOT NULL,
			division TEXT NOT NULL DEFAULT '',
			wpm REAL NOT NULL,
			raw_wpm REAL NOT NULL,
			accuracy REAL NOT NULL,
			consistency REAL NOT NULL,
			correct_chars INTEGER NOT NULL,
			incorrect_chars INTEGER NOT NULL,
			keystrokes INTEGER NOT NULL,
			duration_ms INTEGER NOT NULL,
			seed TEXT NOT NULL,
			flagged INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS attempts_by_period ON attempts (period, wpm DESC);
		CREATE INDEX IF NOT EXISTS attempts_by_person ON attempts (period, name_key);
	`);
	return db;
}

export function insertAttempt(db: Database, a: AttemptRecord): void {
	db.query(
		`INSERT INTO attempts (
			period, name, name_key, division, wpm, raw_wpm, accuracy, consistency,
			correct_chars, incorrect_chars, keystrokes, duration_ms, seed, flagged, created_at
		) VALUES (
			$period, $name, $nameKey, $division, $wpm, $rawWpm, $accuracy, $consistency,
			$correctChars, $incorrectChars, $keystrokes, $durationMs, $seed, $flagged, $createdAt
		)`,
	).run({
		$period: a.period,
		$name: a.name,
		$nameKey: a.nameKey,
		$division: a.division,
		$wpm: a.wpm,
		$rawWpm: a.rawWpm,
		$accuracy: a.accuracy,
		$consistency: a.consistency,
		$correctChars: a.correctChars,
		$incorrectChars: a.incorrectChars,
		$keystrokes: a.keystrokes,
		$durationMs: a.durationMs,
		$seed: a.seed,
		$flagged: a.flagged ? 1 : 0,
		$createdAt: a.createdAt,
	});
}

type BestRow = {
	name: string;
	division: string;
	wpm: number;
	accuracy: number;
	consistency: number;
	attempts: number;
	created_at: string;
};

/**
 * Satu baris per orang: percobaan terbaiknya. Seri diputus oleh akurasi, lalu
 * oleh siapa yang mencapainya lebih dulu.
 *
 * `period` boleh "all" untuk sepanjang masa.
 */
export function leaderboard(db: Database, period: string): LeaderboardRow[] {
	const all = period === "all";
	const rows = db
		.query<BestRow, never[] | [string]>(
			`SELECT name, division, wpm, accuracy, consistency, attempts, created_at FROM (
				SELECT
					name, division, wpm, accuracy, consistency, created_at,
					ROW_NUMBER() OVER (
						PARTITION BY name_key ORDER BY wpm DESC, accuracy DESC, created_at ASC
					) AS rn,
					COUNT(*) OVER (PARTITION BY name_key) AS attempts
				FROM attempts
				${all ? "" : "WHERE period = ?"}
			)
			WHERE rn = 1
			ORDER BY wpm DESC, accuracy DESC, created_at ASC`,
		)
		.all(...((all ? [] : [period]) as [string]));

	return rows.map((r, i) => ({
		rank: i + 1,
		name: r.name,
		division: r.division,
		wpm: r.wpm,
		accuracy: r.accuracy,
		consistency: r.consistency,
		attempts: r.attempts,
		achievedAt: r.created_at,
	}));
}

export function periods(db: Database): { period: string; attempts: number; people: number }[] {
	return db
		.query<{ period: string; attempts: number; people: number }, []>(
			`SELECT period, COUNT(*) AS attempts, COUNT(DISTINCT name_key) AS people
			 FROM attempts GROUP BY period ORDER BY period DESC`,
		)
		.all();
}

export function totals(db: Database): { attempts: number; people: number } {
	return (
		db
			.query<{ attempts: number; people: number }, []>(
				"SELECT COUNT(*) AS attempts, COUNT(DISTINCT name_key) AS people FROM attempts",
			)
			.get() ?? { attempts: 0, people: 0 }
	);
}

/** WPM terbaik orang ini di periode tersebut — untuk tahu apakah rekor pribadinya pecah. */
export function personalBest(db: Database, period: string, nameKey: string): number {
	const row = db
		.query<{ best: number | null }, [string, string]>(
			"SELECT MAX(wpm) AS best FROM attempts WHERE period = ? AND name_key = ?",
		)
		.get(period, nameKey);
	return row?.best ?? 0;
}
