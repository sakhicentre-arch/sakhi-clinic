import React, { useEffect, useState } from "react";
import useSafeViewport from '../../hooks/useSafeViewport';

interface LayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

interface SplitPaneProps extends LayoutProps {
  axis?: "horizontal" | "vertical";
}

export function AppViewportFrame({
  children,
  className,
  style,
  ...props
}: LayoutProps): React.ReactElement {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useSafeViewport();

  return (
    <main
      className={className}
      style={{
        marginLeft: isMobile ? 0 : '64px',
        minHeight: isMobile
          ? 'calc(var(--app-vh, 1vh) * 100 - 59px - 80px - env(safe-area-inset-bottom, 0px))'
          : 'calc(var(--app-vh, 1vh) * 100 - 59px)',
        width: isMobile ? '100%' : 'calc(100% - 64px)',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc',
        paddingTop: isMobile ? 'env(safe-area-inset-top, 0px)' : 0,
        paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom, 0px))' : 0,
        overflowX: 'hidden',
        boxSizing: 'border-box',
        ...style,
      }}
      {...props}
    >
      {children}
    </main>
  );
}

export function SplitPane({
  children,
  axis = "horizontal",
  className,
  style,
  ...props
}: SplitPaneProps): React.ReactElement {
  return (
    <div
      className={className}
      {...props}
      style={{
        display: "flex",
        flexDirection: axis === "vertical" ? "column" : "row",
        width: "100%",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function ScrollRegion({
  children,
  className,
  style,
  ...props
}: LayoutProps): React.ReactElement {
  return (
    <div
      className={className}
      {...props}
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PullToRefreshScrollRegion({
  children,
  className,
  style,
  onRefresh,
  disabled,
  ...props
}: LayoutProps & {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
}): React.ReactElement {
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = React.useRef<number | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const threshold = 56;
  const maxPull = 92;
  const armed = pullPx >= threshold;
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const reset = () => {
    startYRef.current = null;
    setPullPx(0);
  };

  const runRefresh = async () => {
    if (refreshing || disabled) return;
    setRefreshing(true);
    setPullPx(threshold);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      reset();
    }
  };

  return (
    <div
      ref={scrollRef}
      className={className}
      {...props}
      onTouchStart={(e) => {
        if (disabled || refreshing) return;
        const el = scrollRef.current;
        if (!el) return;
        if (el.scrollTop > 0) return;
        startYRef.current = e.touches[0]?.clientY ?? null;
      }}
      onTouchMove={(e) => {
        if (disabled || refreshing) return;
        const el = scrollRef.current;
        if (!el) return;
        if (el.scrollTop > 0) return;
        if (startYRef.current == null) return;
        const y = e.touches[0]?.clientY ?? startYRef.current;
        const dy = Math.max(0, y - startYRef.current);
        if (dy <= 0) return;
        e.preventDefault();
        setPullPx(Math.min(maxPull, Math.round(dy * 0.65)));
      }}
      onTouchEnd={() => {
        if (disabled) return;
        if (refreshing) return;
        if (armed) {
          void runRefresh();
          return;
        }
        reset();
      }}
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorY: "contain",
        ...style,
      }}
    >
      <div
        style={{
          height: pullPx,
          display: "grid",
          placeItems: "end center",
          transition: prefersReducedMotion
            ? "none"
            : refreshing
              ? "height 180ms cubic-bezier(0.2, 0.8, 0.2, 1)"
              : "height 120ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        <div
          style={{
            height: 28,
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "var(--muted, #64748b)",
            fontSize: 12,
            fontWeight: 900,
            padding: "0 12px",
            borderRadius: 999,
            border: "1px solid rgba(226, 232, 240, 0.9)",
            background: "rgba(2, 6, 23, 0.02)",
            transform: `translateY(${Math.min(8, pullPx / 8)}px)`,
            opacity: pullPx > 10 ? 1 : 0,
            transition: prefersReducedMotion ? "none" : "opacity 120ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: 999, background: armed ? "#0D7377" : "#94a3b8" }} />
          {refreshing ? "Refreshing…" : armed ? "Release to refresh" : "Pull to refresh"}
        </div>
      </div>
      {children}
    </div>
  );
}
