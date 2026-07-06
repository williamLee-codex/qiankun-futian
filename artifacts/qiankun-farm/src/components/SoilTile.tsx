/**
 * SoilTile – each farm plot rendered as an inline SVG "painted game asset".
 * - Stone-block border via SVG pattern
 * - feTurbulence organic soil texture
 * - Type-specific decorative accents (crystals, plants, veins, etc.)
 * - Gold corner orb posts
 */

interface SoilConfig {
  soilA: string; soilB: string; soilC: string;  // dark → mid → highlight
  seed:  number;
}

const CONFIGS: Record<number, SoilConfig> = {
  0: { soilA:'#3e2200', soilB:'#7a4c08', soilC:'#c49018', seed:3  }, // 微芒凡土
  1: { soilA:'#020818', soilB:'#081e60', soilC:'#1050b0', seed:11 }, // 幽熒沃土
  2: { soilA:'#1e0200', soilB:'#500a04', soilC:'#981408', seed:17 }, // 朱砂烈土
  3: { soilA:'#0c0018', soilB:'#300660', soilC:'#6012a8', seed:23 }, // 曜紫靈土
  4: { soilA:'#020c02', soilB:'#0c3c0c', soilC:'#147020', seed:29 }, // 翡翠聖土
  5: { soilA:'#040300', soilB:'#100c04', soilC:'#201808', seed:37 }, // 黑金晶土
};

/* Soil-type decorative shapes drawn in SVG */
function Accents({ plotId }: { plotId: number }) {
  const W = 200, H = 128, BW = 9;
  const iw = W - BW * 2;   // inner width
  const ih = H - BW * 2;   // inner height
  const ox = BW, oy = BW;  // inner origin

  switch (plotId) {
    case 0: // 微芒凡土 – golden wheat stalks
      return (
        <g opacity="0.75" stroke="#e8c040" strokeWidth="0.9">
          {[0.18,0.38,0.52,0.70,0.85].map((rx, i) => {
            const x = ox + rx * iw, y = oy + ih * 0.75;
            return (
              <g key={i}>
                <line x1={x} y1={y} x2={x - 2} y2={y - 22} strokeWidth="1"/>
                <line x1={x - 2} y1={y - 22} x2={x - 7} y2={y - 30} strokeWidth="0.8"/>
                <line x1={x - 2} y1={y - 22} x2={x + 3} y2={y - 30} strokeWidth="0.8"/>
                <ellipse cx={x - 2} cy={y - 18} rx="4" ry="2" fill="#d4a820" stroke="none" opacity="0.6"/>
              </g>
            );
          })}
        </g>
      );

    case 1: // 幽熒沃土 – blue spirit crystals
      return (
        <g opacity="0.8">
          {([
            [0.18,0.65], [0.35,0.45], [0.55,0.70], [0.72,0.50], [0.85,0.65],
          ] as [number,number][]).map(([rx, ry], i) => {
            const x = ox + rx*iw, y = oy + ry*ih;
            const h = 10 + (i%3)*5;
            return (
              <g key={i}>
                <polygon
                  points={`${x},${y-h} ${x-4},${y} ${x},${y-3} ${x+4},${y}`}
                  fill="#4090e0" stroke="#80d0ff" strokeWidth="0.6" opacity="0.85"/>
                <polygon
                  points={`${x},${y-h} ${x-1.5},${y-h+4} ${x+1.5},${y-h+4}`}
                  fill="#c0e8ff" opacity="0.6" stroke="none"/>
              </g>
            );
          })}
        </g>
      );

    case 2: // 朱砂烈土 – crimson root clusters
      return (
        <g opacity="0.7" stroke="#d83020" strokeWidth="1.2" fill="none">
          {([
            [0.15,0.55], [0.40,0.65], [0.65,0.50], [0.82,0.68],
          ] as [number,number][]).map(([rx,ry], i) => {
            const x = ox + rx*iw, y = oy + ry*ih;
            return (
              <g key={i}>
                <path d={`M${x},${y} Q${x-8},${y-10} ${x-12},${y-18}`} strokeWidth="1.4"/>
                <path d={`M${x},${y} Q${x+6},${y-8} ${x+10},${y-18}`}/>
                <path d={`M${x},${y} Q${x-2},${y-6} ${x},${y-16}`}/>
                <circle cx={x} cy={y} r="2.5" fill="#c83820" stroke="#ff6040" strokeWidth="0.5"/>
              </g>
            );
          })}
        </g>
      );

    case 3: // 曜紫靈土 – violet spirit grass
      return (
        <g opacity="0.75">
          {([
            [0.15,0.72],[0.30,0.58],[0.50,0.74],[0.67,0.55],[0.83,0.70],
          ] as [number,number][]).map(([rx,ry], i) => {
            const x = ox + rx*iw, y = oy + ry*ih;
            return (
              <g key={i}>
                <line x1={x} y1={y} x2={x-4} y2={y-16}
                  stroke="#c060ff" strokeWidth="1.2"/>
                <line x1={x} y1={y} x2={x+5} y2={y-14}
                  stroke="#9040d0" strokeWidth="1"/>
                <line x1={x} y1={y} x2={x} y2={y-18}
                  stroke="#e080ff" strokeWidth="0.9"/>
                <circle cx={x-4} cy={y-16} r="2" fill="#d870ff" opacity="0.9"/>
                <circle cx={x+5} cy={y-14} r="1.8" fill="#a850e8" opacity="0.9"/>
              </g>
            );
          })}
        </g>
      );

    case 4: // 翡翠聖土 – jade moss clusters
      return (
        <g opacity="0.8">
          {([
            [0.15,0.64],[0.32,0.52],[0.50,0.68],[0.68,0.55],[0.84,0.62],
          ] as [number,number][]).map(([rx,ry], i) => {
            const x = ox + rx*iw, y = oy + ry*ih;
            return (
              <g key={i}>
                <ellipse cx={x} cy={y} rx="7" ry="4.5"
                  fill="#18802a" stroke="#40c050" strokeWidth="0.6" opacity="0.85"/>
                <ellipse cx={x-3} cy={y-3} rx="4" ry="3"
                  fill="#22a838" stroke="none" opacity="0.7"/>
                <ellipse cx={x+3} cy={y-2} rx="3.5" ry="2.5"
                  fill="#308840" stroke="none" opacity="0.6"/>
                <circle cx={x} cy={y-5} r="1.8" fill="#80ffb0" opacity="0.5"/>
              </g>
            );
          })}
        </g>
      );

    case 5: // 黑金晶土 – obsidian gold veins
      return (
        <g opacity="0.75">
          {/* Gold vein lines */}
          <path d="M20,60 Q50,45 80,65 Q110,80 140,55 Q160,45 185,60"
            stroke="#c08820" strokeWidth="1.5" fill="none" opacity="0.6"/>
          <path d="M25,85 Q60,75 95,90 Q120,100 155,80 Q170,72 188,82"
            stroke="#a07018" strokeWidth="1" fill="none" opacity="0.5"/>
          {/* Gold crystal fragments */}
          {([
            [30,50],[75,68],[115,45],[155,70],[170,55],
          ] as [number,number][]).map(([x,y],i) => (
            <polygon key={i}
              points={`${x},${y-6} ${x-4},${y} ${x+4},${y} ${x+2},${y+3} ${x-2},${y+3}`}
              fill="#d4a020" stroke="#f0c840" strokeWidth="0.5" opacity="0.85"/>
          ))}
        </g>
      );

    default: return null;
  }
}

