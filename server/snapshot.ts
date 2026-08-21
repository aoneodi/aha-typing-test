/**
 * Cadangan basis data ke Cloud Storage.
 *
 * Cloud Run tidak punya cakram yang awet: begitu instance mati — dan dia mati
 * sendiri saat sepi — berkas SQLite-nya ikut hilang. Modul ini memulihkan berkas
 * itu saat start dan mengunggahnya lagi sesudah tiap tulis.
 *
 * Mengunggah seluruh berkas tiap kali menulis terdengar kasar, tapi tesnya
 * sekali sebulan dan berkasnya puluhan kilobita — replikasi sungguhan (mis.
 * Litestream) menambah satu biner dan satu proses untuk masalah yang tidak kita
 * punya.
 *
 * Mati sendiri kalau `TYPING_BACKUP_BUCKET` tidak diset, jadi dev lokal tidak
 * pernah menyentuh Cloud Storage.
 */

import type { Database } from "bun:sqlite";
import { unlink } from "node:fs/promises";

const METADATA_TOKEN_URL =
	"http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

type Target = { bucket: string; object: string };

export function backupTarget(): Target | null {
	const bucket = process.env.TYPING_BACKUP_BUCKET;
	if (!bucket) return null;
	return { bucket, object: process.env.TYPING_BACKUP_OBJECT ?? "typing.sqlite" };
}

let cached: { token: string; expiresAt: number } | null = null;

/** Token dari metadata server Cloud Run. Null kalau tidak berjalan di GCP. */
async function accessToken(): Promise<string | null> {
	if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
	try {
		const res = await fetch(METADATA_TOKEN_URL, {
			headers: { "Metadata-Flavor": "Google" },
			signal: AbortSignal.timeout(3_000),
		});
		if (!res.ok) return null;
		const body = (await res.json()) as { access_token?: string; expires_in?: number };
		if (!body.access_token) return null;
		cached = {
			token: body.access_token,
			expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
		};
		return cached.token;
	} catch {
		return null;
	}
}

export type RestoreResult = "restored" | "kosong" | "mati" | "gagal";

/**
 * Tarik berkas basis data dari Cloud Storage ke `path`.
 * Harus dipanggil **sebelum** `openDb`, kalau tidak SQLite sudah memegang berkas
 * kosong yang baru dibuatnya sendiri.
 */
export async function restoreDb(path: string): Promise<RestoreResult> {
	const target = backupTarget();
	if (!target) return "mati";

	const token = await accessToken();
	if (!token) return "gagal";

	const url =
		`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(target.bucket)}` +
		`/o/${encodeURIComponent(target.object)}?alt=media`;

	try {
		const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
		// 404 berarti ini pemakaian pertama — papan memang belum ada isinya.
		if (res.status === 404) return "kosong";
		if (!res.ok) {
			console.error(`Pemulihan gagal: HTTP ${res.status} ${await res.text()}`);
			return "gagal";
		}
		await Bun.write(path, await res.arrayBuffer());
		return "restored";
	} catch (e) {
		console.error("Pemulihan gagal:", e);
		return "gagal";
	}
}

// Unggahan diantrekan: dua penyimpanan yang tumpang-tindih bisa membuat yang
// lebih tua menimpa yang lebih baru.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Unggah salinan basis data. Tidak melempar galat — kegagalan mencadangkan tidak
 * boleh menggagalkan tes yang baru saja diselesaikan peserta.
 */
export function snapshotDb(db: Database, path: string): Promise<void> {
	const target = backupTarget();
	if (!target) return Promise.resolve();

	queue = queue.then(async () => {
		// VACUUM INTO menulis salinan yang utuh dan sudah dipadatkan, jadi tidak
		// perlu ikut memikirkan berkas -wal dan -shm.
		const temp = `${path}.snapshot`;
		try {
			await unlink(temp).catch(() => {});
			db.exec(`VACUUM INTO '${temp.replace(/'/g, "''")}'`);

			const token = await accessToken();
			if (!token) return;

			const url =
				`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(target.bucket)}` +
				`/o?uploadType=media&name=${encodeURIComponent(target.object)}`;

			const res = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/octet-stream",
				},
				body: Bun.file(temp),
			});
			if (!res.ok) console.error(`Pencadangan gagal: HTTP ${res.status} ${await res.text()}`);
		} catch (e) {
			console.error("Pencadangan gagal:", e);
		} finally {
			await unlink(temp).catch(() => {});
		}
	});

	return queue.then(() => undefined);
}
