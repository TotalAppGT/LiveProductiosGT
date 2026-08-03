"use client";

import { useState, type ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

type SortDirection = "asc" | "desc" | null;

interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (item: T) => ReactNode;
  className?: string;
  headerClassName?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor?: (item: T) => string;
  onSort?: (key: string, direction: SortDirection) => void;
  sortKey?: string | null;
  sortDirection?: SortDirection;
  emptyMessage?: string;
  loading?: boolean;
  hoverable?: boolean;
  striped?: boolean;
  actions?: (item: T) => ReactNode;
  className?: string;
}

function SortIcon({
  columnKey,
  sortKey,
  sortDirection,
}: {
  columnKey: string;
  sortKey: string | null;
  sortDirection: SortDirection;
}) {
  if (sortKey !== columnKey) {
    return <ChevronsUpDown className="h-4 w-4 text-gray-400" />;
  }
  return sortDirection === "asc" ? (
    <ChevronUp className="h-4 w-4 text-blue-600" />
  ) : (
    <ChevronDown className="h-4 w-4 text-blue-600" />
  );
}

function Table<T extends Record<string, unknown>>({
  columns,
  data,
  keyExtractor,
  onSort,
  sortKey,
  sortDirection,
  emptyMessage = "No se encontraron resultados",
  loading = false,
  hoverable = true,
  striped = false,
  actions,
  className,
}: TableProps<T>) {
  const [internalSortKey, setInternalSortKey] = useState<string | null>(null);
  const [internalSortDirection, setInternalSortDirection] =
    useState<SortDirection>(null);

  const activeSortKey = sortKey ?? internalSortKey;
  const activeSortDirection = sortDirection ?? internalSortDirection;

  function handleSort(col: Column<T>) {
    if (!col.sortable || loading) return;

    let nextDir: SortDirection = "asc";
    if (activeSortKey === col.key) {
      if (activeSortDirection === "asc") nextDir = "desc";
      else if (activeSortDirection === "desc") nextDir = null;
      else nextDir = "asc";
    }

    if (onSort) {
      onSort(col.key, nextDir);
    } else {
      setInternalSortKey(nextDir ? col.key : null);
      setInternalSortDirection(nextDir);
    }
  }

  const sortedData = onSort
    ? data
    : [...data].sort((a, b) => {
        if (!internalSortKey || !internalSortDirection) return 0;
        const aVal = a[internalSortKey];
        const bVal = b[internalSortKey];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;

        let result = 0;
        if (typeof aVal === "string" && typeof bVal === "string") {
          result = aVal.localeCompare(bVal, "es");
        } else if (aVal < bVal) result = -1;
        else if (aVal > bVal) result = 1;

        return internalSortDirection === "desc" ? -result : result;
      });

  const hasActions = !!actions;
  const allColumns = hasActions
    ? [...columns, { key: "actions", header: "Acciones", sortable: false } as Column<T>]
    : columns;

  return (
    <div className={cn("overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            {allColumns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap",
                  col.sortable && "cursor-pointer select-none hover:text-gray-900 dark:hover:text-gray-200",
                  col.headerClassName
                )}
                onClick={() => col.sortable && handleSort(col)}
              >
                <div className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && (
                    <SortIcon
                      columnKey={col.key}
                      sortKey={activeSortKey}
                      sortDirection={activeSortDirection}
                    />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {allColumns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </td>
                ))}
              </tr>
            ))
          ) : sortedData.length === 0 ? (
            <tr>
              <td
                colSpan={allColumns.length}
                className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((item, index) => (
              <tr
                key={keyExtractor ? keyExtractor(item) : index}
                className={cn(
                  striped && index % 2 === 1 && "bg-gray-50 dark:bg-gray-800/30",
                  hoverable && "hover:bg-gray-50 dark:hover:bg-gray-800/50",
                  "transition-colors"
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn("px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300", col.className)}
                  >
                    {col.render
                      ? col.render(item)
                      : (item[col.key] as ReactNode) ?? "-"}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {actions(item)}
                    </div>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export { Table };
export type { TableProps, Column, SortDirection };
