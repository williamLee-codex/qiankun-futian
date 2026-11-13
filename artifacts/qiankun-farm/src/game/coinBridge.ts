import type { CoinBalances, CoinConversionReceipt, CoinDirection } from '../components/CoinConversionDialog';

export type CoinBridge = {
  loadBalances: () => Promise<CoinBalances>;
  convert: (request: {
    conversionId: string;
    direction: CoinDirection;
    amount: number;
  }) => Promise<CoinConversionReceipt>;
};

/**
 * Browser only calls its own origin. The server must attach the Farm bridge
 * secret and verified launch credential. No secret or launch token in JS.
 * The proxy is intentionally not enabled until server-side authentication is wired.
 */
export function createSameOriginCoinBridge(): CoinBridge {
  async function post<T>(path: string, body: object): Promise<T> {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('COIN_BRIDGE_UNAVAILABLE');
    return response.json() as Promise<T>;
  }
  return {
    loadBalances: async () => {
      const data = await post<CoinBalances>('/api/farm-v2/coin-balances', {});
      if (!Number.isSafeInteger(data.centralBalance) || data.centralBalance < 0 ||
          !Number.isSafeInteger(data.farmBalance) || data.farmBalance < 0) {
        throw new Error('INVALID_BALANCES');
      }
      return data;
    },
    convert: request => post<CoinConversionReceipt>('/api/farm-v2/coin-conversion', request),
  };
}
