import { planCoinShortfall, shortfallImage, type CoinWallet } from "./coinShortfall";

export type PendingOperation = {
  itemId: string;
  quantity: number;
  label: string;
};

export function FarmCoinShortfallDialog({
  paying,
  required,
  payingBalance,
  otherBalance,
  pending,
  onOpenConverter,
  onCancel,
  onClose,
}: {
  paying: CoinWallet;
  required: number | null;
  payingBalance: number | null;
  otherBalance: number | null;
  pending: PendingOperation;
  onOpenConverter: (from: CoinWallet, to: CoinWallet) => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const outcome = planCoinShortfall({ paying, required, payingBalance, otherBalance });
  if (outcome.kind === "sufficient") return null;

  const walletLabel = paying === "central" ? "中央金幣" : "福田金幣";

  return (
    <div
      className="farm-coin-shortfall"
      role="dialog"
      aria-modal="true"
      aria-label={`${walletLabel}不足`}
      data-wallet={paying}
      data-pending-item={pending.itemId}
      data-pending-quantity={pending.quantity}
    >
      <img src={shortfallImage(paying)} alt="" aria-hidden="true" />
      <p>{walletLabel}不足</p>
      {outcome.kind === "blocked" ? (
        <button type="button" onClick={onCancel}>
          返回
        </button>
      ) : (
        <button type="button" onClick={() => onOpenConverter(outcome.from, outcome.to)}>
          轉換金幣
        </button>
      )}
      <button type="button" onClick={onCancel}>
        取消
      </button>
      <button type="button" onClick={onClose}>
        關閉
      </button>
    </div>
  );
}
