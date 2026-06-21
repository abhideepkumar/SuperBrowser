// src/store/useSettingsStore.ts
// Persistent settings store using AsyncStorage.

import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface SettingsState {
  serverUrl: string;
  provider: string;
  model: string;
  loaded: boolean;

  setServerUrl: (url: string) => Promise<void>;
  setProvider: (p: string) => void;
  setModel: (m: string) => void;
  loadSettings: () => Promise<void>;
}

const STORAGE_KEY = "superbrowser_settings";

export const useSettingsStore = create<SettingsState>((set, get) => ({
  serverUrl: "http://192.168.0.114:3000",
  provider: "openai",
  model: "gpt-4o",
  loaded: false,

  setServerUrl: async (url: string) => {
    set({ serverUrl: url });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), serverUrl: url }));
  },

  setProvider: (p) => set({ provider: p }),
  setModel: (m) => set({ model: m }),

  loadSettings: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        set({ ...saved, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },
}));
