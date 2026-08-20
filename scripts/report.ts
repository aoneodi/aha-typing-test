#!/usr/bin/env bun
/**
 * Cetak papan peringkat ke terminal — untuk menempel hasil ke grup atau
 * memeriksa isi basis data tanpa membuka peramban.
 *
 *   bun run scripts/report.ts              # periode berjalan
 *   bun run scripts/report.ts 2026-07      # bulan tertentu
 *   bun run scripts/report.ts all          # sepanjang masa
 */

import { periodLabel, periodOf } from "../src/lib/contract.ts";
import { leaderboard, openDb, periods, totals } from "../server/db.ts";

const period = process.argv[2] ?? periodOf(new Date());
const db = openDb();
const rows = leaderboard(db, period);

console.log(`\n${period === "all" ? "Sepanjang masa" : periodLabel(period)}`);
console.log("─".repeat(58));

if (rows.length === 0) {
	console.log("Belum ada percobaan di periode ini.");
	const tersedia = periods(db);
	if (tersedia.length > 0) {
		console.log(`\nPeriode yang ada: ${tersedia.map((p) => p.period).join(", ")}`);
	}
} else {
	for (const row of rows) {
		const nama = row.name.padEnd(20).slice(0, 20);
		const divisi = (row.division || "—").padEnd(22).slice(0, 22);
		const wpm = String(row.wpm).padStart(3);
		console.log(
			`${String(row.rank).padStart(2)}. ${nama} ${divisi} ${wpm} wpm  ${row.accuracy}%`,
		);
	}
	const { attempts, people } = totals(db);
	console.log("─".repeat(58));
	console.log(`${people} orang · ${attempts} percobaan tercatat seluruhnya\n`);
}
