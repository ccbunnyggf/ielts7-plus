'use client';

import { useEffect } from 'react';

type Plausible = (() => void) & {
  q?: unknown[][];
  init?: (options?: object) => void;
  o?: object;
};

declare global {
  interface Window { plausible?: Plausible }
}

export function PlausibleAnalytics({ scriptUrl }: { scriptUrl: string }) {
  useEffect(() => {
    if (window.location.hostname !== 'ccbunnyggf.github.io' || !window.location.pathname.startsWith('/ielts7-plus/')) return;
    let url: URL;
    try { url = new URL(scriptUrl); } catch { return; }
    if (url.origin !== 'https://plausible.io' || !/^\/js\/pa-[A-Za-z0-9_-]+\.js$/.test(url.pathname) || url.search || url.hash) return;

    const load = () => {
      if (document.querySelector(`script[src="${scriptUrl}"]`)) return;
      const plausible = (window.plausible ?? function (...args: unknown[]) {
        (plausible.q = plausible.q ?? []).push(args);
      }) as Plausible;
      plausible.init = plausible.init ?? ((options = {}) => { plausible.o = options; });
      window.plausible = plausible;
      plausible.init();
      const script = document.createElement('script');
      script.async = true;
      script.src = scriptUrl;
      script.onerror = () => { script.remove(); window.plausible = undefined; };
      document.head.appendChild(script);
    };

    if (document.readyState === 'complete') window.setTimeout(load, 0);
    else window.addEventListener('load', load, { once: true });
  }, [scriptUrl]);

  return null;
}
