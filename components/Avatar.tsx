"use client";

import { Users } from "lucide-react";
import { useState, useEffect } from "react";

interface AvatarProps {
  src?: string | null;
  alt: string;
  fallbackType: "initials" | "group-icon";
  initials?: string;
  size?: "sm" | "md" | "lg";
  backgroundColor?: string;
}

/**
 * Avatar Component - Industry Standard Pattern
 * Used by: Slack, Discord, WhatsApp, Telegram
 *
 * Features:
 * - Graceful image loading with fallback
 * - No DOM manipulation (React-managed state only)
 * - Prevents hydration mismatches
 * - Handles missing/broken images elegantly
 * - Resets error state when src changes
 */
export function Avatar({
  src,
  alt,
  fallbackType,
  initials = "?",
  size = "md",
  backgroundColor = "linear-gradient(to bottom right, #6ab6f5, #5da5e8)"
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  // CRITICAL: Reset error state when src changes (e.g., switching conversations)
  useEffect(() => {
    setImageError(false);
  }, [src]);

  // Size mappings
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-[50px] w-[50px] text-lg"
  };

  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24
  };

  // Determine what to show
  const shouldShowImage = src && !imageError;
  const showFallback = !shouldShowImage;

  // Determine if backgroundColor is a gradient or solid color
  const isGradient = backgroundColor.includes('gradient');

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center text-white font-medium overflow-hidden flex-shrink-0`}
      style={{
        // Use backgroundColor for solid colors, backgroundImage for gradients
        backgroundColor: showFallback && !isGradient ? backgroundColor : undefined,
        backgroundImage: showFallback && isGradient ? backgroundColor : undefined
      }}
    >
      {shouldShowImage ? (
        <img
          key={src} // Force remount when src changes
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
          loading="lazy"
        />
      ) : fallbackType === "group-icon" ? (
        <Users size={iconSizes[size]} />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
