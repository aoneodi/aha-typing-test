/** Papan peringkat: satu baris per orang, hasil terbaiknya di periode terpilih. */

import { useEffect, useState } from "react";
import { fetchLeaderboard } from "../lib/api.ts";
import {
	type LeaderboardResponse,
	normalizeName,
	periodLabel,
	periodOf,
	TIMEZONE,
} from "../lib/contract.ts";

const dateFormat = new Intl.DateTimeFormat("id-ID", {
	timeZone: TIMEZONE,
	day: "numeric",
	month: "short",
});

const ALL = "all";

type Props = {
	/** Nama peserta di peramban ini — barisnya ditandai. */
	highlight: string | null;
	/** Naik tiap kali ada hasil baru tersimpan, memaksa muat ulang. */
	revision: number;
};

export function Leaderboard({ highlight, revision }: Props) {
	const [period, setPeriod] = useState(() => periodOf(new Date()));
	const [data, setData] = useState<LeaderboardResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let alive = true;
		setLoading(true);
		fetchLeaderboard(period)
			.then((res) => {
				if (!alive) return;
				setData(res);
				setError(null);
			})
			.catch((e: Error) => alive && setError(e.message))
			.finally(() => alive && setLoading(false));
		return () => {
			alive = false;
		};
	}, [period, revision]);

	const me = highlight ? normalizeName(highlight) : null;
	const current = periodOf(new Date());
	// Jumlah percobaan harus mengikuti periode yang sedang dilihat — memakai total
	// seluruh bulan di sebelah "6 peserta" membuat angkanya terbaca salah.
	const attemptsHere =
		data === null
			? 0
			: period === ALL
				? data.totals.attempts
				: (data.periods.find((p) => p.period === period)?.attempts ?? 0);
	// Periode berjalan selalu bisa dipilih, walau belum ada satu pun percobaan.
	const choices = [
		current,
		...(data?.periods.map((p) => p.period).filter((p) => p !== current) ?? []),
	];

	return (
		<section className="card">
			<div className="board-head">
				<div>
					<h2 className="page-title">
						{period === ALL ? "Sepanjang masa" : periodLabel(period)}
					</h2>
					<p className="sub">
						{data
							? `${data.rows.length} peserta · ${attemptsHere} percobaan tercatat`
							: "Memuat…"}
					</p>
				</div>

				<div className="period-picker">
					{choices.map((p) => (
						<button
							type="button"
							key={p}
							className="chip"
							aria-pressed={period === p}
							onClick={() => setPeriod(p)}
						>
							{periodLabel(p)}
						</button>
					))}
					<button
						type="button"
						className="chip"
						aria-pressed={period === ALL}
						onClick={() => setPeriod(ALL)}
					>
						Sepanjang masa
					</button>
				</div>
			</div>

			{error && <p className="banner error">Papan gagal dimuat: {error}</p>}

			{loading && !data && (
				<div>
					<div className="skeleton" />
					<div className="skeleton" />
					<div className="skeleton" />
				</div>
			)}

			{data && data.rows.length === 0 && (
				<div className="empty">
					<strong>Belum ada yang mencoba di periode ini.</strong>
					Buka tab “Tes”, isi nama, lalu ketik selama 60 detik — namamu jadi yang pertama di
					papan.
				</div>
			)}

			{data && data.rows.length > 0 && (
				<div style={{ overflowX: "auto" }}>
					<table>
						<thead>
							<tr>
								<th className="rank">#</th>
								<th>Nama</th>
								<th>Divisi</th>
								<th className="num">WPM</th>
								<th className="num">Akurasi</th>
								<th className="num">Stabil</th>
								<th className="num">Coba</th>
								<th className="num">Tanggal</th>
							</tr>
						</thead>
						<tbody>
							{data.rows.map((row) => (
								<tr
									key={`${row.name}-${row.achievedAt}`}
									className={me && normalizeName(row.name) === me ? "me" : undefined}
								>
									<td className="rank">
										{row.rank <= 3 ? (
											<span
												className={`medal ${row.rank === 1 ? "gold" : row.rank === 2 ? "silver" : "bronze"}`}
											>
												{row.rank}
											</span>
										) : (
											row.rank
										)}
									</td>
									<td style={{ fontWeight: 700 }}>{row.name}</td>
									<td style={{ color: "var(--muted)" }}>{row.division || "—"}</td>
									<td className="num">{row.wpm}</td>
									<td className="num">{row.accuracy}%</td>
									<td className="num">{row.consistency}%</td>
									<td className="num">{row.attempts}</td>
									<td className="num" style={{ color: "var(--muted)", fontWeight: 500 }}>
										{dateFormat.format(new Date(row.achievedAt))}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
