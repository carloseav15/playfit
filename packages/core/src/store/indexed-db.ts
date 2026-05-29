import { productStateSchema } from "../schemas";
import type { ProductState } from "../types";

const DB_NAME = "playfit";
const DB_VERSION = 2;
const STORE_NAME = "product_state";
const STATE_KEY = "singleton";

export const DEFAULT_PRODUCT_STATE: ProductState = {
  version: DB_VERSION,
  user: {
    onboarding: {
      step: "platforms",
      platforms: [],
      likedGameIds: [],
    },
    onboardingCompletedAt: null,
    profile: null,
    profileOverrides: {},
    gameStates: {},
    lastUpdatedAt: null,
  },
};

export function createInitialState() {
  return JSON.parse(JSON.stringify(DEFAULT_PRODUCT_STATE)) as ProductState;
}

function createRequestPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

async function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
  });
}

export async function loadProductState() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const result = await createRequestPromise(store.get(STATE_KEY));

  database.close();

  if (!result) {
    return createInitialState();
  }

  const parsed = productStateSchema.safeParse(result);
  const state = (parsed.success ? parsed.data : result) as ProductState;
  const defaultState = createInitialState();
  return {
    ...defaultState,
    ...state,
    user: {
      ...defaultState.user,
      ...state.user,
      onboarding: {
        ...defaultState.user.onboarding,
        ...state.user.onboarding,
      },
      profileOverrides: state.user.profileOverrides ?? {},
      gameStates: state.user.gameStates ?? {},
    },
  } satisfies ProductState;
}

export async function saveProductState(state: ProductState) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  await createRequestPromise(store.put(state, STATE_KEY));
  database.close();
}

export async function resetProductState() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  await createRequestPromise(store.put(createInitialState(), STATE_KEY));
  database.close();
}
