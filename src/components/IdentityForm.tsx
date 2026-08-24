/**
 * Siapa yang mengetik. Tanpa login — nama dan divisi diingat di peramban peserta
 * supaya bulan depan tinggal buka dan mulai.
 */

import { useState } from "react";

export type Identity = { name: string; division: string };

const STORAGE_KEY = "aha-typing-identity";

/** Ubah daftar ini kalau nama divisi berubah — dia cuma saran, bukan pembatas. */
export const DIVISIONS = [
	"Business Development",
	"Finance",
	"HRD",
	"Marketing",
	"Operations",
	"Partnership",
	"Product",
	"Tech",
	"Warehouse",
];

export function loadIdentity(): Identity | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<Identity>;
		if (typeof parsed.name !== "string" || parsed.name.trim() === "") return null;
		return { name: parsed.name, division: parsed.division ?? "" };
	} catch {
		return null;
	}
}

export function saveIdentity(identity: Identity): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
	} catch {
		// Peramban tanpa penyimpanan lokal tetap boleh ikut tes, cuma harus isi nama lagi.
	}
}

/** Layar ini hanya muncul saat papan peringkat nyala — kalau mati, nama tidak ditanya. */
type Props = {
	initial: Identity | null;
	onDone: (identity: Identity) => void;
	onCancel?: () => void;
};

export function IdentityForm({ initial, onDone, onCancel }: Props) {
	const [name, setName] = useState(initial?.name ?? "");
	const [division, setDivision] = useState(initial?.division ?? "");
	const trimmed = name.trim();

	return (
		<section className="card">
			<h2 className="page-title">Siapa yang mengetik?</h2>
			<p className="sub">
				Dipakai untuk papan peringkat bulan ini. Pakai nama yang sama tiap bulan supaya hasilnya
				nyambung.
			</p>

			<form
				className="identity"
				style={{ marginTop: "1rem", alignItems: "flex-end" }}
				onSubmit={(e) => {
					e.preventDefault();
					if (trimmed === "") return;
					const identity = { name: trimmed, division: division.trim() };
					saveIdentity(identity);
					onDone(identity);
				}}
			>
				<div className="field">
					<label htmlFor="name">Nama</label>
					<input
						id="name"
						type="text"
						value={name}
						maxLength={40}
						autoComplete="off"
						placeholder="Nama panggilan di kantor"
						onChange={(e) => setName(e.target.value)}
					/>
				</div>

				<div className="field">
					<label htmlFor="division">Divisi</label>
					<input
						id="division"
						type="text"
						list="divisions"
						value={division}
						maxLength={40}
						autoComplete="off"
						placeholder="Pilih atau ketik sendiri"
						onChange={(e) => setDivision(e.target.value)}
					/>
					<datalist id="divisions">
						{DIVISIONS.map((d) => (
							<option value={d} key={d} />
						))}
					</datalist>
				</div>

				<button type="submit" className="btn btn-primary" disabled={trimmed === ""}>
					Mulai
				</button>
				{onCancel && (
					<button type="button" className="btn btn-ghost" onClick={onCancel}>
						Batal
					</button>
				)}
			</form>
		</section>
	);
}
