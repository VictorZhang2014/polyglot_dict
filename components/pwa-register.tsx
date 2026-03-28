"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const unregisterAll = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));

      if ("caches" in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((key) => window.caches.delete(key)));
      }
    };

    if (process.env.NODE_ENV !== "production") {
      unregisterAll().catch(() => {
        // Ignore cleanup failures in development.
      });
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/service-worker.js");
      } catch {
        // Keep silent; app should still work without SW.
      }
    };

    register();
  }, []);

  return null;
}