interface Props {
  plotId: number;
  locked: boolean;
}

export default function SoilTile({ plotId, locked }: Props) {
  const cfg = CONFIGS[plotId] ?? CONFIGS[0];
  const W = 200, H = 128, BW = 9;

  const gradId    = `sg${plotId}`;
  const lockGId   = `slk${plotId}`;
  const filterId  = `sf${plotId}`;
  const brickId   = `sbk${plotId}`;
  const orbId     = `sob${plotId}`;
  const stHiId    = `ssh${plotId}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%" height="100%"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        {/* Soil colour gradient */}
        <linearGradient id={gradId} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%"   stopColor={cfg.soilC}/>
          <stop offset="45%"  stopColor={cfg.soilB}/>
          <stop offset="100%" stopColor={cfg.soilA}/>
        </linearGradient>

        {/* Locked soil (very dark) */}
        <linearGradient id={lockGId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#1a1410"/>
          <stop offset="100%" stopColor="#0a0806"/>
        </linearGradient>

        {/* Organic texture filter */}
        {!locked && (
          <filter id={filterId} x="-2%" y="-2%" width="104%" height="104%"
            colorInterpolationFilters="sRGB">
            {/* Large-scale noise for dirt clumps */}
            <feTurbulence type="fractalNoise"
              baseFrequency="0.035 0.055" numOctaves="5"
              seed={cfg.seed} result="bigNoise"/>
            {/* Create a darker/lighter mask from the noise */}
            <feColorMatrix type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 4.5 -1.8"
              in="bigNoise" result="darkMask" />
            {/* Subtract/add areas to source */}
            <feComposite in="SourceGraphic" in2="darkMask"
              operator="arithmetic" k1="0" k2="1" k3="-0.4" k4="0.06"
              result="darkened"/>
            {/* Fine grain */}
            <feTurbulence type="turbulence"
              baseFrequency="0.22 0.33" numOctaves="2"
              seed={cfg.seed + 7} result="grain"/>
            <feColorMatrix type="matrix"
              values="0 0 0 0 0.6  0 0 0 0 0.6  0 0 0 0 0.6  0 0 0 0.09 0"
              in="grain" result="grainA"/>
            <feBlend in="darkened" in2="grainA" mode="screen"/>
          </filter>
        )}

        {/* Stone brick border pattern */}
        <pattern id={brickId} x="0" y="0" width="22" height="11"
          patternUnits="userSpaceOnUse">
          {/* stone highlight */}
          <linearGradient id={stHiId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#fff" stopOpacity="0.3"/>
            <stop offset="55%"  stopColor="#fff" stopOpacity="0"/>
            <stop offset="100%" stopColor="#000" stopOpacity="0.25"/>
          </linearGradient>
          {/* Even brick row */}
          <rect x="0.5" y="0.5" width="20" height="4.6" rx="0.7"
            fill="#7a6438" stroke="#3a2c0c" strokeWidth="0.55"/>
          <rect x="0.5" y="0.5" width="20" height="4.6" rx="0.7"
            fill={`url(#${stHiId})`} opacity="0.9"/>
          {/* Odd brick row (offset) */}
          <rect x="11.5" y="6.0" width="20" height="4.6" rx="0.7"
            fill="#6a5428" stroke="#3a2c0c" strokeWidth="0.55"/>
          <rect x="-10.5" y="6.0" width="20" height="4.6" rx="0.7"
            fill="#6a5428" stroke="#3a2c0c" strokeWidth="0.55"/>
          <rect x="11.5" y="6.0" width="20" height="4.6"
            fill={`url(#${stHiId})`} opacity="0.7"/>
        </pattern>

        {/* Gold orb radial gradient */}
        <radialGradient id={orbId} cx="33%" cy="28%" r="68%">
          <stop offset="0%"   stopColor="#fff8c0"/>
          <stop offset="38%"  stopColor="#f0c030"/>
          <stop offset="100%" stopColor="#603808"/>
        </radialGradient>
      </defs>

      {/* ── Stone border ── */}
      <rect x="0" y="0" width={W} height={H}
        fill={`url(#${brickId})`}/>
      {/* Dark outer edge */}
      <rect x="0" y="0" width={W} height={H} rx="2.5"
        fill="none" stroke="#22180a" strokeWidth="1.4"/>

      {/* ── Soil interior ── */}
      <rect x={BW} y={BW} width={W-BW*2} height={H-BW*2}
        rx="1.5"
        fill={`url(#${locked ? lockGId : gradId})`}
        filter={locked ? undefined : `url(#${filterId})`}/>

      {/* Inner border shadow for depth */}
      <rect x={BW} y={BW} width={W-BW*2} height={H-BW*2} rx="1.5"
        fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth="4"/>

      {/* ── Soil furrow lines (unlocked only) ── */}
      {!locked && (
        <g stroke="rgba(0,0,0,0.20)" strokeWidth="0.9">
          {[18,26,34,42,50,58,66,74,82,90,98,108,116].map(y => (
            <line key={y} x1={BW+4} y1={y} x2={W-BW-4} y2={y}/>
          ))}
        </g>
      )}

      {/* ── Type-specific decorative accents ── */}
      {!locked && <Accents plotId={plotId}/>}

      {/* ── Top subtle inner glow ── */}
      {!locked && (
        <rect x={BW} y={BW} width={W-BW*2} height={20} rx="1"
          fill={`url(#${gradId})`} opacity="0.25"/>
      )}

      {/* ── Gold corner orbs ── */}
      {([
        [BW/2, BW/2],
        [W-BW/2, BW/2],
        [BW/2, H-BW/2],
        [W-BW/2, H-BW/2],
      ] as [number,number][]).map(([cx,cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={5.8}
            fill={`url(#${orbId})`}
            stroke="#b87818" strokeWidth="0.8"/>
          <circle cx={cx-1.5} cy={cy-1.5} r={2}
            fill="rgba(255,252,200,0.65)"/>
        </g>
      ))}

      {/* ── Centre-top post (unlocked) ── */}
      {!locked && (
        <g transform={`translate(${W/2},${BW})`}>
          <rect x="-2" y="-5" width="4" height="8" rx="1" fill="#a06818"/>
          <circle cy="-6" r="3.4"
            fill={`url(#${orbId})`} stroke="#f0d040" strokeWidth="0.5"/>
          <circle cx="-1" cy="-7" r="1.4" fill="rgba(255,252,200,0.7)"/>
        </g>
      )}
    </svg>
  );
}
