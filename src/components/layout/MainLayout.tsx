"use client";

import type { ReactNode } from "react";
import { Toaster } from "react-hot-toast";
import { cn } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { AIChat } from "@/components/dashboard/AIChat";

interface MainLayoutProps {
  children: ReactNode;
  title?: string;
  className?: string;
}

function MainLayout({ children, title, className }: MainLayoutProps) {
  const { sidebarCollapsed } = useApp();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <div
        className={cn(
          "transition-all duration-300",
          sidebarCollapsed ? "lg:ml-16" : "lg:ml-64"
        )}
      >
        <Header title={title} />
        <main
          className={cn(
            "p-4 lg:p-6 min-h-[calc(100vh-4rem)]",
            className
          )}
        >
          {children}
        </main>
      </div>
      <AIChat />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: "0.75rem",
            padding: "0.75rem 1rem",
            fontSize: "0.875rem",
          },
        }}
      />
    </div>
  );
}

export { MainLayout };
export type { MainLayoutProps };
