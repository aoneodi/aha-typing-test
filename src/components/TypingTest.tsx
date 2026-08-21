/**
 * Permukaan tes: mengurus fokus, papan ketik, jam mundur, dan pengiriman hasil.
 *
 * Semua aturan skor ada di `lib/engine.ts`; berkas ini hanya menerjemahkan
 * ketukan tombol jadi event dan menggambar keadaannya.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { submitAttempt } from "../lib/api.ts";
import { DURATION_MS } from "../lib/contract.ts";
import type { SubmitResponse } from "../lib/contract.ts";
import {
	createRun,
	finish,
	isFinished,
	reduce,
	remainingMs,
	type RunEvent,
	type RunState,
	sameChar,
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
	const [offset, setOffset] = useState(0);
	const [capsLock, setCapsLock] = useState(false);

	const frameRef = useRef<HTMLDivElement>(null);
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
		frameRef.current?.focus();
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

	// Geser blok kata supaya baris yang sedang diketik selalu jadi baris teratas.
	useLayoutEffect(() => {
		const el = activeRef.current;
		if (el) setOffset(el.offsetTop);
	}, [run.entries.length]);

	useEffect(() => {
		frameRef.current?.focus();
	}, []);

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

			<div className="hud">
				<div className="hud-item">
					<span className="hud-value clock">{secondsLeft}</span>
					<span className="hud-label">detik</span>
				</div>
				<div className="hud-item">
					<span className="hud-value">{started ? live.wpm : "—"}</span>
					<span className="hud-label">wpm</span>
				</div>
				<div className="hud-item">
					<span className="hud-value">{started ? `${live.accuracy}%` : "—"}</span>
					<span className="hud-label">akurasi</span>
				</div>
				<div className="hud-spacer" />
				<button type="button" className="btn btn-ghost" onClick={reset}>
					Ulang
				</button>
			</div>

			{/* biome-ignore lint/a11y/noNoninteractiveTabindex: petak inilah penangkap ketikannya */}
			<div
				className="words-frame"
				ref={frameRef}
				tabIndex={0}
				onKeyDown={onKeyDown}
				onPaste={(e) => e.preventDefault()}
				onClick={() => frameRef.current?.focus()}
			>
				<div className="words" style={{ transform: `translateY(-${offset}px)` }}>
					{run.words.map((word, i) => (
						<Word
							// Kata bisa berulang, jadi kuncinya posisi — daftar ini tidak pernah diurut ulang.
							key={`${i}-${word}`}
							target={word}
							typed={i < run.entries.length ? (run.entries[i] ?? "") : i === run.entries.length ? run.input : null}
							active={i === run.entries.length}
							ref={i === run.entries.length ? activeRef : undefined}
						/>
					))}
				</div>

				{sending && (
					<div className="veil">
						<span>Menyimpan hasil…</span>
					</div>
				)}
			</div>

			<p className="foot-note">
				<span>
					<span className="kbd">Tab</span> ulang · <span className="kbd">Ctrl</span> +{" "}
					<span className="kbd">Backspace</span> hapus satu kata
				</span>
				<span>Tempel teks dimatikan.</span>
				{practice && <strong>Mode latihan — hasil tidak masuk papan.</strong>}
			</p>
		</section>
	);
}

type WordProps = {
	target: string;
	/** Null kalau kata ini belum disentuh. */
	typed: string | null;
	active: boolean;
	ref?: React.Ref<HTMLSpanElement>;
};

function Word({ target, typed, active, ref }: WordProps) {
	if (typed === null) {
		return (
			<span className="word" ref={ref}>
				{target}
			</span>
		);
	}

	const length = Math.max(target.length, typed.length);
	const chars: React.ReactNode[] = [];

	for (let i = 0; i < length; i++) {
		if (active && i === typed.length) chars.push(<i className="caret" key="caret" />);
		const expected = target[i];
		const got = typed[i];
		if (got === undefined) {
			chars.push(<span key={i}>{expected}</span>);
		} else if (expected === undefined) {
			chars.push(
				<span className="char extra" key={i}>
					{got}
				</span>,
			);
		} else {
			// Pakai `sameChar` dari mesin, bukan `===` sendiri. Sebelumnya baris ini
			// membandingkan huruf dengan aturannya sendiri, jadi Caps Lock membuat
			// semua huruf merah padahal skornya sudah dihitung benar.
			chars.push(
				<span className={sameChar(got, expected) ? "char ok" : "char bad"} key={i}>
					{expected}
				</span>,
			);
		}
	}
	if (active && typed.length >= length) chars.push(<i className="caret" key="caret-end" />);

	return (
		<span className={`word ${active ? "active" : "done"}`} ref={ref}>
			{chars}
		</span>
	);
}
