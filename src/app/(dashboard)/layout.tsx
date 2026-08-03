"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageLoader } from "@/components/ui/LoadingSpinner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, initialized } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (initialized && !user) {
      router.replace("/login");
    }
  }, [user, initialized, router]);

  if (loading || !initialized) {
    return <PageLoader text="Cargando..." />;
  }

  if (!user) return null;

  return <MainLayout>{children}</MainLayout>;
}
