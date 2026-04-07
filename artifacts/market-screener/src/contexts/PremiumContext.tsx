import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface PremiumContextType {
  isPremium: boolean;
  activateKey: (key: string) => boolean;
  deactivate: () => void;
  showActivation: boolean;
  setShowActivation: (v: boolean) => void;
}

const PremiumContext = createContext<PremiumContextType>({
  isPremium: false,
  activateKey: () => false,
  deactivate: () => {},
  showActivation: false,
  setShowActivation: () => {},
});

const VALID_KEYS = ["ADMIN"];
const STORAGE_KEY = "gp_premium_key";

export function PremiumProvider({ children }: { children: ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [showActivation, setShowActivation] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_KEYS.includes(stored.toUpperCase())) {
      setIsPremium(true);
    }
  }, []);

  const activateKey = (key: string): boolean => {
    if (VALID_KEYS.includes(key.toUpperCase().trim())) {
      localStorage.setItem(STORAGE_KEY, key.toUpperCase().trim());
      setIsPremium(true);
      setShowActivation(false);
      return true;
    }
    return false;
  };

  const deactivate = () => {
    localStorage.removeItem(STORAGE_KEY);
    setIsPremium(false);
  };

  return (
    <PremiumContext.Provider value={{ isPremium, activateKey, deactivate, showActivation, setShowActivation }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  return useContext(PremiumContext);
}
