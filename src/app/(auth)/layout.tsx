"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-black">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-black px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <span className="text-2xl font-bold text-white tracking-tight">
          Live Productions
        </span>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
