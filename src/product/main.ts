import { detectProductRuntimeMode } from "./ai/client";
import { createProductApp } from "./app";
import { loadProductSeedData } from "./data/seeds";
import { loadProductState } from "./store/indexed-db";

import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#product-app");

if (!root) {
  throw new Error("The product app root could not be found.");
}

root.innerHTML = `
  <main class="product-boot">
    <div class="product-spinner" aria-hidden="true"></div>
    <p class="product-eyebrow">Playfit</p>
    <h1>Loading your game concierge</h1>
    <p>Reading seed catalog, local profile state, and recommendation logic.</p>
  </main>
`;

try {
  const [seedData, productState] = await Promise.all([
    loadProductSeedData(),
    loadProductState(),
  ]);
  const runtimeMode = await detectProductRuntimeMode();

  createProductApp(root, seedData, productState, runtimeMode);
} catch (error) {
  console.error(error);
  root.innerHTML = `
    <main class="product-boot product-boot-error">
      <p class="product-eyebrow">Playfit</p>
      <h1>The game concierge could not be loaded</h1>
      <p>${error instanceof Error ? error.message : "Unexpected boot error."}</p>
      <p>Try <code>npm run dev:product</code> for the full local product setup.</p>
    </main>
  `;
}
