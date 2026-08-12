"use client";

import { useState, useEffect, useCallback } from "react";
import { Truck, Plus, Camera, Fuel, Check, FileText, Car } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

export default function BitacoraVehiculosPage() {
  const { user, token } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStart, setShowStart] = useState(false);
  const [activeLog, setActiveLog] = useState<any | null>(null);

  // Start form
  const [vehicleId, setVehicleId] = useState("");
  const [plate, setPlate] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [startKm, setStartKm] = useState("");
  const [startWater, setStartWater] = useState("Normal");
  const [startOil, setStartOil] = useState("Normal");
  const [startPhotos, setStartPhotos] = useState<string[]>([]);
  const [startComment, setStartComment] = useState("");

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [lRes, vRes] = await Promise.all([
        fetch("/api/vehicle-logs", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/vehicles", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const lJson = await lRes.json();
      const vJson = await vRes.json();
      if (lJson.success) setLogs(lJson.data);
      if (vJson.success) setVehicles(vJson.data);
    } catch {
      toast.error("Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function onSelectVehicle(vId: string) {
    const v = vehicles.find((x) => x.id === vId);
    setVehicleId(vId);
    setPlate(v?.plate || "");
    setVehicleType(v?.type || "");
  }

  async function uploadCameraPhoto(callback: (url: string) => void) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/files/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json();
      if (json.success) callback(json.data.fileUrl);
    };
    input.click();
  }

  async function startLog() {
    if (!plate || !vehicleType || !startKm) return toast.error("Completa vehículo, placa y kilometraje");
    if (startPhotos.length < 6) return toast.error("Debes tomar las 6 fotos obligatorias");
    const res = await fetch("/api/vehicle-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ vehicleId, plate, vehicleType, startKm, startWater, startOil, startPhotos, startComment }),
    });
    const json = await res.json();
    if (json.success) {
      toast.success("Bitácora iniciada");
      setShowStart(false);
      resetStartForm();
      fetchData();
    } else toast.error(json.error || "Error");
  }

  function resetStartForm() {
    setVehicleId(""); setPlate(""); setVehicleType(""); setStartKm("");
    setStartWater("Normal"); setStartOil("Normal"); setStartPhotos([]); setStartComment("");
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Truck className="w-6 h-6" /> Bitácora de Vehículos
        </h1>
        <Button onClick={() => setShowStart(true)}>
          <Plus className="w-4 h-4 mr-1" /> Iniciar Uso
        </Button>
      </div>

      <div className="grid gap-3">
        {logs.map((log) => (
          <Card key={log.id} className="p-4 cursor-pointer hover:border-blue-400" onClick={() => setActiveLog(log)}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-blue-600">{log.plate}</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    log.status === "EN_USO" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                  }`}>
                    {log.status === "EN_USO" ? "En uso" : "Finalizado"}
                  </span>
                </div>
                <h3 className="font-semibold mt-1">{log.vehicleType}</h3>
                <p className="text-xs text-gray-400">
                  {log.driver?.name} · Salida: {new Date(log.startAt).toLocaleString("es-GT")} · {log.startKm} km
                </p>
              </div>
              <Car className="w-5 h-5 text-gray-400" />
            </div>
          </Card>
        ))}
        {logs.length === 0 && <p className="text-center text-gray-400 py-8">No hay bitácoras. Inicia una con "Iniciar Uso".</p>}
      </div>

      {/* Modal inicio */}
      <Modal isOpen={showStart} onClose={() => setShowStart(false)} title="Iniciar Bitácora de Vehículo" size="lg">
        <div className="space-y-4 p-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vehículo</label>
            <select value={vehicleId} onChange={(e) => onSelectVehicle(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
              <option value="">Seleccionar vehículo...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.type} - {v.plate} ({v.name})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Placa" value={plate} onChange={(e) => setPlate(e.target.value)} />
            <Input label="Tipo vehículo" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="Camión, Panel, Pickup..." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Kilometraje" type="number" value={startKm} onChange={(e) => setStartKm(e.target.value)} />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agua</label>
              <select value={startWater} onChange={(e) => setStartWater(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 text-sm text-gray-900 dark:text-white">
                <option>Normal</option><option>Bajo</option><option>Crítico</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Aceite</label>
              <select value={startOil} onChange={(e) => setStartOil(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 text-sm text-gray-900 dark:text-white">
                <option>Normal</option><option>Bajo</option><option>Crítico</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fotos obligatorias ({startPhotos.length}/6)</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {["Frontal", "Trasera", "Lateral izq", "Lateral der", "Tablero/KM", "Interior"].map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => uploadCameraPhoto((url) => {
                    const arr = [...startPhotos];
                    arr[i] = url;
                    setStartPhotos(arr);
                  })}
                  className={`border-2 border-dashed rounded-lg p-3 text-center text-xs font-medium ${
                    startPhotos[i] ? "border-green-500 text-green-600 bg-green-50" : "border-blue-400 text-blue-600"
                  }`}
                >
                  <Camera className="w-4 h-4 mx-auto mb-1" />
                  {startPhotos[i] ? "✅ " + label : label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={startComment}
            onChange={(e) => setStartComment(e.target.value)}
            placeholder="Observación o comentario (opcional)"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
            rows={2}
          />

          <Button onClick={startLog} className="w-full">
            <Check className="w-4 h-4 mr-1" /> Iniciar Bitácora
          </Button>
        </div>
      </Modal>

      {activeLog && (
        <VehicleLogDetail
          log={activeLog}
          onClose={() => setActiveLog(null)}
          token={token || ""}
          onUpdated={fetchData}
        />
      )}
    </div>
  );
}

function VehicleLogDetail({ log, onClose, token, onUpdated }: { log: any; onClose: () => void; token: string; onUpdated: () => void }) {
  const [current, setCurrent] = useState<any>(log);
  const [showFuel, setShowFuel] = useState(false);
  const [fuelKmBefore, setFuelKmBefore] = useState("");
  const [fuelKmAfter, setFuelKmAfter] = useState("");
  const [fuelAmount, setFuelAmount] = useState("");
  const [fuelPhotos, setFuelPhotos] = useState<string[]>([]);
  const [endKm, setEndKm] = useState("");
  const [endWater, setEndWater] = useState("Normal");
  const [endOil, setEndOil] = useState("Normal");
  const [endPhotos, setEndPhotos] = useState<string[]>([]);
  const [endComment, setEndComment] = useState("");

  async function uploadCameraPhoto(callback: (url: string) => void) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/files/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
      const json = await res.json();
      if (json.success) callback(json.data.fileUrl);
    };
    input.click();
  }

  async function addFuel() {
    if (fuelPhotos.length < 4) return toast.error("Se requieren las 4 fotos de combustible");
    const res = await fetch(`/api/vehicle-logs/${log.id}/fuel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kmBefore: fuelKmBefore, kmAfter: fuelKmAfter, amount: fuelAmount, photos: fuelPhotos }),
    });
    const json = await res.json();
    if (json.success) {
      toast.success("Carga de combustible registrada");
      setShowFuel(false);
      setFuelKmBefore(""); setFuelKmAfter(""); setFuelAmount(""); setFuelPhotos([]);
      onUpdated();
    } else toast.error(json.error || "Error");
  }

  async function finishLog() {
    if (!endKm) return toast.error("Kilometraje final requerido");
    if (endPhotos.length < 4) return toast.error("Se requieren las 4 fotos de retorno");
    const res = await fetch(`/api/vehicle-logs/${log.id}/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endKm, endWater, endOil, endPhotos, endComment }),
    });
    const json = await res.json();
    if (json.success) {
      toast.success("Bitácora finalizada");
      onUpdated();
      onClose();
    } else toast.error(json.error || "Error");
  }

  const isActive = current.status === "EN_USO";

  return (
    <Modal isOpen onClose={onClose} title={`Bitácora ${log.plate} - ${log.vehicleType}`} size="lg">
      <div className="space-y-4 p-1">
        <div className="flex gap-2">
          <a href={`/api/vehicle-logs/${log.id}/print`} target="_blank" className="text-xs text-gray-800 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg">
            <FileText className="w-3 h-3 inline mr-1" /> Ver PDF / Imprimir
          </a>
          {isActive && (
            <button onClick={() => setShowFuel(!showFuel)} className="text-xs text-yellow-900 bg-yellow-100 hover:bg-yellow-200 px-3 py-1.5 rounded-lg">
              <Fuel className="w-3 h-3 inline mr-1" /> Registrar Gasolina
            </button>
          )}
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-900 dark:text-gray-100">
          <p><strong>Salida:</strong> {new Date(log.startAt).toLocaleString("es-GT")} · {log.startKm} km</p>
          <p><strong>Agua:</strong> {log.startWater || "—"} · <strong>Aceite:</strong> {log.startOil || "—"}</p>
          {(log.fuelEntries || []).map((f: any, i: number) => (
            <p key={i} className="text-xs text-gray-600 dark:text-gray-300">⛽ Gasolina {i+1}: {f.kmBefore}→{f.kmAfter} km {f.amount ? `· ${f.amount}` : ""}</p>
          ))}
        </div>

        {showFuel && isActive && (
          <div className="border rounded-lg p-3 space-y-3">
            <p className="font-medium text-sm">Registro de Combustible</p>
            <div className="grid grid-cols-3 gap-2">
              <Input label="KM antes" type="number" value={fuelKmBefore} onChange={(e) => setFuelKmBefore(e.target.value)} />
              <Input label="KM después" type="number" value={fuelKmAfter} onChange={(e) => setFuelKmAfter(e.target.value)} />
              <Input label="Monto Q" value={fuelAmount} onChange={(e) => setFuelAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fotos ({fuelPhotos.length}/4)</label>
              <div className="grid grid-cols-2 gap-2">
                {["Tablero antes", "Bomba/Gasolinera", "Factura", "Tablero después"].map((label, i) => (
                  <button key={label} type="button" onClick={() => uploadCameraPhoto((url) => { const arr = [...fuelPhotos]; arr[i] = url; setFuelPhotos(arr); })}
                    className={`border-2 border-dashed rounded-lg p-2 text-center text-xs font-medium ${fuelPhotos[i] ? "border-green-600 text-green-700 bg-green-50" : "border-yellow-500 text-yellow-800"}`}>
                    <Camera className="w-4 h-4 mx-auto mb-1" />{fuelPhotos[i] ? "✅ " + label : label}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={addFuel} className="w-full">Registrar Gasolina</Button>
          </div>
        )}

        {isActive && (
          <div className="border rounded-lg p-3 space-y-3">
            <p className="font-medium text-sm">Finalizar Bitácora (Retorno)</p>
            <div className="grid grid-cols-3 gap-2">
              <Input label="KM final" type="number" value={endKm} onChange={(e) => setEndKm(e.target.value)} />
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Agua</label>
                <select value={endWater} onChange={(e) => setEndWater(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 text-sm text-gray-900 dark:text-white">
                  <option>Normal</option><option>Bajo</option><option>Crítico</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Aceite</label>
                <select value={endOil} onChange={(e) => setEndOil(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 text-sm text-gray-900 dark:text-white">
                  <option>Normal</option><option>Bajo</option><option>Crítico</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fotos de retorno ({endPhotos.length}/4)</label>
              <div className="grid grid-cols-2 gap-2">
                {["Frontal", "Trasera", "Lateral izq", "Lateral der"].map((label, i) => (
                  <button key={label} type="button" onClick={() => uploadCameraPhoto((url) => { const arr = [...endPhotos]; arr[i] = url; setEndPhotos(arr); })}
                    className={`border-2 border-dashed rounded-lg p-2 text-center text-xs ${endPhotos[i] ? "border-green-500 text-green-600" : "border-blue-400 text-blue-600"}`}>
                    <Camera className="w-4 h-4 mx-auto mb-1" />{endPhotos[i] ? "✅ " + label : label}
                  </button>
                ))}
              </div>
            </div>
            <textarea value={endComment} onChange={(e) => setEndComment(e.target.value)} placeholder="Observación de retorno (opcional)" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white" rows={2} />
            <Button onClick={finishLog} className="w-full bg-green-600">
              <Check className="w-4 h-4 mr-1" /> Finalizar Bitácora
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
