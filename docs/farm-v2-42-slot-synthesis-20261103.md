# 42-slot synthesis UI

Replace species/grade dropdowns with six rows of seven image slots: raw plant plus six pot grades. Every slot remains inspectable when unowned. The selected recipe shows inventory/requirements, coin cost, material cost and first gallery reward. Shared planWorkshopMutation validates source selection and materials; actual Core wallet balance is read via the same-origin authenticated platform proxy. Missing or unknown balance cannot enable synthesis. Transactions retain existing workshop commands and idempotency. The UI never reports success before transact confirms; uncertain results instruct inventory verification.

Existing synthesis recipes, material costs, economy, display handling and server mutations are unchanged. One-hour browser session and authority cleanup fixes remain.

42 thumbnail assets are from the complete farm-v2-small-84.zip Library package, all source PNG CRC checks pass. WebP thumbnails preserve source appearance and alpha. Existing source note: the 5-5 aura has a darker rectangular edge pending art review; no art was regenerated.

Verification: five React interaction tests and three authenticated-wallet bridge tests passed; changed-source syntax checked. Live signed-in visual and financial acceptance remains pending.
