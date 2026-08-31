import { useEffect, useState } from "react";
import logoUrl from "./assets/aha-logo.png";
import { Leaderboard } from "./components/Leaderboard.tsx";
import { type Identity, IdentityForm, loadIdentity } from "./components/IdentityForm.tsx";
import { TypingTest } from "./components/TypingTest.tsx";
import { fetchConfig } from "./lib/api.ts";
import { periodLabel, periodOf } from "./lib/contract.ts";

type Tab = "test" | "board";

export function App() {
	const [tab, setTab] = useState<Tab>("test");
	// Null selama saklarnya belum dibaca — tab papan tidak digambar dulu supaya
	// tidak sempat berkedip muncul lalu hilang.
	const [showBoard, setShowBoard] = useState<boolean | null>(null);
	const [identity, setIdentity] = useState<Identity | null>(loadIdentity);
	const [editing, setEditing] = useState(false);
	const [practice, setPractice] = useState(false);
	// Dinaikkan tiap hasil tersimpan supaya papan memuat ulang saat dibuka.
	const [revision, setRevision] = useState(0);

	const period = periodOf(new Date());

	useEffect(() => {
		// Kalau saklarnya tidak bisa dibaca, papan disembunyikan: lebih baik satu
		// tab hilang daripada tab yang membuka halaman galat.
		fetchConfig()
			.then((c) => setShowBoard(c.leaderboard))
			.catch(() => setShowBoard(false));
	}, []);

	return (
		<>
			<header className="chrome">
				<div className="chrome-inner">
					<div className="brand">
						{/* Lambang AHA. Berlatar gradien — itu logo mereknya, bukan
						    pilihan gaya di dalam aplikasi. */}
						<img className="brand-logo" src={logoUrl} alt="" width={30} height={30} />
						<span>AHA</span> Typing Test
					</div>
					{showBoard && (
						<div className="tabs" role="tablist">
							<button
								type="button"
								role="tab"
								className="tab"
								aria-selected={tab === "test"}
								onClick={() => setTab("test")}
							>
								Tes
							</button>
							<button
								type="button"
								role="tab"
								className="tab"
								aria-selected={tab === "board"}
								onClick={() => setTab("board")}
							>
								Papan Peringkat
							</button>
						</div>
					)}
				</div>
			</header>

			<main>
				{showBoard === null ? null : !showBoard ? (
					/*
					 * Papan peringkat mati → nama tidak ditanya, dan hasilnya tidak
					 * dicatat. Menanyakan nama untuk papan yang tidak ada itu penghalang
					 * tanpa guna, dan mencatat baris tanpa nama diam-diam tidak akan
					 * berguna untuk papan nanti.
					 */
					<TypingTest identity={null} practice={false} showRank={false} onSaved={() => {}} />
				) : tab === "test" ? (
					!identity || editing ? (
						<IdentityForm
							initial={identity}
							onDone={(next) => {
								setIdentity(next);
								setEditing(false);
							}}
							onCancel={identity ? () => setEditing(false) : undefined}
						/>
					) : (
						<>
							<div className="identity">
								<div className="who">
									{identity.name}
									{/* Cabang ini hanya hidup saat papan peringkat nyala, jadi
									    "periode" di sini selalu berarti sesuatu. */}
									<small>
										{identity.division || "Tanpa divisi"} · periode {periodLabel(period)}
									</small>
								</div>
								<button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
									Ganti nama
								</button>
								<label className="foot-note" style={{ marginTop: 0, gap: "0.4rem" }}>
									<input
										type="checkbox"
										checked={practice}
										onChange={(e) => setPractice(e.target.checked)}
									/>
									Mode latihan
								</label>
							</div>

							<TypingTest
								// Ganti mode atau ganti orang = tes baru, bukan lanjutan yang setengah jalan.
								key={`${identity.name}-${practice}`}
								identity={identity}
								practice={practice}
								showRank={showBoard === true}
								onSaved={() => setRevision((r) => r + 1)}
							/>
						</>
					)
				) : (
					<Leaderboard highlight={identity?.name ?? null} revision={revision} />
				)}
			</main>
		</>
	);
}
