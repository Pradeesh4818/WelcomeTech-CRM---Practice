import React, { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

const CHECK_INTERVAL_MS = 2 * 60 * 1000; // Check every 2 minutes
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
const VERSION_URL = `${BASE}/version.json`;

/**
 * Polls /version.json every 2 minutes.
 * When a new build is detected, shows a persistent toast prompting the user to refresh.
 * This avoids the need for users to manually hard-refresh after a deployment.
 */
export function useAppVersion() {
  const currentVersion = useRef<string | null>(null);
  const toastShown = useRef(false);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    const fetchVersion = async () => {
      try {
        // Cache-bust the version file itself so we always get the latest
        const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;

        const data = await res.json();
        const latestVersion: string = data?.version;

        if (!latestVersion) return;

        if (currentVersion.current === null) {
          // First load — just store the current version, don't show toast
          currentVersion.current = latestVersion;
          return;
        }

        if (latestVersion !== currentVersion.current && !toastShown.current) {
          toastShown.current = true;
          // Use toast.custom() — the correct API for rendering JSX inside a toast
          toast.custom(
            (t) => (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'var(--surface)',
                  color: 'var(--tx-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 13,
                  boxShadow: 'var(--sh-md)',
                  opacity: t.visible ? 1 : 0,
                  transition: 'opacity 0.2s ease',
                }}
              >
                <span>🚀 A new update is available.</span>
                <button
                  onClick={() => {
                    toast.dismiss(t.id);
                    window.location.reload();
                  }}
                  style={{
                    background: 'var(--primary, #6366f1)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Refresh
                </button>
              </div>
            ),
            {
              duration: Infinity, // Keep it visible until user clicks Refresh
              id: 'app-update',
            }
          );
        }
      } catch {
        // Silently ignore network errors — don't disturb the user
      }
    };

    // Run immediately on mount, then on interval
    fetchVersion();
    intervalId = setInterval(fetchVersion, CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);
}
