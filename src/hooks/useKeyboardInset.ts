import { useEffect, useMemo, useState } from 'react';

type KeyboardState = {
  insetPx: number;
  isOpen: boolean;
};

// Computes a best-effort keyboard inset (in px) using VisualViewport.
// Also writes `--keyboard-inset` CSS var on <html> for styling fixed action bars.
export default function useKeyboardInset(): KeyboardState {
  const [insetPx, setInsetPx] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;

    const update = () => {
      const viewportHeight = vv?.height ?? window.innerHeight;
      const offsetTop = vv?.offsetTop ?? 0;
      const rawInset = window.innerHeight - viewportHeight - offsetTop;
      const nextInset = Math.max(0, Math.round(rawInset));
      setInsetPx(nextInset);
      document.documentElement.style.setProperty('--keyboard-inset', `${nextInset}px`);
    };

    update();

    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return useMemo(() => ({ insetPx, isOpen: insetPx >= 80 }), [insetPx]);
}

