"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  Phone,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim() || !phone.trim() || !password || !confirmPassword) {
      setError("Todos los campos son obligatorios");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setIsLoading(true);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim(),
        whatsappNumber: phone.trim(),
      });
      toast.success("Registro exitoso. Redirigiendo al inicio de sesión...");
      setTimeout(() => router.push("/login"), 1500);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "";
      if (message.includes("email-already-in-use")) {
        setError("Este correo ya está registrado");
      } else {
        setError("Error al registrarse. Intenta de nuevo.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8 shadow-2xl">
      <div className="text-center mb-8">
        <div className="h-12 w-12 rounded-xl bg-blue-600/20 flex items-center justify-center mx-auto mb-4">
          <UserPlus className="h-6 w-6 text-blue-400" />
        </div>
        <h1 className="text-xl font-bold text-white">Crear Cuenta</h1>
        <p className="text-gray-400 text-sm mt-1">
          Regístrate para empezar a usar el sistema
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nombre completo"
          type="text"
          placeholder="Tu nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          leftIcon={<User className="h-4 w-4" />}
          disabled={isLoading}
          autoComplete="name"
        />

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

        <Input
          label="Teléfono (WhatsApp)"
          type="tel"
          placeholder="+502 5555-5555"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          leftIcon={<Phone className="h-4 w-4" />}
          disabled={isLoading}
          autoComplete="tel"
        />

        <Input
          label="Contraseña"
          type={showPassword ? "text" : "password"}
          placeholder="Mínimo 6 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          leftIcon={<Lock className="h-4 w-4" />}
          disabled={isLoading}
          autoComplete="new-password"
        />

        <div>
          <Input
            label="Confirmar contraseña"
            type={showPassword ? "text" : "password"}
            placeholder="Repite tu contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
            autoComplete="new-password"
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
          leftIcon={<UserPlus className="h-4 w-4" />}
        >
          Registrarse
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-gray-400 text-sm">
          ¿Ya tienes cuenta?{" "}
          <Link
            href="/login"
            className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            Iniciar Sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
