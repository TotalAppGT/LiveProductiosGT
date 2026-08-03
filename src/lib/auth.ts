import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import type { Role } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const SALT_ROUNDS = 12;

export interface JwtPayload {
  userId: string;
  role: Role;
  tenantId?: string | null;
}

export function generateToken(
  userId: string,
  role: Role,
  tenantId?: string | null
): string {
  return jwt.sign(
    { userId, role, tenantId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
  );
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hashed: string
): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}

export function getTokenFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

export function authenticateRequest(
  req: NextRequest
): { payload: JwtPayload } | { error: string; status: number } {
  const token = getTokenFromRequest(req);
  if (!token) {
    return { error: "No autorizado", status: 401 };
  }

  const payload = verifyToken(token);
  if (!payload) {
    return { error: "Token inválido o expirado", status: 401 };
  }

  return { payload };
}

export function isDueno(payload: JwtPayload): boolean {
  return payload.role === "DUENO";
}

export function isAdmin(payload: JwtPayload): boolean {
  return payload.role === "ADMIN";
}

export function isJefe(payload: JwtPayload): boolean {
  return payload.role === "JEFE";
}

export function isEmpleado(payload: JwtPayload): boolean {
  return payload.role === "EMPLEADO";
}

export function hasRole(payload: JwtPayload, ...roles: Role[]): boolean {
  return roles.includes(payload.role);
}

export const roleHierarchy: Record<Role, number> = {
  DUENO: 4,
  ADMIN: 3,
  JEFE: 2,
  EMPLEADO: 1,
};

export function hasMinRole(
  payload: JwtPayload,
  minRole: Role
): boolean {
  return (roleHierarchy[payload.role] ?? 0) >= (roleHierarchy[minRole] ?? 0);
}
