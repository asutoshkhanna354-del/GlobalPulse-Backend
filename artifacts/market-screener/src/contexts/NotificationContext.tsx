import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface NotificationContextType {
  isSupported: boolean;
  permission: NotificationPermission | "loading";
  subscribedSymbols: SubscribedSymbol[];
  isSubscribed: (symbol: string) => boolean;
  toggleSubscription: (symbol: string, symbolLabel: string) => Promise<void>;
  loadingSymbol: string | null;
  showManager: boolean;
  setShowManager: (v: boolean) => void;
  vapidPublicKey: string | null;
}

interface SubscribedSymbol {
  symbol: string;
  symbolLabel: string;
  createdAt: string;
}

const NotificationContext = createContext<NotificationContextType>({
  isSupported: false,
  permission: "loading",
  subscribedSymbols: [],
  isSubscribed: () => false,
  toggleSubscription: async () => {},
  loadingSymbol: null,
  showManager: false,
  setShowManager: () => {},
  vapidPublicKey: null,
});

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function getBrowserFingerprint(): string {
  const stored = localStorage.getItem("gp_browser_fp");
  if (stored) return stored;
  const fp = `fp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem("gp_browser_fp", fp);
  return fp;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "loading">("loading");
  const [subscribedSymbols, setSubscribedSymbols] = useState<SubscribedSymbol[]>([]);
  const [loadingSymbol, setLoadingSymbol] = useState<string | null>(null);
  const [showManager, setShowManager] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
    } else {
      setPermission("denied");
    }
  }, []);

  useEffect(() => {
    if (!isSupported) return;
    fetch(`${baseUrl}/api/push/vapid-public-key`)
      .then(r => r.json())
      .then(d => d.publicKey && setVapidPublicKey(d.publicKey))
      .catch(() => {});
  }, [isSupported]);

  useEffect(() => {
    if (!isSupported) return;
    navigator.serviceWorker.ready
      .then(reg => setSwRegistration(reg))
      .catch(() => {});
  }, [isSupported]);

  const loadSubscriptions = useCallback(async () => {
    const fp = getBrowserFingerprint();
    try {
      const resp = await fetch(`${baseUrl}/api/push/subscriptions?fingerprint=${encodeURIComponent(fp)}`);
      if (resp.ok) {
        const data = await resp.json();
        setSubscribedSymbols(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  const isSubscribed = useCallback(
    (symbol: string) => subscribedSymbols.some(s => s.symbol === symbol),
    [subscribedSymbols],
  );

  const getPushSubscription = useCallback(async (): Promise<PushSubscription | null> => {
    if (!swRegistration || !vapidPublicKey) return null;
    try {
      const existing = await swRegistration.pushManager.getSubscription();
      if (existing) return existing;
      const sub = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      return sub;
    } catch {
      return null;
    }
  }, [swRegistration, vapidPublicKey]);

  const toggleSubscription = useCallback(
    async (symbol: string, symbolLabel: string) => {
      if (!isSupported || !vapidPublicKey) return;
      setLoadingSymbol(symbol);

      try {
        if (isSubscribed(symbol)) {
          const fp = getBrowserFingerprint();
          await fetch(`${baseUrl}/api/push/unsubscribe`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol, browserFingerprint: fp }),
          });
          setSubscribedSymbols(prev => prev.filter(s => s.symbol !== symbol));
        } else {
          let perm = Notification.permission;
          if (perm === "default") {
            perm = await Notification.requestPermission();
            setPermission(perm);
          }
          if (perm !== "granted") return;

          const sub = await getPushSubscription();
          if (!sub) return;

          const fp = getBrowserFingerprint();
          const subJson = sub.toJSON();

          await fetch(`${baseUrl}/api/push/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: subJson.keys?.p256dh ?? "",
                  auth: subJson.keys?.auth ?? "",
                },
              },
              symbol,
              symbolLabel,
              browserFingerprint: fp,
            }),
          });

          setSubscribedSymbols(prev => [...prev, { symbol, symbolLabel, createdAt: new Date().toISOString() }]);
        }
      } catch (err) {
        console.error("Push subscription error:", err);
      } finally {
        setLoadingSymbol(null);
      }
    },
    [isSupported, isSubscribed, vapidPublicKey, getPushSubscription],
  );

  return (
    <NotificationContext.Provider
      value={{
        isSupported,
        permission,
        subscribedSymbols,
        isSubscribed,
        toggleSubscription,
        loadingSymbol,
        showManager,
        setShowManager,
        vapidPublicKey,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
