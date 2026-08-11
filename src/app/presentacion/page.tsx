export default function Presentacion() {
  return (
    <html lang="es">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Live Productions GT - Presentación del Sistema</title>
        <style>{`
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#0a0e27;color:#e0e0e0;overflow-x:hidden}
.slide{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:60px 40px;border-bottom:1px solid #1a1f3a}
.slide:nth-child(odd){background:#0d1233}
.slide:nth-child(even){background:#0a0e27}
h1{font-size:clamp(2rem,5vw,4rem);font-weight:800;text-align:center;background:linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:20px}
h2{font-size:clamp(1.5rem,3.5vw,2.5rem);font-weight:700;color:#60a5fa;text-align:center;margin-bottom:40px}
p{font-size:1.1rem;line-height:1.8;color:#94a3b8;max-width:800px;text-align:center;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;max-width:1000px;width:100%}
.card{background:#151939;border-radius:16px;padding:28px;border:1px solid #1e224c;transition:transform .2s}
.card:hover{transform:translateY(-4px);box-shadow:0 8px 32px rgba(96,165,250,.15)}
.card h3{font-size:1.2rem;margin-bottom:8px;color:#e2e8f0}
.card p{font-size:.9rem;color:#64748b;text-align:left}
.card .emoji{font-size:2rem;margin-bottom:12px}
.feature-row{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-width:900px;margin:20px 0}
.badge{background:#1e224c;color:#60a5fa;padding:8px 16px;border-radius:20px;font-size:.85rem;font-weight:600}
.stat{text-align:center}
.stat .num{font-size:3rem;font-weight:800;color:#60a5fa}
.stat .label{color:#64748b;font-size:.9rem}
.stats{display:flex;flex-wrap:wrap;gap:40px;justify-content:center;margin:30px 0}
.cta{background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;padding:16px 40px;border-radius:12px;font-size:1.1rem;font-weight:700;text-decoration:none;display:inline-block;margin-top:20px}
.footer{text-align:center;padding:20px;color:#334155;font-size:.8rem}
pre{background:#0d1233;border-radius:8px;padding:16px;font-size:.85rem;color:#a5b4fc;overflow-x:auto;max-width:500px;line-height:1.6}
@media(max-width:600px){.slide{padding:40px 20px}.grid{grid-template-columns:1fr}}
        `}</style>
      </head>
      <body>
        <div className="slide">
          <h1>Live Productions GT</h1>
          <p style={{fontSize:"1.4rem",color:"#a78bfa",marginBottom:8}}>Sistema Inteligente de Gestión Empresarial</p>
          <p>Potenciado por LUNA - Asistente IA Administrativa</p>
          <div className="feature-row" style={{marginTop:30}}>
            <span className="badge">📋 Tareas</span><span className="badge">📦 Inventario</span>
            <span className="badge">🚛 Vehículos</span><span className="badge">💰 Cobros</span>
            <span className="badge">👥 Personal</span><span className="badge">🎪 Eventos</span>
            <span className="badge">📊 Reportes</span><span className="badge">🤖 IA</span>
          </div>
          <p style={{marginTop:20,color:"#475569"}}>Ing. Jorge Mérida Godoy - Dueño</p>
        </div>

        <div className="slide">
          <h2>El Problema que Resolvemos</h2>
          <div className="grid">
            <div className="card"><div className="emoji">📝</div><h3>Tareas Olvidadas</h3><p>Empleados no saben qué hacer cada día. Las tareas se pierden en chats o en la memoria.</p></div>
            <div className="card"><div className="emoji">📦</div><h3>Inventario Descontrolado</h3><p>No se sabe cuántas bocinas, cables o luces hay. Equipo dañado no se reporta.</p></div>
            <div className="card"><div className="emoji">🚛</div><h3>Vehículos sin Control</h3><p>¿Quién tiene el camión? ¿Cuánto combustible? Sin trazabilidad.</p></div>
            <div className="card"><div className="emoji">💰</div><h3>Cobros Atrasados</h3><p>Clientes que deben dinero. Sin seguimiento formal de cobros pendientes.</p></div>
            <div className="card"><div className="emoji">📊</div><h3>Falta de Reportes</h3><p>El dueño no tiene visibilidad diaria de lo que pasa en su empresa.</p></div>
            <div className="card"><div className="emoji">🔕</div><h3>Comunicación Ineficiente</h3><p>Cada persona recibe instrucciones por separado. Nadie tiene el panorama completo.</p></div>
          </div>
        </div>

        <div className="slide">
          <h2>La Solución: Gestión Total con IA</h2>
          <div className="stats">
            <div className="stat"><div className="num">1</div><div className="label">Sistema unificado</div></div>
            <div className="stat"><div className="num">24/7</div><div className="label">Disponible</div></div>
            <div className="stat"><div className="num">8</div><div className="label">Módulos</div></div>
            <div className="stat"><div className="num">100%</div><div className="label">Por WhatsApp</div></div>
          </div>
          <p style={{fontSize:"1.2rem",marginTop:30}}>Un solo lugar para gestionar TODO. Desde cualquier dispositivo. Con inteligencia artificial que conoce tu negocio.</p>
          <div className="feature-row"><span className="badge">Web</span><span className="badge">WhatsApp</span><span className="badge">App Android</span></div>
        </div>

        <div className="slide">
          <h2>🤖 LUNA - Tu Asistente IA</h2>
          <p style={{fontSize:"1.3rem",color:"#a78bfa",marginBottom:30}}>Como Jarvis, pero para tu empresa de eventos</p>
          <div className="grid">
            <div className="card"><div className="emoji">☀️</div><h3>Briefing Matutino 7AM</h3><p>Cada empleado recibe sus tareas del día con prioridades por WhatsApp.</p></div>
            <div className="card"><div className="emoji">🔔</div><h3>4 Recordatorios al Día</h3><p>10AM, 12PM, 2PM, 4PM - seguimiento automático a cada persona.</p></div>
            <div className="card"><div className="emoji">📊</div><h3>Reporte al Dueño</h3><p>Un solo mensaje consolidado: inactivos, tareas vencidas, cumplimiento.</p></div>
            <div className="card"><div className="emoji">📦</div><h3>Inventario en WhatsApp</h3><p>Preguntá "inventario sonido" y LUNA te dice cuántas bocinas tenés.</p></div>
            <div className="card"><div className="emoji">⏰</div><h3>Recordatorios Dinámicos</h3><p>"LUNA recuérdame llamar a Juan a las 3pm" - avisa 10min antes y a la hora.</p></div>
            <div className="card"><div className="emoji">🏆</div><h3>Ranking de Cumplimiento</h3><p>Quién completó más tareas. Top 3 del mes con medallas.</p></div>
          </div>
        </div>

        <div className="slide">
          <h2>Habla con LUNA por WhatsApp</h2>
          <p style={{marginBottom:20}}>+502 3084 0447 - Todo el sistema desde tu celular</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:20,justifyContent:"center",maxWidth:900}}>
            <div><h3 style={{color:"#60a5fa",textAlign:"left",marginBottom:12}}>📋 Tareas</h3>
              <pre>tareas hoy{'\n'}tareas semana{'\n'}hecho 3{'\n'}posponer 5 para mañana{'\n'}comentar 2 el cliente no contestó{'\n'}transferir 4 a Diana{'\n'}crea tarea revisar equipo viernes</pre>
            </div>
            <div><h3 style={{color:"#a78bfa",textAlign:"left",marginBottom:12}}>🏢 Sistema</h3>
              <pre>inventario{'\n'}inventario sonido{'\n'}vehiculos{'\n'}cobros{'\n'}empleados{'\n'}ranking{'\n'}resumen{'\n'}equipo</pre>
            </div>
            <div><h3 style={{color:"#f472b6",textAlign:"left",marginBottom:12}}>⏰ Recordatorios</h3>
              <pre>recuérdame llamar a Juan 3pm{'\n'}crea recordatorio revisar bodega{'\n'}alerta grupo Logística reunión{'\n'}alerta fija Lunes 9am saludo</pre>
            </div>
          </div>
        </div>

        <div className="slide">
          <h2>Módulos del Sistema Web</h2>
          <div className="grid">
            <div className="card"><div className="emoji">📋</div><h3>Dashboard</h3><p>Vista general, semáforo de accesos, tareas, eventos y notificaciones.</p></div>
            <div className="card"><div className="emoji">✅</div><h3>Tareas</h3><p>Crear, asignar, completar. Fijas diarias/semanales + dinámicas. Historial completo.</p></div>
            <div className="card"><div className="emoji">📊</div><h3>Cumplimiento</h3><p>Porcentaje por persona. Accesos. Ranking mensual con medallas.</p></div>
            <div className="card"><div className="emoji">📦</div><h3>Inventario</h3><p>Audio, iluminación, instrumentos, cableado, mobiliario. Por bodega.</p></div>
            <div className="card"><div className="emoji">🚛</div><h3>Vehículos</h3><p>Flota, placas, conductor, kilometraje, combustible, mantenimiento.</p></div>
            <div className="card"><div className="emoji">👥</div><h3>Personal</h3><p>Registro de empleados con roles, contacto. Control de accesos.</p></div>
            <div className="card"><div className="emoji">💰</div><h3>Cobros</h3><p>Registro de cobros. Pendientes, parciales, completados. Reportes.</p></div>
            <div className="card"><div className="emoji">🎪</div><h3>Eventos</h3><p>Calendario. Planner, responsable, staff. Pre-evento, montaje, post-evento.</p></div>
            <div className="card"><div className="emoji">🔔</div><h3>Notificaciones</h3><p>Grupos, alertas programadas. Notificaciones automáticas por WhatsApp.</p></div>
          </div>
        </div>

        <div className="slide">
          <h2>Cómo Funciona un Día Típico</h2>
          <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:600,alignItems:"stretch"}}>
            <div className="card"><div className="emoji">🌅 7:00 AM</div><p>LUNA envía briefing matutino a cada persona: tareas del día, eventos, prioridades.</p></div>
            <div className="card"><div className="emoji">🔔 10:00 AM</div><p>Primer recordatorio. ¿Ya empezaste tus tareas? LUNA te recuerda las pendientes.</p></div>
            <div className="card"><div className="emoji">🕛 12:00 PM</div><p>Chequeo de mediodía. ¿Quién no ha ingresado? Reporte al dueño.</p></div>
            <div className="card"><div className="emoji">🔔 2:00 PM</div><p>Segundo recordatorio. Las tareas de la tarde necesitan atención.</p></div>
            <div className="card"><div className="emoji">📊 4:00 PM</div><p>Chequeo de accesos. Reporte consolidado: inactivos, bajo umbral, cumplimiento.</p></div>
            <div className="card"><div className="emoji">🌙 5:00 PM</div><p>Cierre de jornada. Tareas no completadas se reprograman. Resumen al dueño.</p></div>
          </div>
        </div>

        <div className="slide">
          <h2>Beneficios para la Empresa</h2>
          <div className="grid">
            <div className="card"><div className="emoji">⏱️</div><h3>Ahorro de Tiempo</h3><p>El dueño ya no persigue a cada empleado. LUNA lo hace automáticamente.</p></div>
            <div className="card"><div className="emoji">📈</div><h3>Control Total</h3><p>Todo en un solo lugar. Sabes qué hace cada persona, qué equipo tienes, cuánto te deben.</p></div>
            <div className="card"><div className="emoji">🎯</div><h3>Responsabilidad</h3><p>Cada empleado sabe sus tareas. Si no las completa, queda registro.</p></div>
            <div className="card"><div className="emoji">🤝</div><h3>Trabajo en Equipo</h3><p>Transferir tareas, comentar avances, ver progreso. Todos conectados.</p></div>
            <div className="card"><div className="emoji">📱</div><h3>Desde el Celular</h3><p>WhatsApp y app Android. Sin instalar nada, sin entrenamiento.</p></div>
            <div className="card"><div className="emoji">🔮</div><h3>Escalabilidad</h3><p>Crece con la empresa. Más empleados, más eventos, más equipo.</p></div>
          </div>
        </div>

        <div className="slide">
          <h2>Listo para Empezar</h2>
          <div className="stats" style={{marginBottom:30}}>
            <div className="stat"><div className="num">admin.liveproductionsgt.com</div><div className="label">Sistema Web</div></div>
            <div className="stat"><div className="num">+502 3084 0447</div><div className="label">WhatsApp LUNA</div></div>
            <div className="stat"><div className="num">24/7</div><div className="label">En línea</div></div>
          </div>
          <p style={{fontSize:"1.3rem",color:"#a78bfa",marginTop:20}}>Hoy comienza una nueva era de gestión para Live Productions GT</p>
          <a href="https://admin.liveproductionsgt.com/dashboard" className="cta">🌐 Entrar al Sistema</a>
        </div>

        <div className="footer">Live Productions GT © 2026 - Tecnología de punta para la industria de eventos en Guatemala</div>
      </body>
    </html>
  );
}
