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

import { useCallback, useEffect, useRef, useState } from "react";
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
	identity: Identity;
	practice: boolean;
	onSaved: () => void;
};

export function TypingTest({ identity, practice, onSaved }: Props) {
	const [session, setSession] = useState<Session>(newSession);
	const [now, setNow] = useState(() => performance.now());
	const [result, setResult] = useState<SubmitResponse | null>(null);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [capsLock, setCapsLock] = useState(false);

	const inputRef = useRef<HTMLInputElement>(null);
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

		if (practice) {
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

	// Fokus langsung ke kolom ketik supaya peserta bisa mulai tanpa mengeklik dulu.
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Kolom sempat dimatikan saat hasil dikirim; balikkan fokusnya sesudah itu.
	useEffect(() => {
		if (!sending) inputRef.current?.focus();
	}, [sending]);

	function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
		// Skor tidak lagi terpengaruh Caps Lock, tapi peserta tetap perlu tahu
		// tombolnya nyala — mengetik huruf besar terus terasa aneh dan lebih lambat.
		setCapsLock(e.getModifierState("CapsLock"));

		if (finished) return;
		const at = performance.now();

		if (e.key === "Tab") {
			e.preventDefault();
			reset();
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey) {
			if (e.key === "Backspace") {
				e.preventDefault();
				dispatch({ type: "backspace", word: true, at });
			}
			return;
		}
		if (e.key === "Backspace") {
			e.preventDefault();
			dispatch({ type: "backspace", at });
			return;
		}
		if (e.key === " ") {
			e.preventDefault();
			dispatch({ type: "space", at });
			return;
		}
		if (e.key.length === 1) {
			dispatch({ type: "char", char: e.key, at });
		}
	}

	if (result) {
		return (
			<Result
				result={result}
				practice={practice}
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
	const upcoming = run.words.slice(run.entries.length + 1, run.entries.length + 8);

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

			<div className="stage">
				{/* Seluruh kata jadi merah begitu ketikan menyimpang, bukan per huruf. */}
				<div className={`word-now ${wrong ? "wrong" : ""}`}>
					<span className="word-typed">{target.slice(0, run.input.length)}</span>
					<span>{target.slice(run.input.length)}</span>
				</div>
				<div className="word-next">{upcoming.join(" ")}</div>
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
					<span className="kbd">Spasi</span> pindah kata · <span className="kbd">Tab</span> ulang ·{" "}
					<span className="kbd">Ctrl</span> + <span className="kbd">Backspace</span> hapus satu kata
				</span>
				<span>Tempel teks dimatikan.</span>
				{practice && <strong>Mode latihan — hasil tidak masuk papan.</strong>}
			</p>
		</section>
	);
}

function Stat({ label, value }: { label: string; value: string | number }) {
	return (
		<div className="statbox">
			<span className="statbox-label">{label}</span>
			<span className="statbox-value">{value}</span>
		</div>
	);
}
