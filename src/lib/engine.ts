/**
 * Mesin tes ngetik. Murni — tidak menyentuh DOM, waktu, atau jaringan.
 *
 * Dipakai dua kali: di browser untuk menggerakkan tampilan, dan di server untuk
 * menghitung ulang skor dari kiriman peserta. Satu rumus, jadi angka di layar
 * dan angka di leaderboard tidak mungkin berbeda.
 *
 * Semua waktu dalam milidetik, relatif terhadap apa pun yang dipakai pemanggil.
 */

export type Keypress = {
	/** Milidetik sejak ketukan pertama. */
	at: number;
	/** Huruf yang diketuk cocok dengan huruf yang seharusnya. */
	ok: boolean;
};

export type RunState = {
	words: string[];
	durationMs: number;
	/** Null sampai ketukan pertama — jam baru jalan saat peserta mulai mengetik. */
	startedAt: number | null;
	endedAt: number | null;
	/** Kata-kata yang sudah dikunci dengan spasi. */
	entries: string[];
	/** Kata yang sedang diketik. */
	input: string;
	keypresses: Keypress[];
};

export type RunEvent =
	| { type: "char"; char: string; at: number }
	| { type: "space"; at: number }
	| { type: "backspace"; word?: boolean; at: number };

export type Summary = {
	/** Kata per menit bersih — hanya huruf yang benar. Ini angka yang diperingkat. */
	wpm: number;
	/** Kata per menit kotor — semua yang diketuk, benar maupun salah. */
	rawWpm: number;
	/** Persen, 0–100. */
	accuracy: number;
	correctChars: number;
	incorrectChars: number;
	keystrokes: number;
	elapsedMs: number;
	/** WPM tiap detik, untuk grafik hasil. */
	wpmSeries: number[];
	/** Persen, 0–100. Seberapa rata kecepatannya dari detik ke detik. */
	consistency: number;
};

const WORD_LENGTH = 5; // Konvensi WPM: satu "kata" = 5 karakter.

/**
 * Besar-kecil huruf diabaikan.
 *
 * Tidak ada satu pun kata di daftar yang berhuruf besar, jadi membedakannya
 * tidak mengukur kecepatan mengetik — dia hanya menghukum Caps Lock yang menyala
 * dengan nilai nol, padahal tombol yang ditekan sudah benar semua.
 */
export function sameChar(a: string | undefined, b: string | undefined): boolean {
	return a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();
}

