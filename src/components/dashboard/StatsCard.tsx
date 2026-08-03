"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  icon: ReactNode;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  trend?: number;
  trendLabel?: string;
  color?: "blue" | "green" | "yellow" | "red" | "purple" | "indigo" | "teal" | "orange";
  onClick?: () => void;
  className?: string;
}

const colorConfig: Record<string, { bg: string; text: string; iconBg: string; iconText: string }> = {
  blue: {
    bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
    text: "text-blue-800 dark:text-blue-200",
    iconBg: "bg-blue-100 dark:bg-blue-800",
    iconText: "text-blue-600 dark:text-blue-400",
  },
  green: {
    bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
    text: "text-green-800 dark:text-green-200",
    iconBg: "bg-green-100 dark:bg-green-800",
    iconText: "text-green-600 dark:text-green-400",
  },
  yellow: {
    bg: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
    text: "text-yellow-800 dark:text-yellow-200",
    iconBg: "bg-yellow-100 dark:bg-yellow-800",
    iconText: "text-yellow-600 dark:text-yellow-400",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
    text: "text-red-800 dark:text-red-200",
    iconBg: "bg-red-100 dark:bg-red-800",
    iconText: "text-red-600 dark:text-red-400",
  },
  purple: {
    bg: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800",
    text: "text-purple-800 dark:text-purple-200",
    iconBg: "bg-purple-100 dark:bg-purple-800",
    iconText: "text-purple-600 dark:text-purple-400",
  },
  indigo: {
    bg: "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800",
    text: "text-indigo-800 dark:text-indigo-200",
    iconBg: "bg-indigo-100 dark:bg-indigo-800",
    iconText: "text-indigo-600 dark:text-indigo-400",
  },
  teal: {
    bg: "bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800",
    text: "text-teal-800 dark:text-teal-200",
    iconBg: "bg-teal-100 dark:bg-teal-800",
    iconText: "text-teal-600 dark:text-teal-400",
  },
  orange: {
    bg: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800",
    text: "text-orange-800 dark:text-orange-200",
    iconBg: "bg-orange-100 dark:bg-orange-800",
    iconText: "text-orange-600 dark:text-orange-400",
  },
};

function useCountUp(endValue: number, duration = 800) {
  const [displayValue, setDisplayValue] = useState(0);
  const frameRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    startRef.current = Date.now();
    const startValue = 0;

    function animate() {
      const elapsed = Date.now() - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + (endValue - startValue) * eased);

      setDisplayValue(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    }

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [endValue, duration]);

  return displayValue;
}

export function StatsCard({
  icon,
  label,
  value,
  prefix = "",
  suffix = "",
  trend,
  trendLabel,
  color = "blue",
  onClick,
  className,
}: StatsCardProps) {
  const displayValue = useCountUp(value);
  const config = colorConfig[color];
  const hasTrend = trend !== undefined;
  const isPositive = hasTrend && trend >= 0;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all",
        config.bg,
        onClick && "cursor-pointer hover:shadow-md hover:-translate-y-0.5",
        className
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-center justify-between mb-3">
        <span className={cn("text-xs font-semibold uppercase tracking-wider", config.text)}>
          {label}
        </span>
        <div className={cn("p-2 rounded-lg", config.iconBg, config.iconText)}>
          {icon}
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <span className={cn("text-2xl font-bold", config.text)}>
            {prefix}{displayValue.toLocaleString("es-CL")}{suffix}
          </span>
        </div>
        {hasTrend && (
          <div className="flex items-center gap-1">
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
            )}
            <span
              className={cn(
                "text-xs font-semibold",
                isPositive
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              )}
            >
              {isPositive ? "+" : ""}{trend}%
            </span>
            {trendLabel && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {trendLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
