import { planResourceShortfall, type ResourceKind } from "./resourceShortfall";

export function FarmResourceShortfallDialog({
  kind,
  required,
  available,
  onShop,
  onBack,
}: {
  kind: ResourceKind;
  required: number | null;
  available: number | null;
  onShop?: () => void;
  onBack: () => void;
}) {
  const plan = planResourceShortfall(kind, required, available, Boolean(onShop));
  if (plan.kind === "sufficient") return null;
  const { shortfall, actions } = plan;
  return (
    <div
      className="farm-resource-shortfall"
      role="dialog"
      aria-modal="true"
      aria-label={`${shortfall.label}不足`}
      data-resource={shortfall.kind}
      data-missing={shortfall.missing}
    >
      <p>
        {shortfall.label}不足：需要 {shortfall.required}，現有 {shortfall.available}，還缺 {shortfall.missing}
      </p>
      <div>
        {actions.includes("shop") && onShop && (
          <button type="button" aria-label={`前往購買${shortfall.label}`} onClick={onShop}>
            前往購買
          </button>
        )}
        <button type="button" aria-label="返回" onClick={onBack}>
          返回
        </button>
      </div>
    </div>
  );
}
