import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Live Productions - Sistema de Gestión",
  description:
    "Sistema inteligente de gestión para Live Productions. Administración de tareas, eventos, inventario, cobros y personal con inteligencia artificial integrada.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <AppProvider>
            {children}
          </AppProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
