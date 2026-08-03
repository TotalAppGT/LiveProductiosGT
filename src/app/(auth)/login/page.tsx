"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Mail, Lock, LogIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Todos los campos son obligatorios");
      return;
    }

    setIsLoading(true);
    try {
      await login({ email: email.trim(), password });
      router.replace("/dashboard");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Error al iniciar sesión. Verifica tus credenciales.";
      if (message.includes("invalid-credential") || message.includes("auth/invalid-credential")) {
        setError("Correo o contraseña incorrectos");
      } else if (message.includes("too-many-requests")) {
        setError("Demasiados intentos. Intenta más tarde.");
      } else {
        setError("Error al iniciar sesión. Verifica tus credenciales.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      router.replace("/dashboard");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("popup-closed") || message.includes("cancelled")) {
        // User closed popup, no error needed
      } else {
        setError("Error al iniciar sesión con Google. Intenta de nuevo.");
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8 shadow-2xl">
      <div className="text-center mb-8">
        <div className="h-12 w-12 rounded-xl bg-blue-600/20 flex items-center justify-center mx-auto mb-4">
          <LogIn className="h-6 w-6 text-blue-400" />
        </div>
        <h1 className="text-xl font-bold text-white">Iniciar Sesión</h1>
        <p className="text-gray-400 text-sm mt-1">
          Ingresa tus credenciales para acceder al sistema
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Correo electrónico"
          type="email"
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          leftIcon={<Mail className="h-4 w-4" />}
          disabled={isLoading}
          autoComplete="email"
        />

        <div>
          <Input
            label="Contraseña"
            type={showPassword ? "text" : "password"}
            placeholder="Tu contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock className="h-4 w-4" />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="focus:outline-none"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            }
            disabled={isLoading}
            autoComplete="current-password"
          />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isLoading}
          leftIcon={<LogIn className="h-4 w-4" />}
        >
          Iniciar Sesión
        </Button>
      </form>

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-600/50" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-gray-800 px-3 text-gray-400">o continuar con</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading || isLoading}
          className="mt-4 w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-gray-600/50 bg-white hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50 min-h-[44px]"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {googleLoading ? "Conectando..." : "Google"}
          </span>
        </button>
      </div>

      <div className="mt-6 text-center">
        <p className="text-gray-400 text-sm">
          ¿No tienes cuenta?{" "}
          <Link
            href="/register"
            className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  );
}
