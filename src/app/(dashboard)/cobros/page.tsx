"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Clock,
  Pencil,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge, cobroStatusLabel, cobroStatusColor } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, formatCurrency, cn } from "@/lib/utils";
import type { Cobro, User, ApiResponse, PaginatedResponse } from "@/types";

export default function CobrosPage() {
  const { user, token } = useAuth();
  const [cobros, setCobros] = useState<Cobro[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCobro, setEditingCobro] = useState<Cobro | null>(null);
  const [paymentModal, setPaymentModal] = useState<{
    cobro: Cobro;
    amount: string;
  } | null>(null);

  const fetchCobros = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [res, usersRes] = await Promise.all([
        fetch(`/api/cobros?${new URLSearchParams({ ...(statusFilter && { status: statusFilter }), ...(search && { search }) }).toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/users/list", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (usersRes.ok) {
        const uJson = await usersRes.json();
        if (Array.isArray(uJson)) setUsers(uJson);
      }
      if (!res.ok) throw new Error("Error al cargar cobros");
      const json: PaginatedResponse<Cobro> = await res.json();
      if (json.success) {
        setCobros(json.data);
      } else {
        setCobros([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, search]);

  useEffect(() => {
    fetchCobros();
  }, [fetchCobros]);

  async function markAsPaid(cobroId: string, status: string) {
    try {
      const res = await fetch(`/api/cobros/${cobroId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const json: ApiResponse<Cobro> = await res.json();
      if (json.success) {
        toast.success(status === "COMPLETADO" ? "Marcado como pagado" : "Pago parcial registrado");
        setPaymentModal(null);
        fetchCobros();
      }
    } catch {
      toast.error("Error al actualizar cobro");
    }
  }

  const totalPending = cobros
    .filter((c) => c.status !== "COMPLETADO")
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);

  const collectedMonth = cobros
    .filter((c) => {
      if (c.status !== "COMPLETADO") return false;
      const d = new Date(c.updatedAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cobros</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Gestiona los cobros y pagos
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setShowAddModal(true)}
        >
          Nuevo Cobro
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card variant="bordered" className="p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
            <Clock className="h-5 w-5 text-yellow-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Pendiente</p>
            <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
              {formatCurrency(totalPending)}
            </p>
          </div>
        </Card>
        <Card variant="bordered" className="p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Cobrado Este Mes</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(collectedMonth)}
            </p>
          </div>
        </Card>
        <Card variant="bordered" className="p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <DollarSign className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Cobros</p>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
              {cobros.length}
            </p>
          </div>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar por cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los estados</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="PARCIAL">Parcial</option>
          <option value="COMPLETADO">Completado</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner text="Cargando cobros..." />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error}</p>
          <Button variant="outline" onClick={fetchCobros}>Reintentar</Button>
        </div>
      ) : cobros.length === 0 ? (
        <EmptyState
          icon={<DollarSign className="h-16 w-16" />}
          title="No hay cobros"
          description="No se encontraron cobros con los filtros actuales."
          action={{ label: "Nuevo Cobro", onClick: () => setShowAddModal(true) }}
        />
      ) : (
        <>
          <Card variant="bordered" className="overflow-hidden hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Evento</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Monto</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vence</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Asignado</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {cobros.map((cobro) => (
                  <tr key={cobro.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {cobro.clientName}
                        </p>
                        {cobro.invoiceNumber && (
                          <p className="text-xs text-gray-400">Factura: {cobro.invoiceNumber}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {cobro.event?.name || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(cobro.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge size="sm" color={cobroStatusColor(cobro.status)}>
                        {cobroStatusLabel(cobro.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {cobro.dueDate ? formatDate(cobro.dueDate) : "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {cobro.assignedTo?.name || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {cobro.status !== "COMPLETADO" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setPaymentModal({ cobro, amount: String(cobro.amount) })
                              }
                              title="Marcar pago"
                            >
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            </Button>
                            </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingCobro(cobro)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="md:hidden space-y-3">
          {cobros.map((cobro) => (
            <Card key={cobro.id} variant="bordered" className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{cobro.clientName}</p>
                  {cobro.invoiceNumber && (
                    <p className="text-xs text-gray-400">Factura: {cobro.invoiceNumber}</p>
                  )}
                </div>
                <Badge size="sm" color={cobroStatusColor(cobro.status)}>
                  {cobroStatusLabel(cobro.status)}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div>
                  <span className="text-xs text-gray-500">Monto</span>
                  <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(cobro.amount)}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Vence</span>
                  <p className="text-gray-700 dark:text-gray-300">{cobro.dueDate ? formatDate(cobro.dueDate) : "-"}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Evento</span>
                  <p className="text-gray-700 dark:text-gray-300">{cobro.event?.name || "-"}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Asignado</span>
                  <p className="text-gray-700 dark:text-gray-300">{cobro.assignedTo?.name || "-"}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                {cobro.status !== "COMPLETADO" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPaymentModal({ cobro, amount: String(cobro.amount) })}
                    title="Marcar pago"
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setEditingCobro(cobro)} title="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </>
      )}

      <CobroFormModal
        isOpen={showAddModal || !!editingCobro}
        onClose={() => {
          setShowAddModal(false);
          setEditingCobro(null);
        }}
        token={token || ""}
        cobro={editingCobro}
        users={users}
        onSaved={fetchCobros}
      />

      {paymentModal && (
        <Modal
          isOpen={!!paymentModal}
          onClose={() => setPaymentModal(null)}
          title="Registrar Pago"
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500">Cliente</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {paymentModal.cobro.clientName}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Monto total</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(paymentModal.cobro.amount)}
              </p>
            </div>
            <Input
              label="Monto a registrar"
              type="number"
              value={paymentModal.amount}
              onChange={(e) =>
                setPaymentModal({ ...paymentModal, amount: e.target.value })
              }
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => markAsPaid(paymentModal.cobro.id, "PARCIAL")}
              >
                Pago Parcial
              </Button>
              <Button
                variant="primary"
                onClick={() => markAsPaid(paymentModal.cobro.id, "COMPLETADO")}
              >
                Pagado Completo
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CobroFormModal({
  isOpen,
  onClose,
  token,
  cobro,
  users,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  cobro: Cobro | null;
  users: any[];
  onSaved: () => void;
}) {
  const isEditing = !!cobro;
  const [clientName, setClientName] = useState(cobro?.clientName || "");
  const [amount, setAmount] = useState(String(cobro?.amount || ""));
  const [invoiceNumber, setInvoiceNumber] = useState(cobro?.invoiceNumber || "");
  const [dueDate, setDueDate] = useState(cobro?.dueDate?.split("T")[0] || "");
  const [notes, setNotes] = useState(cobro?.notes || "");
  const [assignedToId, setAssignedToId] = useState(cobro?.assignedToId || "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim() || !amount) return;
    setSaving(true);
    try {
      const url = isEditing ? `/api/cobros/${cobro.id}` : "/api/cobros";
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clientName: clientName.trim(),
          amount: parseFloat(amount),
          invoiceNumber: invoiceNumber.trim() || undefined,
          dueDate: dueDate || undefined,
          notes: notes.trim() || undefined,
          assignedToId: assignedToId || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(isEditing ? "Cobro actualizado" : "Cobro creado");
        onSaved();
        onClose();
      } else {
        throw new Error(json.error || "Error");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Editar Cobro" : "Nuevo Cobro"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Cliente" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
        <Input label="Monto (GTQ)" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asignado a</label>
          <select
            value={assignedToId}
            onChange={(e) => setAssignedToId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
          >
            <option value="">Yo (predeterminado)</option>
            {users.map((u: any) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <Input label="Número de factura" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
        <Input label="Fecha de vencimiento" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
            rows={2}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} type="button">Cancelar</Button>
          <Button variant="primary" type="submit" isLoading={saving}>
            {isEditing ? "Guardar Cambios" : "Crear Cobro"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
