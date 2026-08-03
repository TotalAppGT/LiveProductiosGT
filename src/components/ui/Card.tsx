"use client";

import { cn } from "@/lib/utils";
import type { ReactNode, HTMLAttributes } from "react";

type CardVariant = "default" | "bordered" | "elevated";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  children: ReactNode;
}

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const cardVariantStyles: Record<CardVariant, string> = {
  default: "bg-white dark:bg-gray-800",
  bordered:
    "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700",
  elevated:
    "bg-white dark:bg-gray-800 shadow-lg",
};

function Card({
  variant = "default",
  children,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden",
        cardVariantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function CardHeader({ children, className, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "px-6 py-4 border-b border-gray-200 dark:border-gray-700",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function CardFooter({ children, className, ...props }: CardFooterProps) {
  return (
    <div
      className={cn(
        "px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { Card, CardHeader, CardFooter };
export type { CardProps, CardVariant };
