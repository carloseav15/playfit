document.documentElement.classList.add("theme-dark");

import { createProductApp } from "./app";
import { loadProductSeedData } from "./data/seeds";
import { loadProductState } from "./store/indexed-db";

import "./styles/reset.css";
import "./styles/shell.css";
import "./styles/shared.css";
import "./styles/onboarding.css";
import "./styles/dossier.css";
import "./styles/library.css";
import "./styles/profile.css";
import "./styles/upcoming.css";
import "./styles/responsive.css";

const root = document.querySelector<HTMLDivElement>("#product-app");

if (!root) {
  throw new Error("The product app root could not be found.");
}

root.innerHTML = `
  <main class="product-boot">
    <div class="product-spinner" aria-hidden="true"></div>
    <p class="product-eyebrow">Playfit</p>
    <h1>Loading Playfit</h1>
    <p>Reading game catalog and your saved profile.</p>
  </main>
`;

try {
  const [seedData, productState] = await Promise.all([loadProductSeedData(), loadProductState()]);

  createProductApp(root, seedData, productState);
} catch (error) {
  console.error(error);
  root.innerHTML = `
    <main class="product-boot product-boot-error">
      <p class="product-eyebrow">Playfit</p>
      <h1>Playfit could not be loaded</h1>
      <p>${error instanceof Error ? error.message : "Unexpected boot error."}</p>
    </main>
  `;
}
