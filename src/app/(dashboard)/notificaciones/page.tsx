"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";

const DAYS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

export default function NotificacionesPage() {
  const { user, token } = useAuth();
  const router = useRouter();

  if (!user || (user.role !== "DUENO" && user.role !== "ADMIN" && user.role !== "JEFE")) {
    return <div className="p-8 text-center text-gray-500">Acceso no autorizado</div>;
  }

  const [tab, setTab] = useState<"grupos" | "alertas">("grupos");
  const [groups, setGroups] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const [showAlertForm, setShowAlertForm] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMsg, setAlertMsg] = useState("");
  const [alertType, setAlertType] = useState("PERSONALIZADA");
  const [alertDate, setAlertDate] = useState("");
  const [alertTime, setAlertTime] = useState("09:00");
  const [alertDay, setAlertDay] = useState("1");
  const [alertGroup, setAlertGroup] = useState("");
  const [alertTarget, setAlertTarget] = useState("");

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    try {
      const [g, a, u] = await Promise.all([
        fetch("/api/groups", { headers }).then(r => r.ok ? r.json() : []),
        fetch("/api/alerts", { headers }).then(r => r.ok ? r.json() : []),
        fetch("/api/users/list", { headers }).then(r => r.ok ? r.json() : []),
      ]);
      setGroups(g); setAlerts(a); setAllUsers(u);
    } catch { toast.error("Error al cargar"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (token) fetchData(); }, [token]);

  const createGroup = async () => {
    if (!groupName.trim()) return toast.error("Nombre requerido");
    const r = await fetch("/api/groups", {
      method: "POST", headers, body: JSON.stringify({ name: groupName, description: groupDesc, memberIds: selectedMembers }),
    });
    if (r.ok) { toast.success("Grupo creado"); setShowGroupForm(false); setGroupName(""); setGroupDesc(""); setSelectedMembers([]); fetchData(); }
    else toast.error("Error");
  };
  const deleteGroup = async (id: string) => { if (!confirm("¿Eliminar?")) return; await fetch(`/api/groups/${id}`, { method: "DELETE", headers }); fetchData(); };
  const deleteAlert = async (id: string) => { if (!confirm("¿Eliminar?")) return; await fetch(`/api/alerts/${id}`, { method: "DELETE", headers }); fetchData(); };

  const createAlert = async () => {
    if (!alertTitle.trim() || !alertMsg.trim()) return toast.error("Título y mensaje requeridos");
    const body: any = { title: alertTitle, message: alertMsg, type: alertType };
    if (alertType === "FIJA") { body.dayOfWeek = alertDay; body.time = alertTime; }
    else { body.scheduledAt = alertDate ? new Date(alertDate + "T" + alertTime).toISOString() : new Date().toISOString(); }
    if (alertGroup) body.groupId = alertGroup;
    if (alertTarget) body.targetUserId = alertTarget;
    const r = await fetch("/api/alerts", { method: "POST", headers, body: JSON.stringify(body) });
    if (r.ok) { toast.success("Alerta creada"); setShowAlertForm(false); setAlertTitle(""); setAlertMsg(""); fetchData(); }
    else toast.error("Error");
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  const isAdmin = user.role === "DUENO" || user.role === "ADMIN";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">🔔 Notificaciones</h1>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setTab("grupos")} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === "grupos" ? "bg-white shadow" : "text-gray-600"}`}>👥 Grupos</button>
        <button onClick={() => setTab("alertas")} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === "alertas" ? "bg-white shadow" : "text-gray-600"}`}>🔔 Alertas</button>
      </div>

      {tab === "grupos" && (
        <div>
          <div className="flex justify-between mb-4">
            <p className="text-sm text-gray-500">{groups.length} grupo(s)</p>
            {isAdmin && <button onClick={() => setShowGroupForm(!showGroupForm)} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg">+ Nuevo</button>}
          </div>
          {showGroupForm && (
            <Card className="p-4 mb-4">
              <input className="w-full border rounded-lg p-2 mb-2 text-sm" placeholder="Nombre" value={groupName} onChange={e => setGroupName(e.target.value)} />
              <input className="w-full border rounded-lg p-2 mb-2 text-sm" placeholder="Descripción" value={groupDesc} onChange={e => setGroupDesc(e.target.value)} />
              <p className="text-sm mb-2">Miembros:</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {allUsers.map((u: any) => (
                  <label key={u.id} className={`px-3 py-1 rounded-full text-xs cursor-pointer border ${selectedMembers.includes(u.id) ? "bg-blue-100 border-blue-400" : "border-gray-300"}`}>
                    <input type="checkbox" className="hidden" checked={selectedMembers.includes(u.id)} onChange={() => setSelectedMembers(p => p.includes(u.id) ? p.filter(i => i !== u.id) : [...p, u.id])} />
                    {u.name} <span className="text-gray-400">({u.role})</span>
                  </label>
                ))}
              </div>
              <button onClick={createGroup} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Guardar</button>
              <button onClick={() => setShowGroupForm(false)} className="ml-2 text-gray-500 px-4 py-2 text-sm">Cancelar</button>
            </Card>
          )}
          {groups.map((g: any) => (
            <Card key={g.id} className="p-4 mb-2">
              <div className="flex justify-between items-center">
                <div><strong>{g.name}</strong> <span className="text-xs text-gray-500">({g._count?.members || 0} miembros)</span></div>
                {isAdmin && <button onClick={() => deleteGroup(g.id)} className="text-red-500 text-xs">Eliminar</button>}
              </div>
              {g.description && <p className="text-xs text-gray-400 mt-1">{g.description}</p>}
            </Card>
          ))}
        </div>
      )}

      {tab === "alertas" && (
        <div>
          <div className="flex justify-between mb-4">
            <p className="text-sm text-gray-500">{alerts.length} alerta(s)</p>
            {isAdmin && <button onClick={() => setShowAlertForm(!showAlertForm)} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg">+ Nueva</button>}
          </div>
          {showAlertForm && (
            <Card className="p-4 mb-4">
              <input className="w-full border rounded-lg p-2 mb-2 text-sm" placeholder="Título" value={alertTitle} onChange={e => setAlertTitle(e.target.value)} />
              <textarea className="w-full border rounded-lg p-2 mb-2 text-sm" rows={3} placeholder="Mensaje WhatsApp" value={alertMsg} onChange={e => setAlertMsg(e.target.value)} />
              <select className="w-full border rounded-lg p-2 mb-2 text-sm" value={alertType} onChange={e => setAlertType(e.target.value)}>
                <option value="PERSONALIZADA">Personalizada (fecha fija)</option>
                <option value="FIJA">Fija (semanal)</option>
                <option value="DINAMICA">Dinámica (inmediata)</option>
              </select>
              {alertType === "FIJA" ? (
                <div className="flex gap-2">
                  <select className="border rounded-lg p-2 text-sm flex-1" value={alertDay} onChange={e => setAlertDay(e.target.value)}>
                    {DAYS.slice(1).map((d, i) => <option key={i+1} value={String(i+1)}>{d}</option>)}
                  </select>
                  <input type="time" className="border rounded-lg p-2 text-sm flex-1" value={alertTime} onChange={e => setAlertTime(e.target.value)} />
                </div>
              ) : (
                <div className="flex gap-2">
                  <input type="date" className="border rounded-lg p-2 text-sm flex-1" value={alertDate} onChange={e => setAlertDate(e.target.value)} />
                  <input type="time" className="border rounded-lg p-2 text-sm flex-1" value={alertTime} onChange={e => setAlertTime(e.target.value)} />
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <select className="border rounded-lg p-2 text-sm flex-1" value={alertGroup} onChange={e => setAlertGroup(e.target.value)}>
                  <option value="">A grupo...</option>
                  {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <select className="border rounded-lg p-2 text-sm flex-1" value={alertTarget} onChange={e => setAlertTarget(e.target.value)}>
                  <option value="">A persona...</option>
                  {allUsers.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <button onClick={createAlert} className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Crear Alerta</button>
              <button onClick={() => setShowAlertForm(false)} className="ml-2 text-gray-500 px-4 py-2 text-sm">Cancelar</button>
            </Card>
          )}
          {alerts.map((a: any) => (
            <Card key={a.id} className="p-4 mb-2">
              <div className="flex justify-between">
                <div>
                  <div className="flex gap-2 items-center">
                    <span className={`px-2 py-0.5 rounded text-xs ${a.isActive ? "bg-green-100 text-green-700" : "bg-gray-100"}`}>{a.isActive ? "Activa" : "Inactiva"}</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{a.type}</span>
                    <span className="text-xs text-gray-400">{a.sendCount} envíos</span>
                  </div>
                  <p className="font-semibold mt-1">{a.title}</p>
                  <p className="text-sm text-gray-600">{a.message}</p>
                </div>
                {isAdmin && <button onClick={() => deleteAlert(a.id)} className="text-red-500 text-xs">✕</button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
