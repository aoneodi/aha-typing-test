/**
 * Permukaan tes: mengurus fokus, papan ketik, jam mundur, dan pengiriman hasil.
 *
 * Polanya mengikuti ngetikmaya: satu kolom ketik, kata yang sedang dikejar
 * ditampilkan besar di atasnya, dan **seluruh** kata memerah begitu ketikan
 * menyimpang — bukan pewarnaan per huruf.
 *
 * Isi kolom itu dikemudikan mesin, bukan peramban: tiap ketukan dicegah
 * default-nya lalu diubah jadi event, supaya `run.input` tetap satu-satunya
 * sumber kebenaran dan tiap ketukan bisa dihitung untuk akurasi.
 *
 * Semua aturan skor ada di `lib/engine.ts`.
 */

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { submitAttempt } from "../lib/api.ts";
import { DURATION_MS } from "../lib/contract.ts";
import type { SubmitResponse } from "../lib/contract.ts";
import {
	createRun,
	currentWord,
	finish,
	isFinished,
	reduce,
	remainingMs,
	type RunEvent,
	type RunState,
	sameChar,
	sameWord,
	summarize,
} from "../lib/engine.ts";
import { generateWords, newSeed } from "../lib/words.ts";
import type { Identity } from "./IdentityForm.tsx";
import { Result } from "./Result.tsx";

type Session = { seed: string; run: RunState };

function newSession(): Session {
	const seed = newSeed();
	return { seed, run: createRun(generateWords(seed), DURATION_MS) };
}

type Props = {
	/**
	 * Null berarti tidak ada yang ditanyakan namanya — dan karena itu hasilnya
	 * tidak dikirim ke mana pun. Itu keadaan saat papan peringkat dimatikan.
	 */
	identity: Identity | null;
	practice: boolean;
	/** Papan peringkat hidup — kalau tidak, peringkat tidak disebut di layar hasil. */
	showRank: boolean;
	onSaved: () => void;
};

