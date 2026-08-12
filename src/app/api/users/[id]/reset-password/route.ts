import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole, hashPassword } from "@/lib/auth";
import { getAdminAuth } from "@/lib/firebase-admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    if (!hasMinRole(auth.payload, "ADMIN")) {
      return NextResponse.json({ success: false, error: "Solo administradores pueden cambiar contraseñas" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { newPassword } = body;

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ success: false, error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    let firebaseUid = user.firebaseUid;
    const adminAuth = getAdminAuth();

    // Try to update or create the Firebase Auth user
    if (firebaseUid) {
      try {
        await adminAuth.updateUser(firebaseUid, { password: newPassword });
      } catch (e: any) {
        if (e?.code === "auth/user-not-found") {
          firebaseUid = null;
        } else {
          throw e;
        }
      }
    }

    if (!firebaseUid) {
      try {
        const existing = await adminAuth.getUserByEmail(user.email);
        await adminAuth.updateUser(existing.uid, { password: newPassword });
        firebaseUid = existing.uid;
      } catch (e: any) {
        if (e?.code === "auth/user-not-found") {
          const created = await adminAuth.createUser({
            email: user.email,
            password: newPassword,
            displayName: user.name,
          });
          firebaseUid = created.uid;
        } else {
          throw e;
        }
      }
    }

    // Update the Prisma password hash too (for direct login fallback)
    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id },
      data: { firebaseUid, password: hashedPassword },
    });

    return NextResponse.json({ success: true, message: "Contraseña actualizada" });
  } catch (error: any) {
    console.error("Error cambiando contraseña:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error interno" },
      { status: 500 }
    );
  }
}
