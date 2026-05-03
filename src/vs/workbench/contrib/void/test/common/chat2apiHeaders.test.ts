import assert from 'assert';
import { CHAT2API_CHECKPOINT_HEADER, CHAT2API_SESSION_HEADER, createFetchWithInjectedHeaders } from '../../common/chat2apiHeaders.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Void Chat2API Headers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('injects request headers and captures checkpoint response header', async () => {
		let captured: string | undefined;
		let seenHeaders: Headers | undefined;

		const baseFetch = async (_input: any, init?: any) => {
			seenHeaders = new Headers(init?.headers);
			return new Response('ok', { headers: { [CHAT2API_CHECKPOINT_HEADER]: 'ckpt_123' } });
		};

		const fetchWithHeaders = createFetchWithInjectedHeaders(
			baseFetch,
			{ [CHAT2API_SESSION_HEADER]: 'thread_1' },
			(id) => { captured = id; },
		);

		await fetchWithHeaders('http://example.com', { headers: { Existing: '1' } });

		assert.strictEqual(seenHeaders?.get(CHAT2API_SESSION_HEADER), 'thread_1');
		assert.strictEqual(seenHeaders?.get('Existing'), '1');
		assert.strictEqual(captured, 'ckpt_123');
	});

	test('does not call capture callback when response header missing', async () => {
		let captured: string | undefined;

		const baseFetch = async () => {
			return new Response('ok', { headers: {} });
		};

		const fetchWithHeaders = createFetchWithInjectedHeaders(baseFetch, { [CHAT2API_SESSION_HEADER]: 'thread_1' }, (id) => { captured = id; });

		await fetchWithHeaders('http://example.com');
		assert.strictEqual(captured, undefined);
	});
});
