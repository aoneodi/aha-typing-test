import { useState } from "react";
import { Leaderboard } from "./components/Leaderboard.tsx";
import { type Identity, IdentityForm, loadIdentity } from "./components/IdentityForm.tsx";
import { TypingTest } from "./components/TypingTest.tsx";
import { periodLabel, periodOf } from "./lib/contract.ts";

type Tab = "test" | "board";

export function App() {
	const [tab, setTab] = useState<Tab>("test");
	const [identity, setIdentity] = useState<Identity | null>(loadIdentity);
	const [editing, setEditing] = useState(false);
	const [practice, setPractice] = useState(false);
	// Dinaikkan tiap hasil tersimpan supaya papan memuat ulang saat dibuka.
	const [revision, setRevision] = useState(0);

	const period = periodOf(new Date());

	return (
		<>
			<header className="chrome">
				<div className="chrome-inner">
					<div className="brand">
						Tes Ngetik <span>AHA</span>
					</div>
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
				</div>
			</header>

			<main>
				{tab === "test" ? (
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
