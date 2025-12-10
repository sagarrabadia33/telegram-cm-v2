'use client';

import { useEffect } from 'react';
import AnalyticsDashboard from '../components/AnalyticsDashboard';

export default function AnalyticsPage() {
  // Enable scrolling on the analytics page (global CSS has overflow: hidden)
  useEffect(() => {
    // Store original overflow values
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;

    // Enable scrolling
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';

    // Restore on unmount
    return () => {
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.overflow = originalBodyOverflow;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#f9fafb',
      }}
    >
      <AnalyticsDashboard />
    </div>
  );
}