export function TypingTest({ identity, practice, showRank, onSaved }: Props) {
	const [session, setSession] = useState<Session>(newSession);
	const [now, setNow] = useState(() => performance.now());
	const [result, setResult] = useState<SubmitResponse | null>(null);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [capsLock, setCapsLock] = useState(false);

	const inputRef = useRef<HTMLInputElement>(null);
	const frameRef = useRef<HTMLDivElement>(null);
	const blockRef = useRef<HTMLDivElement>(null);
	const activeRef = useRef<HTMLSpanElement>(null);
	const sentFor = useRef<string | null>(null);

	const { run, seed } = session;
	const started = run.startedAt !== null;
	const finished = isFinished(run);

	const dispatch = useCallback((event: RunEvent) => {
		setSession((s) => ({ ...s, run: reduce(s.run, event) }));
	}, []);

	const reset = useCallback(() => {
		setSession(newSession());
		setResult(null);
		setError(null);
		setNow(performance.now());
		if (frameRef.current) frameRef.current.scrollTop = 0;
		inputRef.current?.focus();
	}, []);

	// Jam hanya berdetak selama tes berjalan.
	useEffect(() => {
		if (!started || finished) return;
		const id = setInterval(() => setNow(performance.now()), 100);
		return () => clearInterval(id);
	}, [started, finished]);

	// Waktu habis → kunci hasilnya tepat di detik ke-60, bukan di detik saat tick terakhir.
	useEffect(() => {
		if (!started || finished) return;
		if (remainingMs(run, now) > 0) return;
		setSession((s) => ({
			...s,
			run: finish(s.run, (s.run.startedAt ?? 0) + DURATION_MS),
		}));
	}, [now, run, started, finished]);

	// Selesai → kirim sekali saja per percobaan.
	useEffect(() => {
		if (!finished || sentFor.current === seed) return;
		sentFor.current = seed;

		const summary = summarize(run, performance.now());

		// Tanpa identitas, atau di mode latihan, hasilnya cuma ditampilkan.
		if (practice || identity === null) {
			setResult({ summary, period: "", rank: 0, personalBest: false, flagged: false });
			return;
		}

		setSending(true);
		submitAttempt({
			name: identity.name,
			division: identity.division,
			seed,
			durationMs: DURATION_MS,
			entries: run.entries,
			input: run.input,
			keypresses: run.keypresses,
		})
			.then((res) => {
				setResult(res);
				onSaved();
			})
			.catch((e: Error) => {
				// Hasilnya tetap ditampilkan walau server gagal — usaha peserta tidak hilang.
				setResult({ summary, period: "", rank: 0, personalBest: false, flagged: false });
				setError(e.message);
			})
			.finally(() => setSending(false));
	}, [finished, seed, run, practice, identity, onSaved]);

	/**
	 * Gulir supaya baris yang sedang diketik selalu jadi baris teratas.
	 *
	 * Posisi barisnya diukur dari selisih dua `getBoundingClientRect` induk-anak:
	 * keduanya sama-sama terkena geseran yang sama, jadi selisihnya adalah posisi
	 * tata letak murni — benar walau sedang dianimasikan, dan tidak bergantung
	 * pada elemen mana yang jadi `offsetParent`.
	 */
	useLayoutEffect(() => {
		const frame = frameRef.current;
		const block = blockRef.current;
		const active = activeRef.current;
		if (!frame || !block || !active) return;
		const lineHeight = Number.parseFloat(getComputedStyle(block).lineHeight);
		if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;
		const top = active.getBoundingClientRect().top - block.getBoundingClientRect().top;
		frame.scrollTop = Math.max(0, Math.floor(top / lineHeight) * lineHeight);
	}, [run.entries.length]);

	// Fokus langsung ke kolom ketik supaya peserta bisa mulai tanpa mengeklik dulu.
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Kolom sempat dimatikan saat hasil dikirim; balikkan fokusnya sesudah itu.
	useEffect(() => {
		if (!sending) inputRef.current?.focus();
	}, [sending]);

	function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		// Skor tidak lagi terpengaruh Caps Lock, tapi peserta tetap perlu tahu
		// tombolnya nyala — mengetik huruf besar terus terasa aneh dan lebih lambat.
		setCapsLock(e.getModifierState("CapsLock"));

		if (finished) return;
		const at = performance.now();

		/*
		 * Tab TIDAK lagi mengulang tes. Tombolnya duduk persis di sebelah Q dan A,
		 * jadi satu salah tekan dulu membuang seluruh percobaan yang sedang jalan.
		 *
		 * Tapi juga tidak dibiarkan lewat begitu saja: Tab yang lolos memindahkan
		 * fokus keluar dari kolom, dan ketikan sesudahnya hilang tanpa jejak — lebih
		 * membingungkan daripada mengulang. Jadi ditelan, tapi HANYA selagi tes
		 * berjalan; di luar itu Tab tetap berpindah fokus seperti biasa, supaya yang
		 * memakai papan ketik saja tetap bisa mencapai tombol-tombolnya.
		 */
		if (e.key === "Tab") {
			if (started && !finished) e.preventDefault();
			return;
		}

		// Esc yang mengulang: satu tombol, jauh dari jangkauan tangan saat mengetik.
		if (e.key === "Escape") {
			e.preventDefault();
			reset();
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey) {
			if (e.key === "Backspace") {
				e.preventDefault();
				dispatch({ type: "backspace", word: true, at });
			}
			// Sisanya dibiarkan lewat ke peramban — termasuk Cmd+A, yang memang
			// tugasnya memblok teks, bukan mengubahnya.
			return;
		}

		// Kalau ada yang terblok, itu yang dibuang lebih dulu — sama seperti kolom
		// teks biasa, di mana mengetik di atas blokan menggantikannya.
		const field = e.currentTarget;
		const start = field.selectionStart ?? 0;
		const end = field.selectionEnd ?? 0;
		const blocked = end > start;
		const dropSelection = () => {
			if (blocked) dispatch({ type: "delete-range", start, end, at });
		};

		if (e.key === "Backspace") {
			e.preventDefault();
			if (blocked) dropSelection();
			else dispatch({ type: "backspace", at });
			return;
		}
		if (e.key === " ") {
			e.preventDefault();
			dropSelection();
			dispatch({ type: "space", at });
			return;
		}
		if (e.key.length === 1) {
			// Dicegah supaya peramban tidak ikut menyisipkan hurufnya sendiri:
			// isi kolom ini dikemudikan mesin, dan penyisipan ganda akan menggandakan
			// huruf begitu ada blokan yang diganti.
			e.preventDefault();
			dropSelection();
			dispatch({ type: "char", char: e.key, at });
		}
	}

	if (result) {
		return (
			<Result
				result={result}
				practice={practice}
				showRank={showRank}
				error={error}
				onRetry={reset}
				identity={identity}
			/>
		);
	}

	const live = summarize(run, now);
	const secondsLeft = Math.ceil(remainingMs(run, now) / 1000);
	const target = currentWord(run);
	// Salah = yang diketik bukan lagi awalan kata targetnya. Besar-kecil huruf
	// diabaikan di sini juga, sama seperti aturan skor di mesin.
	const wrong =
		run.input.length > 0 && !target.toLowerCase().startsWith(run.input.toLowerCase());

	return (
		<section className="card">
			<p className="banner warn mobile-warn">
				Tes ini perlu papan ketik fisik — buka dari laptop supaya hasilnya adil.
			</p>

			{capsLock && (
				<p className="banner warn">
					<span className="kbd">Caps Lock</span> nyala. Nilaimu tetap dihitung normal — besar-kecil
					huruf tidak dipedulikan — tapi biasanya lebih enak dimatikan.
				</p>
			)}

			<div className="statbar">
				<Stat label="Raw HPM" value={started ? live.rawHpm : "?"} />
				<Stat label="Koreksi HPM" value={started ? live.correctedHpm : "?"} />
				<Stat label="WPM" value={started ? live.wpm : "?"} />
				<Stat label="Akurasi" value={started ? `${live.accuracy}%` : "?"} />
				<Stat label="Sisa waktu" value={secondsLeft} />
			</div>

			{/* Seluruh teks ditampilkan; kata yang sedang dikejar ditandai di dalamnya,
			    dan berubah merah begitu ketikan menyimpang — bukan per huruf. */}
			<div className="text-frame" ref={frameRef}>
				<div className="text-block" ref={blockRef}>
					{run.words.map((word, i) => {
						const done = i < run.entries.length;
						const current = i === run.entries.length;
						const className = current
							? `tw current ${wrong ? "miss" : ""}`
							: done
								? sameWord(run.entries[i] ?? "", word)
									? "tw done"
									: "tw missed"
								: "tw";
						return (
							// Spasi harus nyata di luar span: teksnya mengalir sebagai kalimat,
							// dan spasi di dalam span akan ikut terwarnai jadi bagian penanda.
							// Kata bisa berulang, jadi kuncinya posisi — daftar ini tidak diurut ulang.
							<Fragment key={`${i}-${word}`}>
								<span className={className} ref={current ? activeRef : undefined}>
									{current ? <CurrentWord target={word} typed={run.input} /> : word}
								</span>{" "}
							</Fragment>
						);
					})}
				</div>
			</div>

			<div className="type-row">
				<input
					className={`type-field ${wrong ? "wrong" : ""}`}
					ref={inputRef}
					type="text"
					value={run.input}
					placeholder="ketik kata disini"
					autoComplete="off"
					autoCorrect="off"
					autoCapitalize="off"
					spellCheck={false}
					disabled={sending}
					onKeyDown={onKeyDown}
					// Nilainya dikemudikan mesin lewat onKeyDown; ini cuma menyenangkan React.
					onChange={() => {}}
					onPaste={(e) => e.preventDefault()}
				/>
				{sending && <span className="saving">Menyimpan hasil…</span>}
			</div>

			<div className="row-actions">
				<button type="button" className="btn btn-gold" onClick={reset}>
					Mulai lagi
				</button>
			</div>

			<p className="foot-note">
				<span>
					<span className="kbd">Spasi</span> pindah kata · <span className="kbd">Esc</span> ulang ·{" "}
					<span className="kbd">Ctrl</span> + <span className="kbd">Backspace</span> hapus satu kata
				</span>
				<span>Tempel teks dimatikan.</span>
				{/* "Tidak dicatat" tetap benar baik papannya hidup maupun mati. */}
				{practice && <strong>Mode latihan — hasil tidak dicatat.</strong>}
			</p>
		</section>
	);
}

