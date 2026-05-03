export const CHAT2API_SESSION_HEADER = 'X-Chat2API-Session';
export const CHAT2API_CHECKPOINT_HEADER = 'X-Chat2API-Checkpoint';

type FetchLike = (input: any, init?: any) => Promise<any>;

const normalizeHeaders = (input: any, init?: any) => {
	const headers = new Headers();

	const inputHeaders = input instanceof Request ? input.headers : undefined;
	if (inputHeaders) {
		new Headers(inputHeaders).forEach((value, key) => headers.set(key, value));
	}

	if (init?.headers) {
		new Headers(init.headers).forEach((value, key) => headers.set(key, value));
	}

	return headers;
};

export const createFetchWithInjectedHeaders = (
	baseFetch: FetchLike,
	extraHeaders: Record<string, string> | undefined,
	onChat2ApiCheckpointId: ((checkpointId: string) => void) | undefined,
): FetchLike => {
	return async (input, init) => {
		let headers = normalizeHeaders(input, init);

		if (extraHeaders) {
			for (const [key, value] of Object.entries(extraHeaders)) {
				if (value === undefined) continue;
				headers.set(key, value);
			}
		}

		const nextInit = init ? { ...init, headers } : { headers };
		const res = await baseFetch(input, nextInit);

		const checkpointId = res?.headers?.get?.(CHAT2API_CHECKPOINT_HEADER);
		if (typeof checkpointId === 'string' && checkpointId) {
			onChat2ApiCheckpointId?.(checkpointId);
		}

		return res;
	};
};

