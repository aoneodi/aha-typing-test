/** Layar hasil satu percobaan. */

import { periodLabel, type SubmitResponse } from "../lib/contract.ts";
import type { Identity } from "./IdentityForm.tsx";

type Props = {
	result: SubmitResponse;
	practice: boolean;
	/** Terisi kalau hasil gagal dikirim ke server. */
	error: string | null;
	identity: Identity;
	onRetry: () => void;
};

export function Result({ result, practice, error, identity, onRetry }: Props) {
	const { summary, rank, personalBest, period, flagged } = result;
	const podium = !practice && !error && rank > 0 && rank <= 3;
	const peak = Math.max(1, ...summary.wpmSeries);

	return (
		<section className="card">
			{error ? (
				<p className="banner error">
					Hasil tidak tersimpan: {error} Angkanya tetap benar — coba lagi kalau mau tercatat.
				</p>
			) : practice ? (
				<p className="banner warn">Latihan selesai — hasil ini tidak masuk papan peringkat.</p>
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

			<h2 className="page-title">Hasil {identity.name}</h2>
			<p className="sub">
				{summary.correctChars} huruf benar, {summary.incorrectChars} salah, dari{" "}
				{summary.keystrokes} ketukan.
			</p>

			<div className="result-grid">
				<div className={`stat ${podium || personalBest ? "win" : ""}`}>
					<div className="stat-value">{summary.wpm}</div>
					<div className="stat-label">kata / menit</div>
				</div>
				<div className="stat">
					<div className="stat-value">{summary.accuracy}%</div>
					<div className="stat-label">akurasi</div>
				</div>
				<div className="stat">
					<div className="stat-value">{summary.rawWpm}</div>
					<div className="stat-label">wpm kotor</div>
				</div>
				<div className="stat">
					<div className="stat-value">{summary.consistency}%</div>
					<div className="stat-label">kestabilan</div>
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
