import { describe, expect, test } from "bun:test";
import { periodOf } from "../src/lib/contract.ts";
import { createRun, finish, isFinished, reduce, remainingMs, type RunState, summarize } from "../src/lib/engine.ts";
import { generateWords } from "../src/lib/words.ts";

/** Mainkan sebuah teks sebagai urutan ketukan, satu ketukan tiap `gap` milidetik. */
function play(state: RunState, text: string, gap = 100): RunState {
	let s = state;
	let t = state.startedAt ?? 0;
	for (const ch of text) {
		t += gap;
		s = reduce(s, ch === " " ? { type: "space", at: t } : { type: "char", char: ch, at: t });
	}
	return s;
}

/** Akhiri tepat di detik ke-`durationMs`, seperti yang dilakukan jam mundur. */
function stop(state: RunState): RunState {
	return finish(state, (state.startedAt ?? 0) + state.durationMs);
}

describe("skor", () => {
	test("ketikan sempurna menghitung huruf plus spasinya", () => {
		const run = stop(play(createRun(["ada", "agar", "air"], 60_000), "ada agar air"));
		const s = summarize(run, 60_000);

		// "ada" + spasi + "agar" + spasi + "air" = 12 huruf benar dalam satu menit.
		expect(s.correctChars).toBe(12);
		expect(s.incorrectChars).toBe(0);
		expect(s.accuracy).toBe(100);
		expect(s.wpm).toBe(Math.round(12 / 5));
	});

	test("durasi lebih pendek menaikkan wpm untuk ketikan yang sama", () => {
		const cepat = stop(play(createRun(["ada", "agar", "air"], 30_000), "ada agar air"));
		const lambat = stop(play(createRun(["ada", "agar", "air"], 60_000), "ada agar air"));

		// 12 huruf benar: 2,4 wpm dalam satu menit, 4,8 wpm dalam setengah menit.
		// Dibandingkan sebagai angka bulat masing-masing, bukan sebagai kelipatan —
		// 2 × pembulatan bukan pembulatan dari 2 ×.
		expect(summarize(lambat, 60_000).wpm).toBe(2);
		expect(summarize(cepat, 30_000).wpm).toBe(5);
	});

	test("HPM menghitung huruf per menit, bukan kata per menit", () => {
		const run = stop(play(createRun(["ada", "agar", "air"], 60_000), "ada agar air"));
		const s = summarize(run, 60_000);

		// 12 huruf benar dalam satu menit; yang diketuk 12 juga karena tidak ada salah.
		expect(s.correctedHpm).toBe(12);
		expect(s.rawHpm).toBe(12);
		// Sengaja tidak diuji sebagai `rawWpm * 5`: keduanya dibulatkan sendiri-sendiri,
		// jadi 12 huruf memberi rawHpm 12 tapi rawWpm 2 (dari 2,4), bukan 2,4.
		expect(s.rawWpm).toBe(2);
	});

	test("Raw HPM ikut menghitung yang salah, Koreksi HPM tidak", () => {
		const run = stop(play(createRun(["ada", "agar"], 60_000), "adx agar"));
		const s = summarize(run, 60_000);

		// Diketuk 8 huruf ("adx" + spasi + "agar"), yang benar hanya 6.
		expect(s.rawHpm).toBe(8);
		expect(s.correctedHpm).toBe(6);
	});

	test("huruf salah tidak dihitung benar, dan spasinya ikut salah", () => {
		const run = stop(play(createRun(["ada", "agar"], 60_000), "adx agar"));
		const s = summarize(run, 60_000);

		// "ad" benar, "x" salah, spasi salah karena katanya tidak utuh, lalu "agar" benar.
		expect(s.correctChars).toBe(2 + 4);
		expect(s.incorrectChars).toBe(2);
		expect(s.accuracy).toBeCloseTo((6 / 8) * 100, 1);
	});

	test("huruf berlebih di ujung kata dihitung salah", () => {
		const run = stop(play(createRun(["ada", "agar"], 60_000), "adaa"));
		const s = summarize(run, 60_000);

		expect(s.correctChars).toBe(3);
		expect(s.incorrectChars).toBe(1);
	});

	test("Caps Lock tidak menghukum: huruf besar dinilai sama dengan huruf kecil", () => {
		const kecil = stop(play(createRun(["ada", "agar", "air"], 60_000), "ada agar air"));
		const besar = stop(play(createRun(["ada", "agar", "air"], 60_000), "ADA AGAR AIR"));

		expect(summarize(besar, 60_000)).toEqual(summarize(kecil, 60_000));
		expect(summarize(besar, 60_000).accuracy).toBe(100);
	});

	test("huruf besar campur tetap mengunci kata dengan benar", () => {
		const run = stop(play(createRun(["ada", "agar"], 60_000), "AdA aGar"));
		const s = summarize(run, 60_000);

		// "ada" + spasi + "agar" = 8 huruf benar, tidak ada yang salah.
		expect(s.correctChars).toBe(8);
		expect(s.incorrectChars).toBe(0);
		expect(s.accuracy).toBe(100);
	});

	test("salah ketik tetap salah walau huruf besar", () => {
		const run = stop(play(createRun(["ada"], 60_000), "ADX"));
		const s = summarize(run, 60_000);

		expect(s.correctChars).toBe(2);
		expect(s.incorrectChars).toBe(1);
	});

	test("backspace bukan ketukan — menghapus salah ketik tidak menghukum akurasi", () => {
		let run = play(createRun(["ada"], 60_000), "adx");
		run = reduce(run, { type: "backspace", at: 400 });
		run = play(run, "a", 100);
		const s = summarize(stop(run), 60_000);

		expect(s.correctChars).toBe(3);
		// Empat ketukan huruf, satu di antaranya salah — backspace tidak masuk hitungan.
		expect(s.keystrokes).toBe(4);
		expect(s.accuracy).toBe(75);
	});

	test("ctrl+backspace menghapus seluruh kata yang sedang diketik", () => {
		let run = play(createRun(["ada", "agar"], 60_000), "adx");
		run = reduce(run, { type: "backspace", word: true, at: 400 });
		expect(run.input).toBe("");
	});

	test("spasi di awal kata tidak mengunci kata kosong", () => {
		const run = play(createRun(["ada"], 60_000), " ");
		expect(run.entries).toHaveLength(0);
		expect(run.keypresses).toHaveLength(0);
	});

	test("jam baru jalan pada ketukan pertama", () => {
		const run = createRun(["ada"], 60_000);
		expect(run.startedAt).toBeNull();
		expect(remainingMs(run, 5_000)).toBe(60_000);

		const started = reduce(run, { type: "char", char: "a", at: 5_000 });
		expect(started.startedAt).toBe(5_000);
		expect(remainingMs(started, 15_000)).toBe(50_000);
	});

	test("kehabisan kata mengakhiri tes", () => {
		const run = play(createRun(["ada", "agar"], 60_000), "ada agar ");
		expect(isFinished(run)).toBe(true);
	});

	test("belum mengetik apa pun berarti nol, bukan pembagian dengan nol", () => {
		const s = summarize(createRun(["ada"], 60_000), 30_000);
		expect(s.wpm).toBe(0);
		expect(s.accuracy).toBe(0);
		expect(s.wpmSeries).toHaveLength(0);
	});

	test("waktu berhenti di durasi resmi walau event terakhir telat", () => {
		let run = play(createRun(["ada", "agar", "air"], 60_000), "ada agar air");
		run = finish(run, (run.startedAt ?? 0) + 75_000);
		expect(summarize(run, 0).elapsedMs).toBe(60_000);
	});
});

describe("kata", () => {
	test("seed yang sama menghasilkan kata yang sama", () => {
		expect(generateWords("abc", 50)).toEqual(generateWords("abc", 50));
	});

	test("seed berbeda menghasilkan kata berbeda", () => {
		expect(generateWords("abc", 50)).not.toEqual(generateWords("abd", 50));
	});

	test("tidak ada kata yang langsung berulang", () => {
		const words = generateWords("seed-uji", 300);
		expect(words).toHaveLength(300);
		expect(words.some((w, i) => i > 0 && w === words[i - 1])).toBe(false);
	});
});

describe("periode", () => {
	test("dihitung memakai WIB, bukan UTC", () => {
		// 31 Agustus 23.30 WIB — di UTC sudah 31 Agustus 16.30, masih Agustus.
		expect(periodOf(new Date("2026-08-31T16:30:00Z"))).toBe("2026-08");
		// 1 September 00.30 WIB — di UTC masih 31 Agustus 17.30.
		expect(periodOf(new Date("2026-08-31T17:30:00Z"))).toBe("2026-09");
	});
});