function sameWord(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

export function createRun(words: string[], durationMs: number): RunState {
	return {
		words,
		durationMs,
		startedAt: null,
		endedAt: null,
		entries: [],
		input: "",
		keypresses: [],
	};
}

/** Kata yang sedang dikejar peserta. */
export function currentWord(state: RunState): string {
	return state.words[state.entries.length] ?? "";
}

export function isFinished(state: RunState): boolean {
	return state.endedAt !== null;
}

export function reduce(state: RunState, event: RunEvent): RunState {
	if (isFinished(state)) return state;

	const startedAt = state.startedAt ?? event.at;
	const at = event.at - startedAt;

	switch (event.type) {
		case "char": {
			// Ketukan pertama menyalakan jam; sesudah itu startedAt tidak berubah.
			const target = currentWord(state);
			const ok = state.input.length < target.length && sameChar(target[state.input.length], event.char);
			return {
				...state,
				startedAt,
				input: state.input + event.char,
				keypresses: [...state.keypresses, { at, ok }],
			};
		}

		case "space": {
			// Spasi di awal kata tidak melakukan apa-apa — tidak mengunci kata kosong.
			if (state.input.length === 0) return state;
			const done = state.entries.length + 1 >= state.words.length;
			const next: RunState = {
				...state,
				startedAt,
				entries: [...state.entries, state.input],
				input: "",
				// Spasi dihitung benar kalau kata sebelumnya diketik utuh dan tepat.
				keypresses: [...state.keypresses, { at, ok: sameWord(state.input, currentWord(state)) }],
			};
			// Kehabisan kata mengakhiri tes lebih awal — jangan biarkan peserta mengetik ke ruang kosong.
			return done ? { ...next, endedAt: event.at } : next;
		}

		case "backspace": {
			if (state.input.length === 0) return state;
			// Backspace tidak dihitung sebagai ketukan: menghapus salah ketik bukan
			// keuntungan maupun hukuman, hanya biaya waktu.
			return {
				...state,
				startedAt,
				input: event.word ? "" : state.input.slice(0, -1),
			};
		}
	}
}

export function finish(state: RunState, at: number): RunState {
	if (isFinished(state)) return state;
	return { ...state, endedAt: at, startedAt: state.startedAt ?? at };
}

/** Sisa waktu dalam milidetik, tidak pernah negatif. */
export function remainingMs(state: RunState, now: number): number {
	if (state.startedAt === null) return state.durationMs;
	const end = state.endedAt ?? now;
	return Math.max(0, state.durationMs - (end - state.startedAt));
}

/**
 * Berapa huruf yang benar dan berapa yang salah, dibandingkan posisi per posisi.
 *
 * Huruf yang seharusnya ada tapi tidak diketik (kata dikunci kependekan) tidak
 * dihitung salah — dia hanya tidak menambah skor. Huruf berlebih di ujung kata
 * dihitung salah.
 */
export function countChars(
	words: string[],
	entries: string[],
	input: string,
): { correct: number; incorrect: number } {
	let correct = 0;
	let incorrect = 0;

	for (let i = 0; i < entries.length; i++) {
		const typed = entries[i] ?? "";
		const target = words[i] ?? "";
		for (let j = 0; j < typed.length; j++) {
			if (sameChar(typed[j], target[j])) correct++;
			else incorrect++;
		}
		// Spasi setelah kata yang benar utuh ikut dihitung sebagai huruf benar.
		if (sameWord(typed, target)) correct++;
		else incorrect++;
	}

	const target = words[entries.length] ?? "";
	for (let j = 0; j < input.length; j++) {
		if (sameChar(input[j], target[j])) correct++;
		else incorrect++;
	}

	return { correct, incorrect };
}

function perSecondWpm(keypresses: Keypress[], elapsedMs: number): number[] {
	const seconds = Math.max(1, Math.round(elapsedMs / 1000));
	const buckets = new Array<number>(seconds).fill(0);
	for (const k of keypresses) {
		if (!k.ok) continue;
		const bucket = Math.min(seconds - 1, Math.floor(k.at / 1000));
		buckets[bucket] = (buckets[bucket] ?? 0) + 1;
	}
	// Huruf benar dalam satu detik → WPM sesaat: (n / 5) * 60.
	return buckets.map((n) => Math.round((n / WORD_LENGTH) * 60));
}

function consistencyOf(series: number[]): number {
	const live = series.filter((v) => v > 0);
	if (live.length < 2) return 0;
	const mean = live.reduce((a, b) => a + b, 0) / live.length;
	if (mean === 0) return 0;
	const variance = live.reduce((a, b) => a + (b - mean) ** 2, 0) / live.length;
	const cv = Math.sqrt(variance) / mean;
	return Math.round(Math.max(0, Math.min(100, (1 - cv) * 100)));
}

export function summarize(state: RunState, now: number): Summary {
	const empty: Summary = {
		wpm: 0,
		rawWpm: 0,
		accuracy: 0,
		correctChars: 0,
		incorrectChars: 0,
		keystrokes: 0,
		elapsedMs: 0,
		wpmSeries: [],
		consistency: 0,
	};
	if (state.startedAt === null) return empty;

	const end = state.endedAt ?? now;
	// Jam berhenti di durasi resmi walau event terakhir datang telat sedikit.
	const elapsedMs = Math.min(state.durationMs, Math.max(0, end - state.startedAt));
	if (elapsedMs <= 0) return empty;

	const minutes = elapsedMs / 60_000;
	const { correct, incorrect } = countChars(state.words, state.entries, state.input);
	const typedChars = state.entries.reduce((n, w) => n + w.length + 1, 0) + state.input.length;
	const okPresses = state.keypresses.filter((k) => k.ok).length;
	const wpmSeries = perSecondWpm(state.keypresses, elapsedMs);

	return {
		wpm: Math.round(correct / WORD_LENGTH / minutes),
		rawWpm: Math.round(typedChars / WORD_LENGTH / minutes),
		accuracy:
			state.keypresses.length === 0
				? 0
				: Math.round((okPresses / state.keypresses.length) * 1000) / 10,
		correctChars: correct,
		incorrectChars: incorrect,
		keystrokes: state.keypresses.length,
		elapsedMs,
		wpmSeries,
		consistency: consistencyOf(wpmSeries),
	};
}
