/** UI labels mirror api-server/src/rewards/farmV2Catalog.ts; server decides grants. */
export const signInRewards:readonly string[]=[
 '金幣 ×10','蘊靈砂 ×1','靈田瞬收符 ×1','金幣 ×20','收成雙倍符 ×1',
 '九霄玉髓 ×1','金幣 ×30','靈田保護 1 小時 ×2','黃級盆栽升級符 ×1',
 '水晶 ×1','蘊靈砂 ×2','金幣 ×30','靈田瞬收符 ×2','收成雙倍符 ×2',
 '隨機黃級盆栽 ×1','九霄玉髓 ×2','金幣 ×40','靈田保護 1 小時 ×3',
 '玄級盆栽升級符 ×1','隨機玄級盆栽 ×1','蘊靈砂 ×3','金幣 ×50',
 '收成雙倍符 ×3','九霄玉髓 ×3','水晶 ×2','玄級盆栽升級符 ×1',
 '金幣 ×60','靈田保護 1 小時 ×5','蘊靈砂 ×5','隨機地級盆栽 ×1'
] as const;
if(signInRewards.length!==30)throw new Error('INVALID_SIGNIN_REWARDS');
