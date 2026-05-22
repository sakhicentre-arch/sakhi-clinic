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
        minHeight: 'calc(var(--app-vh, 1vh) * 100 - 59px)',
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
