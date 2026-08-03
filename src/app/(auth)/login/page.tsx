"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Mail, Lock, LogIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