/**
 * Kata yang sedang dikejar, huruf per huruf.
 *
 * Huruf yang sudah diketik ditebalkan supaya kelihatan sampai mana; yang salah
 * dimerahkan sendiri-sendiri, jadi peserta tahu huruf mana yang meleset, bukan
 * cuma tahu "ada yang salah".
 *
 * Huruf yang salah ditampilkan sebagai huruf yang **seharusnya** — sama seperti
 * konvensi tes ngetik lain, dan sekaligus memberi tahu ejaan yang benar.
 *
 * Huruf yang **berlebih** dari panjang kata sengaja TIDAK digambar di sini. Dulu
 * digambar, dan akibatnya kata di kotak melebar lalu seluruh teks di belakangnya
 * bergeser — tepat saat kamu sedang mengejarnya. Kelebihannya tetap terlihat di
 * kolom ketik dan tetap dihitung salah; yang hilang cuma geseran tata letaknya.
 */
function CurrentWord({ target, typed }: { target: string; typed: string }) {
	const chars: React.ReactNode[] = [];

	for (let i = 0; i < target.length; i++) {
		const expected = target[i];
		const got = typed[i];
		if (got === undefined) {
			chars.push(
				<span className="ch-todo" key={i}>
					{expected}
				</span>,
			);
		} else {
			// `sameChar` dari mesin, bukan `===` sendiri — dua aturan untuk satu hal
			// itu yang dulu membuat skor benar tapi warnanya merah semua.
			chars.push(
				<span className={sameChar(got, expected) ? "ch-ok" : "ch-bad"} key={i}>
					{expected}
				</span>,
			);
		}
	}

	return <>{chars}</>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
	return (
		<div className="statbox">
			<span className="statbox-label">{label}</span>
			<span className="statbox-value">{value}</span>
		</div>
	);
}
