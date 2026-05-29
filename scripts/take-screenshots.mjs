import { chromium } from "playwright";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..");
const SHOTS = path.resolve(ROOT, "product-site/screenshots");

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server not ready after ${timeoutMs}ms`);
}

function startDevServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["vite", "--port", "5199", "--strictPort"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BUILD_TARGET: "public" },
      shell: true,
    });

    let started = false;
    const onData = (chunk) => {
      if (!started && chunk.toString().includes("Local:")) {
        started = true;
        resolve(proc);
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("error", reject);

    setTimeout(() => {
      if (!started) reject(new Error("Dev server did not start in time"));
    }, 30000);
  });
}

function mkGameState(gameId, title, overrides = {}) {
  return {
    gameId,
    title,
    status: null,
    rating: null,
    storyCompleted: false,
    inBacklog: false,
    inWishlist: false,
    source: "finder",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-06-01T00:00:00.000Z",
    ...overrides,
  };
}

const DB_NAME = "games-taste-engine-product";
const DB_VERSION = 2;
const STORE_NAME = "product_state";
const STATE_KEY = "singleton";

async function seedIndexedDB(page, state) {
  await page.evaluate(
    ({ dbName, dbVersion, storeName, stateKey, data }) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, "readwrite");
          const store = tx.objectStore(storeName);
          store.put(data, stateKey);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = (e) => reject(e.target.error);
        };
        req.onerror = (e) => reject(e.target.error);
      });
    },
    { dbName: DB_NAME, dbVersion: DB_VERSION, storeName: STORE_NAME, stateKey: STATE_KEY, data: state }
  );
}

const APP_URL = "http://localhost:5199/app/";

async function main() {
  console.log("Starting dev server...");
  const server = await startDevServer();
  await waitForServer(APP_URL);
  console.log("Dev server ready.");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  try {
    const now = "2025-06-01T12:00:00.000Z";

    // Screenshot 1: Onboarding (fresh state)
    console.log("Taking onboarding screenshot...");
    const onboardingPage = await context.newPage();
    await onboardingPage.goto(APP_URL, { waitUntil: "networkidle" });
    await onboardingPage.waitForTimeout(1500);
    await onboardingPage.screenshot({
      path: path.join(SHOTS, "onboarding.jpg"),
      type: "jpeg",
      quality: 85,
      clip: { x: 0, y: 0, width: 1440, height: 900 },
    });
    await onboardingPage.close();

    // Build seeded game states
    const gameStates = {
      bayonetta: mkGameState("bayonetta", "Bayonetta", { status: "playing", rating: 4.5, updatedAt: now }),
      xenoblade_chronicles_3: mkGameState("xenoblade_chronicles_3", "Xenoblade Chronicles 3", { status: "beaten", rating: 5, updatedAt: now }),
      metroid_dread: mkGameState("metroid_dread", "Metroid Dread", { status: "completed", rating: 4.5, updatedAt: now }),
      metaphor_refantazio: mkGameState("metaphor_refantazio", "Metaphor: ReFantazio", { status: "on_hold", rating: 3.5, updatedAt: now }),
      alan_wake_2: mkGameState("alan_wake_2", "Alan Wake 2", { inBacklog: true, updatedAt: now }),
      senuas_saga_hellblade_ii: mkGameState("senuas_saga_hellblade_ii", "Senua's Saga: Hellblade II", { inWishlist: true, updatedAt: now }),
      disco_elysium: mkGameState("disco_elysium", "Disco Elysium", { status: "abandoned", rating: 4, storyCompleted: true, updatedAt: now }),
      a_plague_tale_requiem: mkGameState("a_plague_tale_requiem", "A Plague Tale: Requiem", { status: "abandoned", rating: 2, updatedAt: now }),
      mass_effect_2: mkGameState("mass_effect_2", "Mass Effect 2", { status: "shelved", rating: 3, updatedAt: now }),
    };

    const profile = {
      summary: "You gravitate toward stylish, story-driven action with clear progression and strong emotional hooks.",
      priorities: {
        story: "high", progression: "high", hook: "high", aesthetic: "high", emotional: "medium", combat: "medium", pace: "medium",
      },
      avoidPatterns: {
        slowStart: false, repetition: true, confusingSystems: false, weakEmotionalPull: true, shallowCombat: false,
      },
      likedGenres: ["stylish_action", "action_jrpg", "metroidvania"],
      avoidedGenres: ["brutal", "soulslike"],
      watchVsPlayRisk: "medium",
      signals: [
        { id: "story-rich", tone: "positive", label: "Story-rich", reason: "You consistently prefer games with strong narrative momentum." },
        { id: "stylish-combat", tone: "positive", label: "Stylish combat", reason: "You pick games with expressive, feel-good combat." },
        { id: "clear-progression", tone: "positive", label: "Clear progression", reason: "You respond to games with transparent goals and advancement." },
        { id: "repetition-risk", tone: "negative", label: "Repetition risk", reason: "Endgame repetition and grinding tend to stall your runs." },
      ],
    };

    const seededState = {
      version: 2,
      user: {
        onboarding: { step: "anchors", platforms: [{ platformId: "pc", status: "available" }, { platformId: "nintendo_switch", status: "available" }, { platformId: "playstation_5", status: "available" }], likedGameIds: ["bayonetta", "xenoblade_chronicles_3", "metroid_dread"] },
        onboardingCompletedAt: "2025-01-15T00:00:00.000Z",
        profile,
        profileOverrides: {},
        gameStates,
        lastUpdatedAt: now,
      },
    };

    // Screenshot 2: Dashboard (Today view)
    console.log("Taking dashboard screenshot...");
    const dashboardPage = await context.newPage();
    await dashboardPage.goto(APP_URL, { waitUntil: "networkidle" });
    await dashboardPage.waitForTimeout(500);
    await seedIndexedDB(dashboardPage, seededState);
    await dashboardPage.reload({ waitUntil: "networkidle" });
    await dashboardPage.waitForTimeout(1500);
    await dashboardPage.screenshot({
      path: path.join(SHOTS, "dashboard.jpg"),
      type: "jpeg",
      quality: 85,
      clip: { x: 0, y: 0, width: 1440, height: 900 },
    });
    await dashboardPage.close();

    // Screenshot 3: Finder with dossier open
    console.log("Taking dossier screenshot...");
    const dossierPage = await context.newPage();
    await dossierPage.goto(APP_URL, { waitUntil: "networkidle" });
    await dossierPage.waitForTimeout(500);
    await seedIndexedDB(dossierPage, seededState);
    await dossierPage.reload({ waitUntil: "networkidle" });
    await dossierPage.waitForTimeout(1000);

    // Click Finder tab
    const finderTab = await dossierPage.$('[data-action="switch-tab"][data-tab="finder"]');
    if (finderTab) {
      await finderTab.click();
      await dossierPage.waitForTimeout(500);
    }

    // Type in finder search
    const searchInput = await dossierPage.$('[data-action="finder-query"]');
    if (searchInput) {
      await searchInput.fill("bayon");
      await dossierPage.waitForTimeout(800);
      // Click on a result to open dossier
      const firstResult = await dossierPage.$('[data-action="inspect-game"]');
      if (firstResult) {
        await firstResult.click();
        await dossierPage.waitForTimeout(800);
      }
    }

    await dossierPage.screenshot({
      path: path.join(SHOTS, "dossier.jpg"),
      type: "jpeg",
      quality: 85,
      clip: { x: 0, y: 0, width: 1440, height: 900 },
    });
    await dossierPage.close();

    console.log("All screenshots taken successfully.");
  } catch (err) {
    console.error("Screenshot error:", err);
  } finally {
    await browser.close();
    server.kill();
  }
}

main();
