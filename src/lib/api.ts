/** Pembungkus tipis ke endpoint server. */

import type { AttemptPayload, LeaderboardResponse, SubmitResponse } from "./contract.ts";

async function unwrap<T>(res: Response): Promise<T> {
	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		throw new Error(body?.error ?? `Server menjawab ${res.status}.`);
	}
	return (await res.json()) as T;
}

export async function fetchLeaderboard(period?: string): Promise<LeaderboardResponse> {
	const query = period ? `?period=${encodeURIComponent(period)}` : "";
	return unwrap<LeaderboardResponse>(await fetch(`/api/leaderboard${query}`));
}

export async function submitAttempt(payload: AttemptPayload): Promise<SubmitResponse> {
	return unwrap<SubmitResponse>(
		await fetch("/api/attempts", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		}),
	);
}
