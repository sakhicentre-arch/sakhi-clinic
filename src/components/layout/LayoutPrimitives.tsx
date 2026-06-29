import React, { useEffect, useState } from "react";

interface LayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

interface PullToRefreshScrollRegionProps extends LayoutProps {
  onRefresh?: () => void | Promise<void>;
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

  return (
    <main
      className={className}
      style={{
        marginLeft: isMobile ? 0 : '64px',
        minHeight: 'calc(100vh - 59px)',
        width: isMobile ? '100%' : 'calc(100% - 64px)',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc',
        paddingBottom: isMobile ? 'calc(56px + env(safe-area-inset-bottom))' : 0,
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
  ...props
}: PullToRefreshScrollRegionProps): React.ReactElement {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startYRef = React.useRef<number | null>(null);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    startYRef.current = event.touches[0].clientY;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!startYRef.current || event.touches.length !== 1) return;
    const currentY = event.touches[0].clientY;
    const delta = currentY - startYRef.current;
    if (delta <= 0 || window.scrollY > 0) {
      return;
    }

    event.preventDefault();
    setIsPulling(true);
    setPullDistance(Math.min(delta, 88));
  };

  const handleTouchEnd = async () => {
    if (pullDistance > 60 && onRefresh) {
      try {
        await onRefresh();
      } catch {
        // Preserve existing behavior: swallow refresh errors and reset UI.
      }
    }

    startYRef.current = null;
    setIsPulling(false);
    setPullDistance(0);
  };

  return (
    <div
      className={className}
      {...props}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        transform: `translateY(${pullDistance}px)`,
        transition: isPulling ? "none" : "transform 180ms ease-out",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
