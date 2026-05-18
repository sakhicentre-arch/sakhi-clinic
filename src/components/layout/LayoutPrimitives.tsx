import React from "react";

interface LayoutProps {
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
}: LayoutProps): React.ReactElement {
  return (
    <main
      className={className}
      style={{
        marginLeft: "64px",
        minHeight: "calc(100vh - 59px)",
        width: "calc(100% - 64px)",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        background: "#f8fafc",
        ...style,
      }}
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
}: SplitPaneProps): React.ReactElement {
  return (
    <div
      className={className}
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
}: LayoutProps): React.ReactElement {
  return (
    <div
      className={className}
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
