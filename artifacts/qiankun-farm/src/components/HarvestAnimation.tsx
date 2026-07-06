/**
 * HarvestAnimation Component — Game Scene Layer 3
 *
 * Flying crop animations: plot → 氣運倉庫.
 * All coordinates are % of the 9:16 gc canvas.
 * Calibrated to the new background image (941×1672).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useGame } from '../game/GameContext';
import type { HarvestAnim } from '../game/types';

/* Plot centers (% of 9:16 canvas). center = left + width/2, top + height/2 */
const PLOT_CENTERS: { x: number; y: number }[] = [
  { x: 8    + 24   / 2, y: 44 + 13 / 2 },  // 微芒凡土
  { x: 34.5 + 27   / 2, y: 44 + 13 / 2 },  // 幽熒沃土
  { x: 64   + 28   / 2, y: 44 + 13 / 2 },  // 朱砂烈土
  { x: 5    + 28   / 2, y: 58 + 14 / 2 },  // 曜紫靈土
  { x: 36   + 25   / 2, y: 58 + 14 / 2 },  // 翡翠聖土
  { x: 64   + 31   / 2, y: 58 + 14 / 2 },  // 黑金晶土
];

/* Target: center of 氣運倉庫 on the left (% of 9:16 canvas) */
const WAREHOUSE = { x: 11.5, y: 27 };
const ANIM_DURATION = 750;

export default function HarvestAnimation() {
  const { state, dispatch } = useGame();
  const { harvestAnimations } = state;
  const [warehouseGlow, setWarehouseGlow] = useState(false);

  const triggerGlow = useCallback(() => {
    setWarehouseGlow(true);
    setTimeout(() => setWarehouseGlow(false), 700);
  }, []);

  const handleDone = useCallback((id: number) => {
    dispatch({ type: 'CLEAR_HARVEST_ANIM', ids: [id] });
    triggerGlow();
  }, [dispatch, triggerGlow]);

  if (!harvestAnimations.length && !warehouseGlow) return null;

  return (
    <>
      {warehouseGlow && <div className="warehouse-glow-ring" />}
      {harvestAnimations.map(anim => {
        const start = PLOT_CENTERS[anim.plotIndex] ?? PLOT_CENTERS[0];
        return (
          <FlyingCrop
            key={anim.id}
            anim={anim}
            startX={start.x}
            startY={start.y}
            endX={WAREHOUSE.x}
            endY={WAREHOUSE.y}
            onDone={handleDone}
          />
        );
      })}
    </>
  );
}

interface FlyingCropProps {
  anim: HarvestAnim;
  startX: number; startY: number;
  endX: number;   endY: number;
  onDone: (id: number) => void;
}

function FlyingCrop({ anim, startX, startY, endX, endY, onDone }: FlyingCropProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    let raf: number;
    let t0: number | null = null;

    const tick = (ts: number) => {
      if (t0 === null) t0 = ts;
      const elapsed = ts - t0 - anim.delay;
      if (elapsed < 0) { el.style.opacity = '0'; raf = requestAnimationFrame(tick); return; }
      const p = Math.min(elapsed / ANIM_DURATION, 1);
      const e = 1 - (1 - p) * (1 - p); // ease-out quadratic
      const cx = startX + (endX - startX) * e;
      const arcH = Math.abs(startY - endY) * 0.6 + 15;
      const arcY = arcH * 4 * p * (1 - p);
      const cy = startY + (endY - startY) * e - arcY;
      const scale   = 1.2 - p * 0.9;
      const opacity = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
      el.style.left      = `${cx}%`;
      el.style.top       = `${cy}%`;
      el.style.transform = `translate(-50%,-50%) scale(${scale})`;
      el.style.opacity   = String(opacity);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else if (!fired.current) {
        fired.current = true;
        onDone(anim.id);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [anim.id, anim.delay, startX, startY, endX, endY, onDone]);

  return (
    <div
      ref={elRef}
      style={{
        position: 'absolute',
        left: `${startX}%`, top: `${startY}%`,
        transform: 'translate(-50%,-50%)',
        opacity: 0,
        fontSize: 'clamp(18px, 3.5vmin, 28px)',
        zIndex: 500,
        pointerEvents: 'none',
        userSelect: 'none',
        filter: 'drop-shadow(0 0 6px rgba(255,220,80,.9))',
      }}
    >
      🌾
    </div>
  );
}
