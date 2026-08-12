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

    const adminAuth = getAdminAuth();
    let firebaseUid = user.firebaseUid;
    let firebaseAction = "";

    // 1) Update by firebaseUid if exists
    if (firebaseUid) {
      try {
        await adminAuth.updateUser(firebaseUid, { password: newPassword });
        firebaseAction = "updated_by_uid";
      } catch (e: any) {
        if (e?.code === "auth/user-not-found") {
          firebaseUid = null;
        } else {
          throw new Error(`Firebase updateUser error: ${e?.message || e?.code || "unknown"}`);
        }
      }
    }

    // 2) Fallback: find or create by email
    if (!firebaseUid) {
      try {
        const existing = await adminAuth.getUserByEmail(user.email);
        await adminAuth.updateUser(existing.uid, { password: newPassword });
        firebaseUid = existing.uid;
        firebaseAction = "updated_by_email";
      } catch (e: any) {
        if (e?.code === "auth/user-not-found") {
          const created = await adminAuth.createUser({
            email: user.email,
            password: newPassword,
            displayName: user.name,
            emailVerified: true,
          });
          firebaseUid = created.uid;
          firebaseAction = "created";
        } else {
          throw new Error(`Firebase email lookup error: ${e?.message || e?.code || "unknown"}`);
        }
      }
    }

    // 3) Update local password hash too
    const hashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id },
      data: { firebaseUid, password: hashedPassword },
    });

    return NextResponse.json({
      success: true,
      message: `Contraseña actualizada para ${user.email}`,
      email: user.email,
      firebaseAction,
    });
  } catch (error: any) {
    console.error("Error cambiando contraseña:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Error interno" },
      { status: 500 }
    );
  }
}
