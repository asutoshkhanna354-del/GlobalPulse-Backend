import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface NotificationContextType {
  isSupported: boolean;
  isInIframe: boolean;
  permission: NotificationPermission | "loading";
  subscribedSymbols: SubscribedSymbol[];
  isSubscribed: (symbol: string) => boolean;
  toggleSubscription: (symbol: string, symbolLabel: string) => Promise<void>;
  loadingSymbol: string | null;
  errorMessage: string | null;
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
  isInIframe: false,
  permission: "loading",
  subscribedSymbols: [],
  isSubscribed: () => false,
  toggleSubscription: async () => {},
  loadingSymbol: null,
  errorMessage: null,
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

function detectIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

async function getOrRegisterServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const existing = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (existing) return existing as ServiceWorkerRegistration;

    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

    await Promise.race([
      new Promise<void>((resolve) => {
        if (reg.active) { resolve(); return; }
        const sw = reg.installing ?? reg.waiting;
        if (!sw) { resolve(); return; }
        sw.addEventListener("statechange", function handler() {
          if (sw.state === "activated") { sw.removeEventListener("statechange", handler); resolve(); }
        });
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);

    return reg;
  } catch (err) {
    console.error("Service worker registration failed:", err);
    return null;
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [isSupported, setIsSupported] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "loading">("loading");
  const [subscribedSymbols, setSubscribedSymbols] = useState<SubscribedSymbol[]>([]);
  const [loadingSymbol, setLoadingSymbol] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showManager, setShowManager] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  useEffect(() => {
    const inIframe = detectIframe();
    setIsInIframe(inIframe);
    const supported = !inIframe && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
    } else {
      setPermission(inIframe ? "denied" : "denied");
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    fetch(`${baseUrl}/api/push/vapid-public-key`)
      .then(r => r.json())
      .then(d => d.publicKey && setVapidPublicKey(d.publicKey))
      .catch(() => {});
  }, []);

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

  const toggleSubscription = useCallback(
    async (symbol: string, symbolLabel: string) => {
      setErrorMessage(null);

      if (isInIframe) {
        setErrorMessage("Open the app in a new browser tab to enable push notifications.");
        return;
      }

      if (!isSupported) {
        setErrorMessage("Push notifications are not supported in this browser.");
        return;
      }

      if (!vapidPublicKey) {
        setErrorMessage("Notification service not ready. Please try again.");
        return;
      }

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
          return;
        }

        let perm = Notification.permission;
        if (perm === "default") {
          try {
            perm = await Notification.requestPermission();
          } catch {
            perm = await new Promise<NotificationPermission>((resolve) =>
              Notification.requestPermission(resolve)
            );
          }
          setPermission(perm);
        }

        if (perm === "denied") {
          setErrorMessage("Notification permission was denied. Please allow notifications in your browser settings and try again.");
          return;
        }

        if (perm !== "granted") {
          setErrorMessage("Notification permission was not granted.");
          return;
        }

        const reg = await getOrRegisterServiceWorker();
        if (!reg) {
          setErrorMessage("Could not initialise the notification service. Please refresh the page and try again.");
          return;
        }

        let pushSub: PushSubscription | null = null;
        try {
          pushSub = await reg.pushManager.getSubscription();
          if (!pushSub) {
            pushSub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
            });
          }
        } catch (err) {
          console.error("Push subscribe error:", err);
          setErrorMessage("Could not create push subscription. Please try again.");
          return;
        }

        const fp = getBrowserFingerprint();
        const subJson = pushSub.toJSON();

        const resp = await fetch(`${baseUrl}/api/push/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: {
              endpoint: pushSub.endpoint,
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

        if (!resp.ok) {
          setErrorMessage("Failed to save subscription on the server. Please try again.");
          return;
        }

        setSubscribedSymbols(prev => [...prev, { symbol, symbolLabel, createdAt: new Date().toISOString() }]);
      } catch (err) {
        console.error("Push subscription error:", err);
        setErrorMessage("Something went wrong enabling notifications. Please try again.");
      } finally {
        setLoadingSymbol(null);
      }
    },
    [isSupported, isInIframe, isSubscribed, vapidPublicKey],
  );

  return (
    <NotificationContext.Provider
      value={{
        isSupported,
        isInIframe,
        permission,
        subscribedSymbols,
        isSubscribed,
        toggleSubscription,
        loadingSymbol,
        errorMessage,
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
