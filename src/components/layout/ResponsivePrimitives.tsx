/**
 * ResponsivePrimitives.tsx
 * Mobile-first responsive layout components for Sakhi Clinic
 *
 * Provides lightweight responsive containers and card primitives
 * that adapt to mobile (360px+), tablet, and desktop viewports.
 */

import React, { useEffect, useState } from 'react';

interface ResponsiveContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

interface MobileCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  elevated?: boolean;
}

/**
 * ResponsiveContainer
 * Main layout wrapper that adapts grid/flex layout based on viewport width.
 * 
 * - Mobile (<768px): Single column (1fr)
 * - Tablet (768px-1024px): 2 columns
 * - Desktop (>1024px): Original layout (respects gridTemplateColumns from style)
 */
export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  className,
  style,
  ...props
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const mq768 = window.matchMedia('(max-width: 768px)');
    const mq1024 = window.matchMedia('(max-width: 1024px)');

    const updateBreakpoints = () => {
      setIsMobile(mq768.matches);
      setIsTablet(mq1024.matches && !mq768.matches);
    };

    updateBreakpoints();
    mq768.addEventListener('change', updateBreakpoints);
    mq1024.addEventListener('change', updateBreakpoints);

    return () => {
      mq768.removeEventListener('change', updateBreakpoints);
      mq1024.removeEventListener('change', updateBreakpoints);
    };
  }, []);

  const responsiveStyle: React.CSSProperties = {
    ...style,
    // On mobile: collapse multi-column layouts to single column
    ...(isMobile && style?.gridTemplateColumns
      ? { gridTemplateColumns: '1fr' }
      : {}),
    // Ensure no overflow without masking layout issues
    minWidth: 0,
    width: '100%',
  };

  return (
    <div
      className={className}
      style={responsiveStyle}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * MobileCard
 * Responsive card primitive that adapts padding and border-radius for mobile.
 *
 * - Mobile: 16px padding, 14px border-radius
 * - Desktop: 24px+ padding, 16px+ border-radius
 */
export const MobileCard: React.FC<MobileCardProps> = ({
  children,
  className,
  style,
  elevated = true,
  ...props
}) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface, #fff)',
    borderRadius: isMobile ? 'var(--radius-3, 20px)' : 'var(--radius-3, 20px)',
    padding: isMobile ? 'var(--space-3, 16px)' : 'var(--space-4, 24px)',
    border: '1px solid var(--border, #e2e8f0)',
    boxShadow: elevated ? 'var(--shadow-1, 0 2px 10px rgba(15, 23, 42, 0.06))' : 'none',
    width: '100%',
    minWidth: 0,
    ...style,
  };

  return (
    <div className={className} style={cardStyle} {...props}>
      {children}
    </div>
  );
};

/**
 * MobileSection
 * Semantic wrapper for major page sections with mobile-aware spacing.
 */
export const MobileSection: React.FC<ResponsiveContainerProps> = ({
  children,
  className,
  style,
  ...props
}) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: isMobile ? 'var(--space-3, 16px)' : 'var(--space-4, 24px)',
    width: '100%',
    minWidth: 0,
    ...style,
  };

  return (
    <section className={className} style={sectionStyle} {...props}>
      {children}
    </section>
  );
};

/**
 * MobileField
 * Form field wrapper with mobile-aware spacing and touch target sizing.
 */
export const MobileField: React.FC<ResponsiveContainerProps> = ({
  children,
  className,
  style,
  ...props
}) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const fieldStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: isMobile ? 'var(--space-2, 8px)' : 'var(--space-2, 8px)',
    width: '100%',
    minWidth: 0,
    ...style,
  };

  return (
    <div className={className} style={fieldStyle} {...props}>
      {children}
    </div>
  );
};

/**
 * ResponsiveGrid
 * Responsive grid that collapses columns on mobile.
 */
interface ResponsiveGridProps extends ResponsiveContainerProps {
  columns?: number;
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  className,
  columns = 2,
  style,
  ...props
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const mq768 = window.matchMedia('(max-width: 768px)');
    const mq1024 = window.matchMedia('(max-width: 1024px)');

    const updateBreakpoints = () => {
      setIsMobile(mq768.matches);
      setIsTablet(mq1024.matches && !mq768.matches);
    };

    updateBreakpoints();
    mq768.addEventListener('change', updateBreakpoints);
    mq1024.addEventListener('change', updateBreakpoints);

    return () => {
      mq768.removeEventListener('change', updateBreakpoints);
      mq1024.removeEventListener('change', updateBreakpoints);
    };
  }, []);

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : `repeat(${columns}, 1fr)`,
    gap: isMobile ? 'var(--space-3, 16px)' : 'var(--space-3, 16px)',
    width: '100%',
    minWidth: 0,
    ...style,
  };

  return (
    <div className={className} style={gridStyle} {...props}>
      {children}
    </div>
  );
};

export default ResponsiveContainer;
