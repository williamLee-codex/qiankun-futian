import { useRef, useState } from 'react';

export type CoinDirection = 'to_farm' | 'to_central';
export type CoinBalances = { centralBalance: number; farmBalance: number };
export type CoinConversionReceipt = CoinBalances & {
  status: 'created' | 'duplicate';
  conversionId: string;
};

type Props = {
  balances: CoinBalances;
  onConfirm: (request: {
    conversionId: string;
    direction: CoinDirection;
    amount: number;
  }) => Promise<CoinConversionReceipt>;
  onBalancesChange: (balances: CoinBalances) => void;
  onClose: () => void;
};

const MAX_TRANSFER = 2147483647;

export default function CoinConversionDialog({
  balances, onConfirm, onBalancesChange, onClose,
}: Props) {
  const [direction, setDirection] = useState<CoinDirection>('to_farm');
  const [amount, setAmount] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const pendingRef = useRef(false);
  // Reuse the same ID after a network failure so retry cannot debit twice.
  const requestRef = useRef<{ key: string; id: string } | null>(null);
  const available = direction === 'to_farm' ? balances.centralBalance : balances.farmBalance;
  const valid = Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_TRANSFER && amount <= available;

  function changeAmount(next: number) {
    if (pendingRef.current) return;
    setAmount(Number.isFinite(next) ? Math.max(0, Math.min(MAX_TRANSFER, Math.trunc(next))) : 0);
    setError('');
    setSuccess(false);
  }

  async function confirm() {
    if (!valid || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError('');
    setSuccess(false);
    const key = direction + ':' + amount;
    const id = requestRef.current?.key === key
      ? requestRef.current.id
      : crypto.randomUUID();
    requestRef.current = { key, id };
    try {
      const receipt = await onConfirm({ conversionId: id, direction, amount });
      if (receipt.conversionId !== id ||
          !Number.isSafeInteger(receipt.centralBalance) ||
          !Number.isSafeInteger(receipt.farmBalance) ||
          receipt.centralBalance < 0 || receipt.farmBalance < 0) {
        throw new Error('INVALID_RECEIPT');
      }
      onBalancesChange({
        centralBalance: receipt.centralBalance,
        farmBalance: receipt.farmBalance,
      });
      requestRef.current = null;
      setSuccess(true);
      setAmount(0);
    } catch {
      setError('金幣轉換未完成，請確認餘額後重試');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className="coin-conversion-backdrop" onClick={event => event.stopPropagation()}>
      <section className="coin-conversion-dialog" role="dialog" aria-modal="true" aria-label="金幣轉換">
        <h2>金幣轉換</h2>
        <p>中央金幣：{balances.centralBalance.toLocaleString()}</p>
        <p>福田金幣：{balances.farmBalance.toLocaleString()}</p>
        <label htmlFor="coin-direction">轉換方向</label>
        <select id="coin-direction" value={direction} disabled={pending}
          onChange={event => { setDirection(event.target.value as CoinDirection); changeAmount(0); }}>
          <option value="to_farm">轉入金幣（中央 → 福田）</option>
          <option value="to_central">回存金幣（福田 → 中央）</option>
        </select>
        <label htmlFor="coin-amount">轉換數量</label>
        <div className="coin-conversion-controls">
          <button type="button" disabled={pending} onClick={() => changeAmount(amount - 1)}>−</button>
          <input id="coin-amount" type="number" min="0" max={MAX_TRANSFER} step="1"
            value={amount} disabled={pending}
            onChange={event => changeAmount(Number(event.target.value))} />
          <button type="button" disabled={pending} onClick={() => changeAmount(amount + 1)}>＋</button>
        </div>
        <div className="coin-conversion-steps">
          {[1, 10, 100, 1000].map(step => (
            <button key={step} type="button" disabled={pending}
              onClick={() => changeAmount(amount + step)}>＋{step}</button>
          ))}
        </div>
        <p>可用金幣：{available.toLocaleString()}</p>
        {error && <p role="alert">{error}</p>}
        {success && <p role="status">轉換成功</p>}
        <div className="coin-conversion-actions">
          <button type="button" disabled={pending} onClick={onClose}>取消</button>
          <button type="button" disabled={!valid || pending} onClick={confirm}>
            {pending ? '處理中…' : '確認轉換'}
          </button>
        </div>
      </section>
    </div>
  );
}
