import { loadRawData } from "./data/loaders";
import { normalizeData } from "./data/normalize";
import { createApp } from "./ui/app";

import "./styles/base.css";
import "./styles/shell.css";
import "./styles/content.css";
import "./styles/collections.css";
import "./styles/modal.css";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("The app root container could not be found.");
}

const appRoot = root;
let currentApp: ReturnType<typeof createApp> | null = null;

function renderLoading() {
  appRoot.innerHTML = `
    <main class="boot-state">
      <div class="boot-spinner" aria-hidden="true"></div>
      <p class="eyebrow">Games Library</p>
      <h1>Loading workspace</h1>
      <p>Reading profile, catalog, covers, platform mappings, franchise timelines, upcoming releases, and recommendation history.</p>
    </main>
  `;
}

function showToast(message: string) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toast.setAttribute("role", "status");
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2200);
}

function renderError(message: string) {
  appRoot.innerHTML = `
    <main class="boot-state error">
      <p class="eyebrow">Games Library</p>
      <h1>The app could not be loaded</h1>
      <p>${message}</p>
      <p>Try <code>npm install</code> and then <code>npm run dev</code>.</p>
    </main>
  `;
}

let isInitialBoot = true;

async function boot() {
  currentApp?.destroy();
  renderLoading();

  try {
    const rawData = await loadRawData();
    const appData = normalizeData(rawData);
    currentApp = createApp(appRoot, appData, boot);

    if (!isInitialBoot) {
      showToast("Data refreshed");
    }

    isInitialBoot = false;
  } catch (error) {
    console.error(error);
    currentApp = null;
    renderError(
      error instanceof Error
        ? error.message
        : "An unexpected error occurred while starting the project.",
    );
  }
}

void boot();
