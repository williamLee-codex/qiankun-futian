const { chromium } = require(
  process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
    ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + "/playwright"
    : "playwright",
);
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const path = require("node:path");
  const repository = path.resolve(__dirname, "..");
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : {}),
    args: process.env.CHROMIUM_ARGS
      ? JSON.parse(process.env.CHROMIUM_ARGS)
      : ["--no-sandbox"],
    ...(process.env.CHROMIUM_IGNORE_DEFAULT_ARGS
      ? { ignoreDefaultArgs: JSON.parse(process.env.CHROMIUM_IGNORE_DEFAULT_ARGS) }
      : {}),
  });
  const evidence =
    process.env.FARM_V2_EVIDENCE_DIR ??
    path.join(repository, "test-results/farm-v2");
  fs.mkdirSync(evidence, { recursive: true });
  const { spawn } = require("node:child_process");
  const server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--config",
      "vite.config.ts",
      "--host",
      "127.0.0.1",
    ],
    {
      cwd: path.join(repository, "artifacts/qiankun-farm"),
      env: {
        ...process.env,
        PORT: "4174",
        BASE_PATH: "/",
        VITE_FARM_API_BASE_URL: "http://localhost:5000/api",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (d) => {
      if (d.toString().includes("Local:")) resolve();
    });
    server.stderr.on("data", (d) => console.error(d.toString()));
    server.on("exit", (c) => reject(new Error("vite exit " + c)));
  });
  process.on("exit", () => server.kill());
  const outcomes = [];
  const page = await browser.newPage();
  let worldCoordinates = null;
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 900 });
    await page.emulateMedia({
      reducedMotion: width === 320 ? "reduce" : "no-preference",
    });
    page.removeAllListeners("pageerror");
    page.removeAllListeners("console");
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const fontDir = process.env.FARM_V2_FONT_DIR;
    if (fontDir) {
      let fontCss = fs
        .readFileSync(fontDir + "/index.css", "utf8")
        .replaceAll("./files/", "https://test-font.local/");
      const emojiFontDir = process.env.FARM_V2_EMOJI_FONT_DIR;
      if (emojiFontDir)
        fontCss +=
          fs
            .readFileSync(emojiFontDir + "/index.css", "utf8")
            .replaceAll("./files/", "https://test-font.local/emoji/") +
          "\nbody.farm-v2-authenticated{font-family:'Microsoft JhengHei','Noto Sans TC','Noto Emoji',Arial,sans-serif !important;}";
      await page.route("https://fonts.googleapis.com/**", (r) =>
        r.fulfill({ status: 200, contentType: "text/css", body: fontCss }),
      );
      await page.route("https://cdn.jsdelivr.net/**", (r) =>
        r.fulfill({ status: 200, contentType: "text/css", body: "" }),
      );
      await page.route("https://test-font.local/**", (r) =>
        r.fulfill({
          status: 200,
          headers: { "access-control-allow-origin": "*" },
          body: fs.readFileSync(
            new URL(r.request().url()).pathname.startsWith("/emoji/") &&
              emojiFontDir
              ? emojiFontDir +
                  "/files/" +
                  new URL(r.request().url()).pathname.slice(7)
              : fontDir +
                  "/files/" +
                  new URL(r.request().url()).pathname.slice(1),
          ),
        }),
      );
    }
    const sizes = [20, 10, 6, 4, 3, 1];
    const names = [
      "微芒凡土",
      "幽熒沃土",
      "朱砂烈土",
      "曜紫靈土",
      "翡翠聖土",
      "黑金晶土",
    ];
    const snapshot = {
      serverTime: Date.now(),
      pendingMutation: null,
      player: {
        accessState: { historicallyUnlocked: [] },
        farmerState: {
          entitled: true,
          enabledByLand: Object.fromEntries(
            sizes.map((_, i) => [i + 1, false]),
          ),
        },
        chaosSeedState: { pending: 3 },
        warehouseState: {
          seeds: Object.fromEntries(sizes.map((n, i) => [i + 1, n])),
          crops: Object.fromEntries(sizes.map((n, i) => [i + 1, 0])),
        },
      },
      lands: sizes.map((n, i) => ({
        landId: i + 1,
        lifecycle: "EMPTY",
        accessActive: true,
        plantedQuantity: 0,
        plantedAt: null,
        maturesAt: null,
      })),
    };
    const ids = [];
    const purchases = [];
    const coinUnlockIds = [];
    const committedCoinUnlocks = new Set();
    let loseFirstUnlockResponse = true;
    await page.route("http://localhost:5000/api/**", async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (req.method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
          },
        });
      if (req.method() === "POST") {
        ids.push(req.headers()["x-request-id"]);
        const unlockMatch = path.match(/lands\/(2|3)\/unlock/);
        if (unlockMatch) {
          const landId = +unlockMatch[1];
          const requestId = req.headers()["x-request-id"];
          coinUnlockIds.push({ landId, requestId });
          assert.equal(req.postData(), null);
          if (!committedCoinUnlocks.has(requestId)) {
            committedCoinUnlocks.add(requestId);
            snapshot.player.accessState.historicallyUnlocked.push(landId);
            snapshot.lands[landId - 1].accessActive = true;
            snapshot.lands[landId - 1].lifecycle = "EMPTY";
          }
          if (landId === 2 && loseFirstUnlockResponse) {
            loseFirstUnlockResponse = false;
            snapshot.pendingMutation = { requestId, operation: "unlockCoinLand", landId };
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: "{",
            });
          }
          snapshot.pendingMutation = null;
        }
        const purchaseMatch = path.match(/seeds\/(\d+)\/purchase/);
        if (purchaseMatch) {
          const landId = +purchaseMatch[1];
          const packs = req.postDataJSON().packs;
          assert.equal(packs, 3);
          purchases.push({ landId, packs });
          snapshot.player.warehouseState.seeds[landId] +=
            sizes[landId - 1] * packs;
        }
        const farmerMatch = path.match(/lands\/(\d+)\/farmer/);
        if (farmerMatch)
          snapshot.player.farmerState.enabledByLand[+farmerMatch[1]] =
            req.postDataJSON().enabled;
        const match = path.match(/lands\/(\d+)\/(sow|harvest)/);
        if (path.endsWith("/chaos-seeds/claim")) {
          snapshot.player.warehouseState.seeds[6] +=
            snapshot.player.chaosSeedState.pending;
          snapshot.player.chaosSeedState.pending = 0;
        }
        if (match) {
          const id = +match[1];
          const land = snapshot.lands[id - 1];
          if (match[2] === "sow") {
            snapshot.player.warehouseState.seeds[id] -= sizes[id - 1];
            Object.assign(land, {
              lifecycle: "GROWING",
              plantedQuantity: sizes[id - 1],
              plantedAt: new Date().toISOString(),
              maturesAt: new Date(Date.now() + 60000).toISOString(),
            });
          } else {
            snapshot.player.warehouseState.crops[id] += sizes[id - 1] * 6;
            Object.assign(land, {
              lifecycle: "EMPTY",
              plantedQuantity: 0,
              plantedAt: null,
              maturesAt: null,
            });
          }
        }
      }
      snapshot.serverTime = Date.now();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(snapshot),
      });
    });
    await page.goto("http://127.0.0.1:4174/?launchToken=fixture-only");
    await page.getByRole("button", { name: "微芒凡土，待播種" }).waitFor();
    const sceneImage = page.locator('[data-testid="farm-v2-scene"] img');
    await sceneImage.evaluate(async (image) => {
      await image.decode();
    });
    const imageState = await sceneImage.evaluate((image) => ({
      src: image.currentSrc,
      width: image.naturalWidth,
      height: image.naturalHeight,
      renderedWidth: image.width,
      renderedHeight: image.height,
    }));
    assert.equal(
      new URL(imageState.src).pathname,
      `/images/farm/farm-scene-${width >= 640 ? "desktop" : "mobile"}.png`,
    );
    assert.equal(imageState.width, width >= 640 ? 1215 : 941);
    assert.equal(imageState.height, width >= 640 ? 1295 : 1672);
    assert.ok(
      Math.abs(
        imageState.renderedWidth / imageState.renderedHeight -
          imageState.width / imageState.height,
      ) < 0.002,
    );
    const entities = page.locator(".farm-v2-land-entity");
    const readEntities = () =>
      entities.evaluateAll((nodes) =>
        nodes.map((node) => ({
          id: node.getAttribute("data-land-id"),
          x: node.getAttribute("data-world-x"),
          y: node.getAttribute("data-world-y"),
          lifecycle: node.getAttribute("data-lifecycle"),
        })),
      );
    const initialEntities = await readEntities();
    assert.equal(initialEntities.length, 6);
    const coordinates = initialEntities.map(({ id, x, y }) => ({ id, x, y }));
    if (worldCoordinates) assert.deepEqual(coordinates, worldCoordinates);
    else worldCoordinates = coordinates;
    const writesBeforeResize = ids.length;
    await page.setViewportSize({
      width: width >= 640 ? 390 : 768,
      height: 900,
    });
    await page.waitForFunction(
      (expected) =>
        document
          .querySelector('[data-testid="farm-v2-scene"] img')
          .currentSrc.includes(expected),
      width >= 640 ? "mobile" : "desktop",
    );
    assert.deepEqual(await readEntities(), initialEntities);
    assert.equal(ids.length, writesBeforeResize);
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 900 });
    await page.waitForFunction(
      (expected) =>
        document
          .querySelector('[data-testid="farm-v2-scene"] img')
          .currentSrc.includes(expected),
      width >= 640 ? "desktop" : "mobile",
    );
    await page.locator("summary").filter({ hasText: "福田倉庫" }).click();
    const warehouseTable = page.getByRole("table", {
      name: "福田倉庫種子與靈植",
    });
    assert.equal(await warehouseTable.locator("tbody tr").count(), 6);
    for (let id = 1; id <= 6; id++) {
      const row = warehouseTable.locator(`tr[data-land-id="${id}"]`);
      assert.equal(
        await row.locator("td").nth(0).textContent(),
        String(sizes[id - 1]),
      );
      assert.equal(await row.locator("td").nth(1).textContent(), "0");
      await page
        .getByRole("button", { name: `${names[id - 1]}，待播種` })
        .click();
      await page
        .getByRole("button", { name: `${names[id - 1]}，生長中` })
        .waitFor();
      assert.equal(await page.locator(".farm-v2-flight").count(), 0);
      if (id === 1) {
        const growingEntities = await readEntities();
        const writes = ids.length;
        await page.setViewportSize({
          width: width >= 640 ? 390 : 768,
          height: 900,
        });
        await page.waitForFunction(
          (expected) =>
            document
              .querySelector('[data-testid="farm-v2-scene"] img')
              .currentSrc.includes(expected),
          width >= 640 ? "mobile" : "desktop",
        );
        assert.deepEqual(await readEntities(), growingEntities);
        assert.equal(ids.length, writes);
        await page.setViewportSize({
          width,
          height: width === 1440 ? 1000 : 900,
        });
        await page.waitForFunction(
          (expected) =>
            document
              .querySelector('[data-testid="farm-v2-scene"] img')
              .currentSrc.includes(expected),
          width >= 640 ? "desktop" : "mobile",
        );
        if (width === 320)
          await page.screenshot({
            path: `${evidence}/farm-growing-320.png`,
            fullPage: true,
          });
      }

      Object.assign(snapshot.lands[id - 1], {
        lifecycle: "MATURE",
        maturesAt: new Date(Date.now() - 1000).toISOString(),
      });
      await page.getByRole("button", { name: "更新農田", exact: true }).click();
      await page
        .getByRole("button", { name: `${names[id - 1]}，已成熟` })
        .click();
      await page
        .getByRole("button", { name: `${names[id - 1]}，待播種` })
        .waitFor();
      assert.equal(await row.locator("td").nth(0).textContent(), "0");
      assert.equal(
        await row.locator("td").nth(1).textContent(),
        String(sizes[id - 1] * 6),
      );
    }
    await page
      .getByRole("button", { name: "領取混沌種子", exact: true })
      .click();
    await page.getByText("混沌種子已收入倉庫。", { exact: true }).waitFor({ state: "attached" });
    assert.equal(
      await page
        .getByRole("button", { name: "領取混沌種子", exact: true })
        .isDisabled(),
      true,
    );
    assert.equal(snapshot.player.warehouseState.seeds[6], 3);
    assert.equal(
      await warehouseTable
        .locator('tr[data-land-id="6"] td')
        .nth(0)
        .textContent(),
      "3",
    );
    assert.equal(ids.length, 13);
    assert.equal(new Set(ids).size, 13);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    const farmerButton = page.getByRole("button", {
      name: "微芒凡土農夫：OFF",
      exact: true,
    });
    await farmerButton.click();
    await page
      .getByRole("button", { name: "微芒凡土農夫：ON", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "微芒凡土農夫：ON", exact: true })
      .click();
    await page
      .getByRole("button", { name: "微芒凡土農夫：OFF", exact: true })
      .waitFor();
    // Multi-pack entry uses the existing POST contract and changes seeds only.
    // Land 2 is locked to verify that storing seeds does not unlock or sow it.
    snapshot.lands[1].accessActive = false;
    await page.getByRole("button", { name: "更新農田", exact: true }).click();
    for (let id = 1; id <= 5; id++) {
      await page
        .getByRole("button", {
          name: `${names[id - 1]}，${id === 2 ? "尚未解鎖" : "待播種"}`,
          exact: true,
        })
        .click();
      const packsInput = page.getByRole("spinbutton", { name: "購買種子包數" });
      await page.waitForFunction(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const writes = ids.length;
      for (const invalid of ["0", "-1", "1.5"]) {
        await packsInput.fill(invalid);
        const purchaseButton = packsInput.locator("xpath=../..").getByRole("button");
        await purchaseButton.waitFor();
        assert.equal(await purchaseButton.isDisabled(), true);
      }
      assert.equal(ids.length, writes);
      const crops = { ...snapshot.player.warehouseState.crops };
      await packsInput.fill("3");
      await page
        .getByRole("button", { name: "購買 3 包種子（3 金幣）", exact: true })
        .click();
      await page.waitForFunction(
        ({ id, count }) =>
          document.querySelector(`table tr[data-land-id="${id}"] td`)
            ?.textContent === String(count),
        { id, count: sizes[id - 1] * 3 },
      );
      assert.deepEqual(snapshot.player.warehouseState.crops, crops);
      assert.equal(snapshot.lands[id - 1].lifecycle, "EMPTY");
      assert.equal(snapshot.lands[1].accessActive, false);
      assert.equal(await packsInput.isEnabled(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (id === 1) {
        await page.screenshot({ path: `${evidence}/farm-packs-${width}.png`, fullPage: true });
      }
    }
    assert.deepEqual(
      purchases,
      [1, 2, 3, 4, 5].map((landId) => ({ landId, packs: 3 })),
    );
    snapshot.lands[5].accessActive = false;
    await page.getByRole("button", { name: "更新農田", exact: true }).click();
    await page
      .getByRole("button", { name: "黑金晶土，尚未解鎖", exact: true })
      .click();
    assert.equal(
      await page.getByRole("spinbutton", { name: "購買種子包數" }).count(),
      0,
    );
    assert.equal(ids.length, 20);
    assert.equal(new Set(ids).size, 20);
    snapshot.lands[1].accessActive = false;
    snapshot.lands[1].lifecycle = "LOCKED";
    snapshot.lands[2].accessActive = false;
    snapshot.lands[2].lifecycle = "LOCKED";
    snapshot.player.accessState.historicallyUnlocked = [];
    await page.getByRole("button", { name: "更新農田", exact: true }).click();
    await page.getByRole("button", { name: "幽熒沃土，尚未解鎖" }).click();
    await page.getByRole("button", { name: "支付 88 金幣，永久解鎖" }).click();
    await page.getByRole("button", { name: "重試尚未確認的操作（沿用原交易編號）" }).waitFor({ state: "attached" });
    const lostRequestId = ids.at(-1);
    // The production host supplies a fresh launch token after reload; the
    // app strips it from browser history and never persists the credential.
    await page.goto("http://127.0.0.1:4174/?launchToken=fixture-only");
    await page.getByRole("button", { name: "重試尚未確認的操作（沿用原交易編號）" }).waitFor();
    await page.getByRole("button", { name: "重試尚未確認的操作（沿用原交易編號）" }).click();
    await page.getByRole("button", { name: "幽熒沃土，待播種" }).waitFor();
    assert.equal(coinUnlockIds[0].requestId, lostRequestId);
    assert.equal(coinUnlockIds[1].requestId, lostRequestId);
    await page.getByRole("button", { name: "朱砂烈土，尚未解鎖" }).click();
    await page.getByRole("button", { name: "支付 888 金幣，永久解鎖" }).click();
    await page.getByRole("button", { name: "朱砂烈土，待播種" }).waitFor();
    assert.deepEqual(snapshot.player.accessState.historicallyUnlocked.sort(), [2, 3]);
    assert.equal(coinUnlockIds.length, 3);
    assert.equal(new Set(coinUnlockIds.map((item) => item.requestId)).size, 2);
    assert.equal(ids.length, 23);
    assert.equal(new Set(ids).size, 22);
    await page.locator(".farm-v2-flight").waitFor({ state: "detached" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${evidence}/farm-${width}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    outcomes.push({
      width,
      operations: 23,
      multiPackPurchases: purchases,
      consoleErrors: errors.length,
      reducedMotionRequested: width === 320,
      warehouseFlights: "suppressed pending verified anchors",
      source: "browser with intercepted fixture API; not live Core",
    });
  }
  console.log(JSON.stringify(outcomes));
  await browser.close();
  server.kill();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
