self.addEventListener("push", function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "GlobalPulse Signal", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "GlobalPulse Signal";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: `signal-${data.symbol || "unknown"}`,
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.url || "/",
      symbol: data.symbol || "",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) client.navigate(targetUrl);
            return;
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});
