/**
 * Server aplikasi: menyajikan halaman dan dua endpoint papan peringkat.
 *
 * Skor dihitung ulang di sini dari `seed` + apa yang diketik, bukan diambil dari
 * angka kiriman browser. Jadi browser tidak bisa sekadar mengirim "WPM saya 300".
 */

import index from "../index.html";
import {
	type AttemptPayload,
	DURATION_MS,
	type LeaderboardResponse,
	normalizeName,
	periodOf,
	type SubmitResponse,
} from "../src/lib/contract.ts";
import { type Keypress, type RunState, summarize } from "../src/lib/engine.ts";
import { generateWords } from "../src/lib/words.ts";
import {
	insertAttempt,
	leaderboard,
	openDb,
	periods,
	personalBest,
	resolveDbPath,
	totals,
} from "./db.ts";
import { restoreDb, snapshotDb } from "./snapshot.ts";

const dbPath = resolveDbPath();
// Pemulihan harus selesai sebelum SQLite membuka berkasnya — kalau tidak, dia
// sudah memegang berkas kosong buatannya sendiri dan cadangan itu tertimpa.
const restore = await restoreDb(dbPath);
if (restore !== "mati") console.log(`Cadangan: ${restore}`);

const db = openDb(dbPath);
const port = Number(process.env.PORT ?? 3210);

/** Di atas ini bukan manusia yang mengetik — dicatat, tapi ditandai. */
const IMPLAUSIBLE_WPM = 200;

const MAX_NAME = 40;
const MAX_ENTRIES = 500;
const MAX_KEYPRESSES = 6000;

function bad(message: string): Response {
	return Response.json({ error: message }, { status: 400 });
}

function json(body: unknown): Response {
	return Response.json(body, { headers: { "cache-control": "no-store" } });
}

/** Terima hanya bentuk yang kita harapkan — sisanya ditolak sebelum menyentuh basis data. */
function parsePayload(raw: unknown): AttemptPayload | string {
	if (typeof raw !== "object" || raw === null) return "Kiriman tidak dikenali.";
	const b = raw as Record<string, unknown>;

	const name = typeof b.name === "string" ? b.name.trim() : "";
	if (name.length === 0) return "Nama belum diisi.";
	if (name.length > MAX_NAME) return "Nama terlalu panjang.";

	const division = typeof b.division === "string" ? b.division.trim().slice(0, MAX_NAME) : "";
	const seed = typeof b.seed === "string" ? b.seed.slice(0, 64) : "";
	if (seed.length === 0) return "Seed tidak ada.";

	if (b.durationMs !== DURATION_MS) return "Durasi tes tidak sah.";

	if (!Array.isArray(b.entries) || b.entries.length > MAX_ENTRIES) return "Hasil ketikan tidak sah.";
	const entries = b.entries.map((w) => (typeof w === "string" ? w.slice(0, MAX_NAME) : ""));

	const input = typeof b.input === "string" ? b.input.slice(0, MAX_NAME) : "";

	if (!Array.isArray(b.keypresses) || b.keypresses.length > MAX_KEYPRESSES)
		return "Rekaman ketukan tidak sah.";
	const keypresses: Keypress[] = b.keypresses.map((k) => {
		const kp = k as Record<string, unknown>;
		return { at: Number(kp?.at) || 0, ok: kp?.ok === true };
	});

	return { name, division, seed, durationMs: DURATION_MS, entries, input, keypresses };
}

function scoreOf(payload: AttemptPayload) {
	// Kata disusun ulang dari seed — daftar kata tidak pernah dipercaya dari browser.
	const words = generateWords(payload.seed);
	const state: RunState = {
		words,
		durationMs: payload.durationMs,
		startedAt: 0,
		endedAt: payload.durationMs,
		entries: payload.entries,
		input: payload.input,
		keypresses: payload.keypresses,
	};
	return summarize(state, payload.durationMs);
}

const server = Bun.serve({
	port,
	development: process.env.NODE_ENV !== "production",

	routes: {
		"/": index,

		"/api/leaderboard": {
			GET: (req) => {
				const url = new URL(req.url);
				const period = url.searchParams.get("period") ?? periodOf(new Date());
				const body: LeaderboardResponse = {
					period,
					rows: leaderboard(db, period),
					periods: periods(db),
					totals: totals(db),
				};
				return json(body);
			},
		},

		"/api/attempts": {
			POST: async (req) => {
				let raw: unknown;
				try {
					raw = await req.json();
				} catch {
					return bad("Kiriman bukan JSON.");
				}

				const parsed = parsePayload(raw);
				if (typeof parsed === "string") return bad(parsed);

				const summary = scoreOf(parsed);
				const now = new Date();
				const period = periodOf(now);
				const nameKey = normalizeName(parsed.name);

				// Ketukan lebih sedikit dari huruf benar itu mustahil kalau benar diketik.
				const flagged =
					summary.wpm > IMPLAUSIBLE_WPM || summary.keystrokes < summary.correctChars - 1;

				const previousBest = personalBest(db, period, nameKey);

				insertAttempt(db, {
					period,
					name: parsed.name,
					nameKey,
					division: parsed.division,
					wpm: summary.wpm,
					rawWpm: summary.rawWpm,
					accuracy: summary.accuracy,
					consistency: summary.consistency,
					correctChars: summary.correctChars,
					incorrectChars: summary.incorrectChars,
					keystrokes: summary.keystrokes,
					durationMs: parsed.durationMs,
					seed: parsed.seed,
					flagged,
					createdAt: now.toISOString(),
				});

				// Cadangkan tanpa menunggu: kegagalan mengunggah tidak boleh menahan
				// hasil yang sudah tersimpan di berkas lokal.
				void snapshotDb(db, dbPath);

				const rows = leaderboard(db, period);
				const body: SubmitResponse = {
					summary,
					period,
					rank: rows.find((r) => normalizeName(r.name) === nameKey)?.rank ?? rows.length,
					personalBest: summary.wpm > previousBest,
					flagged,
				};
				return json(body);
			},
		},
	},
});

console.log(`Tes ngetik AHA siap di http://localhost:${server.port}`);
