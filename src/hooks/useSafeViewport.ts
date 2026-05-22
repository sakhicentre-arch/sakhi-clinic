import { useEffect } from 'react';

// Keeps a CSS variable `--app-vh` up to date for the mobile viewport height.
// Use at the top level of the app to stabilize mobile viewport height and
// keyboard resize behavior.
export default function useSafeViewport() {
  useEffect(() => {
    function updateVh() {
      const vh = (window.visualViewport?.height ?? window.innerHeight) * 0.01;
      document.documentElement.style.setProperty('--app-vh', `${vh}px`);
    }

    updateVh();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateVh);
    window.addEventListener('resize', updateVh);

    return () => {
      vv?.removeEventListener('resize', updateVh);
      window.removeEventListener('resize', updateVh);
    };
  }, []);
}
