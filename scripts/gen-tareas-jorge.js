const XLSX = require("xlsx");
const path = require("path");
const os = require("os");

// Días de la semana a número JS (0=domingo, 1=lunes ... 6=sábado)
const DAY_NUM = { DOMINGO: 0, LUNES: 1, MARTES: 2, MIERCOLES: 3, JUEVES: 4, VIERNES: 5, SABADO: 6 };

// Próxima fecha del día de la semana dado (si hoy es ese día, usa hoy; si ya pasó, próxima semana)
function proximaFecha(diaSemana) {
  const d = new Date();
  const target = DAY_NUM[diaSemana];
  const current = d.getDay();
  let diff = target - current;
  if (diff < 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const rows = [];

function addFija(title, categoria, diaSemana, hora, prioridad) {
  rows.push({
    titulo: title,
    asignado_a: "Jorge Mérida",
    categoria,
    tipo: "FIJA",
    frecuencia: "SEMANAL",
    dia_semana: diaSemana,
    fecha: proximaFecha(diaSemana),
    hora: hora || "09:00",
    prioridad: prioridad || "MEDIA",
  });
}

function addVariable(title, categoria, diaSemana, hora, prioridad) {
  rows.push({
    titulo: title,
    asignado_a: "Jorge Mérida",
    categoria,
    tipo: "DINAMICA",
    frecuencia: "",
    dia_semana: "",
    fecha: proximaFecha(diaSemana),
    hora: hora || "09:00",
    prioridad: prioridad || "MEDIA",
  });
}

// ===== PRE EVENTO (fijas semanales, Lunes) =====
addFija("Ofrecer servicio de: Luxury, Charita, Piano y Violin", "PRE_EVENTO", "LUNES", "08:00", "ALTA");
addFija("Verificar con Brenda proveedores y diseños de pista de baile", "PRE_EVENTO", "LUNES", "10:00", "ALTA");
addFija("Ver pendientes del resumen", "PRE_EVENTO", "LUNES", "11:00", "MEDIA");

// ===== POST EVENTO (fijas semanales, Lunes) =====
addFija("Contactar a planner y pedir feedback", "POST_EVENTO", "LUNES", "09:00", "MEDIA");
addFija("Contactar a musicos y pedir feedback", "POST_EVENTO", "LUNES", "10:00", "MEDIA");
addFija("Contactar a clientes y pedir feedback", "POST_EVENTO", "LUNES", "11:00", "MEDIA");
addFija("Revisar y hacer pagos staff y musicos", "POST_EVENTO", "LUNES", "14:00", "ALTA");

// ===== ACTIVIDADES FIJAS DIARIAS (Lunes a Sábado) =====
const diasSemana = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
const fijasDiarias = [
  { t: "Revisar chat de pagos y autorizar BI", h: "08:00", p: "ALTA" },
  { t: "Revisar y enviar cotizaciones a los clientes", h: "09:00", p: "ALTA" },
  { t: "Tener reunion administrativa", h: "10:00", p: "MEDIA" },
  { t: "Llamar a los clientes del año y ofrecerle el servicio de Luxury y Shows", h: "11:00", p: "MEDIA" },
  { t: "Tener reunion con drive (Abel, Diana)", h: "12:00", p: "MEDIA" },
  { t: "Proyecto de calendar con Brenda", h: "13:00", p: "MEDIA" },
  { t: "Ver proveedores semana 7 de noviembre", h: "15:00", p: "BAJA" },
  { t: "Ver proveedores semana 12 de noviembre", h: "15:30", p: "BAJA" },
  { t: "Ver proveedores semana 21 de noviembre", h: "16:00", p: "BAJA" },
  { t: "Ver proveedores semana 28 de noviembre", h: "16:30", p: "BAJA" },
];
for (const dia of diasSemana) {
  for (const f of fijasDiarias) {
    addFija(f.t, "ADMINISTRACION", dia, f.h, f.p);
  }
}

// Fija adicional del martes
addFija("Llamada con Selvin, Abel, Exequiel: cosas que salieron mal y logistica", "ADMINISTRACION", "MARTES", "14:00", "ALTA");

// ===== VARIABLES (puntuales por día) =====
addVariable("Hablar con Fatima de bodega piedra parada", "BODEGA", "LUNES", "09:00");
addVariable("Hablar con Brandon Ruch", "PERSONAL", "LUNES", "10:00");
addVariable("Hablar con Javier sobre evento de esta semana", "EVENTO", "LUNES", "11:00");
addVariable("Hablar con Marvin Bucu para situacion laboral actual", "PERSONAL", "LUNES", "12:00");
addVariable("Retroalimentacion de los musicos", "POST_EVENTO", "LUNES", "13:00");
addVariable("Tener llamada con Javier Sempe sobre evento sabado 15 de agosto", "EVENTO", "MARTES", "09:00");
addVariable("Ver el audio para el 22 de agosto", "EVENTO", "MIERCOLES", "09:00");
addVariable("Llamar a staff de eventos fin de semana", "PERSONAL", "JUEVES", "09:00");
addVariable("Mandar playlists grupos", "EVENTO", "VIERNES", "09:00");
addVariable("Llamar a musicos", "EVENTO", "SABADO", "09:00");
addVariable("Revisar eventos", "EVENTO", "SABADO", "10:00");
addVariable("Cargar equipo sunday", "EVENTO", "SABADO", "11:00");

const ws = XLSX.utils.json_to_sheet(rows);
ws["!cols"] = [
  { wch: 55 }, { wch: 16 }, { wch: 18 }, { wch: 11 }, { wch: 12 }, { wch: 13 }, { wch: 12 }, { wch: 8 }, { wch: 12 },
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Tareas Jorge");

const outPath = path.join(process.cwd(), "tareas-jorge-merida.xlsx");
XLSX.writeFile(wb, outPath);

const desktop = path.join(os.homedir(), "Desktop", "Tareas Jorge Merida.xlsx");
try { XLSX.writeFile(wb, desktop); } catch (e) { console.log("Desktop error:", e.message); }

console.log("Creadas", rows.length, "tareas en:", outPath);
console.log("Desktop:", desktop);
console.log("FIJAS:", rows.filter(r => r.tipo === "FIJA").length, "| DINAMICAS:", rows.filter(r => r.tipo === "DINAMICA").length);
