import { beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { insertAttempt, leaderboard, openDb, periods, personalBest, totals } from "../server/db.ts";

let db: Database;

function attempt(over: Partial<Parameters<typeof insertAttempt>[1]> = {}) {
	return {
		period: "2026-08",
		name: "Rina",
		nameKey: "rina",
		division: "Partnership",
		wpm: 50,
		rawWpm: 55,
		accuracy: 96,
		consistency: 80,
		correctChars: 250,
		incorrectChars: 8,
		keystrokes: 258,
		durationMs: 60_000,
		seed: "abc",
		flagged: false,
		createdAt: "2026-08-05T03:00:00.000Z",
		...over,
	};
}

beforeEach(() => {
	db = openDb(":memory:");
});

describe("papan peringkat", () => {
	test("satu baris per orang, memakai percobaan terbaiknya", () => {
		insertAttempt(db, attempt({ wpm: 40 }));
		insertAttempt(db, attempt({ wpm: 62, createdAt: "2026-08-06T03:00:00.000Z" }));
		insertAttempt(db, attempt({ wpm: 51, createdAt: "2026-08-07T03:00:00.000Z" }));

		const rows = leaderboard(db, "2026-08");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.wpm).toBe(62);
		expect(rows[0]?.attempts).toBe(3);
		expect(rows[0]?.rank).toBe(1);
	});

	test("nama dicocokkan tanpa peduli huruf besar-kecil dan spasi berlebih", () => {
		insertAttempt(db, attempt({ name: "Rina", nameKey: "rina", wpm: 40 }));
		insertAttempt(db, attempt({ name: "RINA ", nameKey: "rina", wpm: 70 }));

		const rows = leaderboard(db, "2026-08");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.wpm).toBe(70);
	});

	test("diurutkan dari wpm tertinggi, seri diputus oleh akurasi", () => {
		insertAttempt(db, attempt({ name: "Rina", nameKey: "rina", wpm: 60, accuracy: 92 }));
		insertAttempt(db, attempt({ name: "Budi", nameKey: "budi", wpm: 60, accuracy: 98 }));
		insertAttempt(db, attempt({ name: "Sari", nameKey: "sari", wpm: 71, accuracy: 90 }));

		expect(leaderboard(db, "2026-08").map((r) => r.name)).toEqual(["Sari", "Budi", "Rina"]);
	});

	test("periode memisahkan bulan, 'all' menggabungkan semuanya", () => {
		insertAttempt(db, attempt({ period: "2026-07", wpm: 80 }));
		insertAttempt(db, attempt({ period: "2026-08", wpm: 55 }));

		expect(leaderboard(db, "2026-08")[0]?.wpm).toBe(55);
		expect(leaderboard(db, "2026-07")[0]?.wpm).toBe(80);
		expect(leaderboard(db, "all")[0]?.wpm).toBe(80);
	});

	test("periode kosong menghasilkan papan kosong, bukan galat", () => {
		expect(leaderboard(db, "2026-01")).toEqual([]);
	});

	test("rekor pribadi dibaca per periode", () => {
		insertAttempt(db, attempt({ period: "2026-07", wpm: 90 }));
		insertAttempt(db, attempt({ period: "2026-08", wpm: 45 }));

		expect(personalBest(db, "2026-08", "rina")).toBe(45);
		expect(personalBest(db, "2026-08", "belum-ada")).toBe(0);
	});

	test("ringkasan menghitung orang, bukan percobaan", () => {
		insertAttempt(db, attempt({ nameKey: "rina" }));
		insertAttempt(db, attempt({ nameKey: "rina" }));
		insertAttempt(db, attempt({ name: "Budi", nameKey: "budi" }));

		expect(totals(db)).toEqual({ attempts: 3, people: 2 });
		expect(periods(db)).toEqual([{ period: "2026-08", attempts: 3, people: 2 }]);
	});
});
