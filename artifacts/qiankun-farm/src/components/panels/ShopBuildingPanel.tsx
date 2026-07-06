import { useGame } from '../../game/GameContext';

export default function ShopBuildingPanel() {
  const { state, dispatch } = useGame();

  return (
    <div className="panel-content">
      <h2 className="panel-title">🏛 天道商店</h2>
      <p className="panel-desc">天道垂恩，陳列稀世靈寵供有緣修士取得。</p>

      <div className="shop-section">
        <h3 className="shop-section-title">靈寵商品</h3>
        {state.pets.filter(p => p.acquireType !== 'deposit').map(pet => (
          <div key={pet.id} className="shop-item">
            <div className="shop-item-info">
              <span className="shop-item-name">{pet.name}</span>
              <span className="shop-item-grade">
                {pet.acquireType === 'shop-coins' ? `${pet.acquireCost} 金幣` : `${pet.acquireCost} 水晶`}
              </span>
            </div>
            <div className="shop-item-desc">{pet.description}</div>
            {pet.owned ? (
              <span className="shop-owned">已取得</span>
            ) : (
              <button
                className="pet-btn pet-btn--buy"
                onClick={() => dispatch({ type: 'ACQUIRE_PET', petId: pet.id })}
              >
                購買
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="shop-section">
        <h3 className="shop-section-title">儲值贈送靈寵</h3>
        {state.pets.filter(p => p.acquireType === 'deposit').map(pet => (
          <div key={pet.id} className="shop-item">
            <div className="shop-item-info">
              <span className="shop-item-name">{pet.name}</span>
              <span className="shop-item-grade">儲值 {pet.acquireDepositRequired} 水晶贈送</span>
            </div>
            <div className="shop-item-desc">{pet.description}</div>
            {pet.owned ? (
              <span className="shop-owned">已取得</span>
            ) : (
              <span className="shop-locked">目前儲值 {state.totalDeposit} / {pet.acquireDepositRequired}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
