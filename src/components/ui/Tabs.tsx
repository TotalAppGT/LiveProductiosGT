"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined);

interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

interface TabListProps {
  children: ReactNode;
  className?: string;
}

interface TabProps {
  value: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

interface TabPanelProps {
  value: string;
  children: ReactNode;
  className?: string;
}

function Tabs({
  defaultValue,
  value: controlledValue,
  onValueChange,
  children,
  className,
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const activeTab = controlledValue ?? internalValue;

  function setActiveTab(tab: string) {
    if (controlledValue === undefined) {
      setInternalValue(tab);
    }
    onValueChange?.(tab);
  }

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

function TabList({ children, className }: TabListProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex border-b border-gray-200 dark:border-gray-700 gap-1",
        className
      )}
    >
      {children}
    </div>
  );
}

function Tab({ value, children, disabled = false, className }: TabProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tab must be used within a Tabs component");

  const isActive = ctx.activeTab === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => !disabled && ctx.setActiveTab(value)}
      className={cn(
        "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
        isActive
          ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {children}
    </button>
  );
}

function TabPanel({ value, children, className }: TabPanelProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("TabPanel must be used within a Tabs component");

  if (ctx.activeTab !== value) return null;

  return (
    <div role="tabpanel" tabIndex={0} className={cn("pt-4", className)}>
      {children}
    </div>
  );
}

export { Tabs, TabList, Tab, TabPanel };
export type { TabsProps, TabListProps, TabProps, TabPanelProps };
