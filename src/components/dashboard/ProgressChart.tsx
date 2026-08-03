"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { AlertCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface DailyProgress {
  day: string;
  completadas: number;
  pendientes: number;
}

interface ProgressChartProps {
  data: DailyProgress[];
  isLoading?: boolean;
  className?: string;
}

export function ProgressChart({
  data,
  isLoading = false,
  className,
}: ProgressChartProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <LoadingSpinner size="md" text="Cargando gráfico..." />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-16 w-16" />}
        title="Sin datos de progreso"
        description="Completa tareas durante la semana para ver el progreso aquí."
      />
    );
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e5e7eb"
            vertical={false}
          />
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#6b7280" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#6b7280" }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              fontSize: "13px",
            }}
            labelStyle={{ fontWeight: 600, marginBottom: 4 }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
            iconType="circle"
          />
          <Bar
            dataKey="completadas"
            name="Completadas"
            fill="#22c55e"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
          <Bar
            dataKey="pendientes"
            name="Pendientes"
            fill="#f59e0b"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
