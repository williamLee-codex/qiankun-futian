# Coin shortfall panel — desktop and mobile acceptance (round 2)

Panel: `artifacts/qiankun-farm/src/game/v2/coinShortfallNotice.tsx`, rendered with
its real stylesheet and the real 1536×1024 artwork from
`public/images/farm/coin-shortfall-{central,farm}.png`. Each viewport was a real
iframe viewport at the exact size, measured in Chrome with
`getBoundingClientRect` and `document.elementFromPoint` on every button.

| Case | Viewport | Artwork | Buttons found | All reachable | Horizontal overflow |
| --- | --- | --- | --- | --- | --- |
| central short, farm covers | 1920×1080 | `coin-shortfall-central.png` loaded | 取消, 轉換, 關閉 | yes | none |
| farm short, central covers | 1366×768 | `coin-shortfall-farm.png` loaded | 取消, 轉換, 關閉 | yes | none |
| central short, farm covers only 10 of 60 | 390×844 | `coin-shortfall-central.png` loaded | 取消, 關閉 | yes | none |
| farm short, central covers only 10 of 60 | 360×800 | `coin-shortfall-farm.png` loaded | 取消, 關閉 | yes | none |

What this proves:

- The approved artwork is the panel; wording lives in the image alt text and
  matches the approved sentences for each wallet.
- Every rendered hotspot is on top of the artwork and hit-testable, so no
  transparent control is left over dead pixels.
- When the other wallet cannot cover the exact deficit, the convert hotspot is
  not rendered at all, so the player never sees a control that cannot work.
- The panel fits a 360×800 screen without horizontal scrolling or clipped
  artwork.

Not covered by this run: the full authenticated flow that opens the panel from a
real purchase (needs a session on the deployed site), and touch-input gesture
verification on a physical phone. The hotspot geometry above is the same code
path in both cases.
