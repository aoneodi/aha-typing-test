/** Layar hasil satu percobaan. */

import { periodLabel, type SubmitResponse } from "../lib/contract.ts";
import { type Mistake, sameChar } from "../lib/engine.ts";
import type { Identity } from "./IdentityForm.tsx";

/** Sebanyak ini dulu yang ditampilkan; sisanya cuma dihitung. */
const MISTAKES_SHOWN = 12;

type Props = {
	result: SubmitResponse;
	practice: boolean;
	/** Papan peringkat hidup. Kalau tidak, peringkat dan rekor tidak disebut. */
	showRank: boolean;
	/** Terisi kalau hasil gagal dikirim ke server. */
	error: string | null;
	/** Null saat nama tidak ditanyakan — hasilnya lalu tidak dicatat. */
	identity: Identity | null;
	onRetry: () => void;
};

export function Result({ result, practice, showRank, error, identity, onRetry }: Props) {
	const { summary, rank, personalBest, period, flagged } = result;
	const ranked = showRank && !practice && !error;
	const podium = ranked && rank > 0 && rank <= 3;
	const peak = Math.max(1, ...summary.wpmSeries);

	return (
		<section className="card">
			{error ? (
				<p className="banner error">
					Hasil tidak tersimpan: {error} Angkanya tetap benar — coba lagi kalau mau tercatat.
				</p>
			) : practice ? (
				<p className="banner warn">Latihan selesai — hasil ini tidak dicatat.</p>
			) : identity === null ? (
				/*
				 * Tanpa banner sama sekali.
				 *
				 * Dulu di sini ada "Hasil tidak dicatat selama papan peringkat
				 * dimatikan" — kalimat yang menyebut papan yang justru sedang
				 * disembunyikan, jadi dia memancing pertanyaan alih-alih menjawabnya.
				 * Peserta juga tidak pernah diminta namanya, jadi tidak ada yang perlu
				 * dibantah soal pencatatan: layar ini cukup menunjukkan skornya.
				 */
				null
			) : !showRank ? (
				<p className="banner warn">Selesai — hasilmu tersimpan.</p>
			) : podium ? (
				<p className="banner win">
					Peringkat {rank} di {periodLabel(period)}. {personalBest ? "Rekor pribadi baru." : ""}
				</p>
			) : (
				<p className="banner warn">
					Tercatat di {periodLabel(period)} — peringkat {rank}
					{personalBest ? " · rekor pribadi baru" : ""}.
				</p>
			)}

			<h2 className="page-title">{identity ? `Hasil ${identity.name}` : "Hasil"}</h2>

			{/*
			 * Pasangan CPM-WPM ditaruh di depan dan berdampingan karena begitulah
			 * hasilnya dicatat tiap bulan: "531-106". Kalau angkanya harus dikorek
			 * dari dua kartu terpisah, mencatatnya jadi kerja tambahan.
			 */}
			<p className="score">
				<strong>{summary.correctedHpm}</strong> CPM
				<span className="score-dash">—</span>
				<strong>{summary.wpm}</strong> WPM
			</p>
			<p className="sub">
				{summary.correctWords} kata diketik dengan benar · {summary.correctChars} huruf benar,{" "}
				{summary.incorrectChars} salah, dari {summary.keystrokes} ketukan.
			</p>

			{/* Kosakatanya harus sama dengan bilah statistik saat mengetik — satu
			    aplikasi dua istilah untuk angka yang sama itu membingungkan. */}
			<div className="result-grid">
				{/* Kartu emas menandai kemenangan; tanpa papan peringkat tidak ada
				    kemenangan untuk ditandai. */}
				<div className={`stat ${ranked && (podium || personalBest) ? "win" : ""}`}>
					<div className="stat-value">{summary.wpm}</div>
					<div className="stat-label">WPM</div>
				</div>
				<div className="stat">
					<div className="stat-value">{summary.accuracy}%</div>
					<div className="stat-label">Akurasi</div>
				</div>
				<div className="stat">
					<div className="stat-value">{summary.rawHpm}</div>
					<div className="stat-label">Raw CPM</div>
				</div>
				<div className="stat">
					<div className="stat-value">{summary.correctedHpm}</div>
					<div className="stat-label">Koreksi CPM</div>
				</div>
				<div className="stat">
					<div className="stat-value">{summary.consistency}%</div>
					<div className="stat-label">Kestabilan</div>
				</div>
			</div>

			<div>
				<div className="stat-label">Kecepatan tiap detik</div>
				<div className="chart">
					{summary.wpmSeries.map((v, i) => (
						<span
							// Deret ini panjangnya tetap dan tidak pernah diurut ulang.
							key={i}
							className={v === peak ? "peak" : undefined}
							style={{ height: `${Math.max(2, (v / peak) * 100)}%` }}
							title={`detik ${i + 1}: ${v} wpm`}
						/>
					))}
				</div>
			</div>

			<Mistakes mistakes={summary.mistakes} accuracy={summary.accuracy} />

			{flagged && (
				<p className="banner warn" style={{ marginTop: "1rem" }}>
					Angka ini di luar kebiasaan, jadi ditandai untuk ditinjau. Tetap masuk papan.
				</p>
			)}

			<div className="row-actions">
				<button type="button" className="btn btn-gold" onClick={onRetry}>
					Coba lagi
				</button>
			</div>
		</section>
	);
}

/**
 * Kata-kata yang salah ketik. Angka "15 huruf salah" tidak bisa dipelajari;
 * daftar katanya bisa.
 */
function Mistakes({ mistakes, accuracy }: { mistakes: Mistake[]; accuracy: number }) {
	if (mistakes.length === 0) {
		// Hanya diklaim kalau memang tidak ada yang salah sama sekali.
		return accuracy === 100 ? (
			<p className="mistakes-none">Tidak ada satu pun kata yang salah ketik.</p>
		) : null;
	}

	const shown = mistakes.slice(0, MISTAKES_SHOWN);
	const rest = mistakes.length - shown.length;

	return (
		<div className="mistakes">
			<div className="stat-label">
				Kata yang salah ketik ({mistakes.length})
			</div>
			<ul>
				{shown.map((m, i) => (
					// Kata yang sama bisa salah dua kali; kuncinya urutan kejadian.
					<li key={`${i}-${m.expected}`}>
						<span className="mistake-expected">{m.expected}</span>
						<span className="mistake-said">kamu menulis</span>
						<span className="mistake-typed">
							{m.typed === "" ? <em>(kosong)</em> : <Diff expected={m.expected} typed={m.typed} />}
						</span>
					</li>
				))}
			</ul>
			{rest > 0 && <p className="mistakes-more">…dan {rest} kata lainnya.</p>}
		</div>
	);
}

/** Kata yang diketik, dengan huruf yang meleset ditandai. */
function Diff({ expected, typed }: { expected: string; typed: string }) {
	return (
		<>
			{[...typed].map((ch, i) => (
				// `sameChar` dari mesin, aturan yang sama dengan yang menilai skornya.
				<span key={i} className={sameChar(ch, expected[i]) ? undefined : "ch-bad"}>
					{ch}
				</span>
			))}
		</>
	);
}
