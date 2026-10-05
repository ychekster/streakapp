/** Habits and settings kept on the device (data/store.ts), redrawn on every change. */

import { useSyncExternalStore } from "react";

import { dataStore, type DataState } from "../data/store";

export function useAppData(): DataState {
  // Started before the first frame: the app opens straight on the kept data, without a
  // flash of the loading screen. Repeated calls do nothing.
  dataStore.start();
  return useSyncExternalStore(dataStore.subscribe, dataStore.getState);
}
