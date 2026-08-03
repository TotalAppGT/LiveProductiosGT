"use client";

import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
type AvatarStatus = "online" | "offline" | "away" | "busy";

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: AvatarSize;
  status?: AvatarStatus;
}

const sizeStyles: Record<AvatarSize, string> = {
  xs: "h-6 w-6 text-xs",
  sm: "h-8 w-8 text-sm",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-14 w-14 text-lg",
};

const statusSizeStyles: Record<AvatarSize, string> = {
  xs: "h-1.5 w-1.5 ring-1",
  sm: "h-2 w-2 ring-1",
  md: "h-2.5 w-2.5 ring-2",
  lg: "h-3 w-3 ring-2",
  xl: "h-3.5 w-3.5 ring-2",
};

const statusColors: Record<AvatarStatus, string> = {
  online: "bg-green-500",
  offline: "bg-gray-400",
  away: "bg-yellow-500",
  busy: "bg-red-500",
};

const colorPool = [
  "bg-blue-500",
  "bg-green-500",
  "bg-yellow-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-red-500",
  "bg-cyan-500",
];

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getColorFromName(name?: string): string {
  if (!name) return colorPool[0];
  let sum = 0;
  for (let i = 0; i < name.length; i++) {
    sum += name.charCodeAt(i);
  }
  return colorPool[sum % colorPool.length];
}

function Avatar({
  src,
  alt = "",
  name,
  size = "md",
  status,
  className,
  ...props
}: AvatarProps) {
  const initials = getInitials(name);
  const bgColor = getColorFromName(name);

  return (
    <div className={cn("relative inline-flex flex-shrink-0", className)} {...props}>
      {src ? (
        <img
          src={src}
          alt={alt || name || "Avatar"}
          className={cn("rounded-full object-cover", sizeStyles[size])}
        />
      ) : (
        <div
          className={cn(
            "rounded-full flex items-center justify-center text-white font-semibold",
            sizeStyles[size],
            bgColor
          )}
          title={name || alt}
        >
          {initials}
        </div>
      )}
      {status && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full ring-white dark:ring-gray-800",
            statusColors[status],
            statusSizeStyles[size]
          )}
        />
      )}
    </div>
  );
}

export { Avatar };
export type { AvatarProps, AvatarSize, AvatarStatus };
