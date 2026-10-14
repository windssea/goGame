import { createContext, useContext } from "react";
export const AppearanceContext = createContext<{
  change: (key: "scene" | "boardMaterial", value: string) => void;
}>({ change: () => {} });
export const useAppearance = () => useContext(AppearanceContext);
