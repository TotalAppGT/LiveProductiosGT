export type UserRole = 'DUEÑO' | 'ADMIN' | 'JEFE' | 'EMPLEADO';

export type TaskType = 'FIJA' | 'DINAMICA';

export type TaskFrequency = 'DIARIA' | 'SEMANAL' | 'MENSUAL';

export type DayOfWeek =
  | 'LUNES'
  | 'MARTES'
  | 'MIERCOLES'
  | 'JUEVES'
  | 'VIERNES'
  | 'SABADO'
  | 'DOMINGO';

export type TaskStatus =
  | 'PENDIENTE'
  | 'EN_PROCESO'
  | 'COMPLETADA'
  | 'REPROGRAMADA'
  | 'CANCELADA';

export type TaskPriority = 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE';

export type TaskCategory =
  | 'PRE_EVENTO'
  | 'POST_EVENTO'
  | 'COTIZACION'
  | 'COBRO'
  | 'INVENTARIO'
  | 'VEHICULO'
  | 'PERSONAL'
  | 'BODEGA'
  | 'MANTENIMIENTO'
  | 'ADMINISTRACION'
  | 'OTRO';

export type EventStatus =
  | 'COTIZACION'
  | 'CONFIRMADO'
  | 'EN_PROGRESO'
  | 'COMPLETADO'
  | 'CANCELADO';

export type InventoryCategory =
  | 'AUDIO'
  | 'ILUMINACION'
  | 'INSTRUMENTO'
  | 'CABLEADO'
  | 'MOBILIARIO'
  | 'HERRAMIENTA'
  | 'CONSUMIBLE'
  | 'OTRO';

export type InventoryStatus =
  | 'DISPONIBLE'
  | 'ASIGNADO'
  | 'EN_REPARACION'
  | 'PERDIDO'
  | 'DANADO';

export type InventoryLocation =
  | 'BODEGA_ELGIN'
  | 'BODEGA_PP'
  | 'EN_EVENTO'
  | 'EN_RENTA';

export type VehicleStatus =
  | 'DISPONIBLE'
  | 'EN_USO'
  | 'EN_MANTENIMIENTO'
  | 'FUERA_SERVICIO';

export type VehicleType = 'CAMION' | 'PANEL' | 'PICKUP' | 'MOTO' | 'SEDAN' | 'OTRO';

export type CobroStatus = 'PENDIENTE' | 'PARCIAL' | 'COMPLETADO';

export type WhatsAppMessageType =
  | 'TASK_REMINDER'
  | 'EVENT_REMINDER'
  | 'NOTIFICATION'
  | 'ALERT'
  | 'CHAT';

export type WhatsAppMessageStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export type Theme = 'light' | 'dark';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  password?: string;
  name: string;
  phone?: string | null;
  role: UserRole;
  firebaseUid?: string | null;
  avatar?: string | null;
  whatsappNumber?: string | null;
  active: boolean;
  tenantId?: string | null;
  createdAt: string;
  updatedAt: string;
  tenant?: Tenant | null;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  type: TaskType;
  frequency?: TaskFrequency | null;
  dayOfWeek?: DayOfWeek | null;
  dueDate?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  comments?: string | null;
  rescheduledTo?: string | null;
  requiresConfirmation: boolean;
  confirmedAt?: string | null;
  assignedToId?: string | null;
  assignedById?: string | null;
  eventId?: string | null;
  tenantId?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo?: User | null;
  assignedBy?: User | null;
  event?: Event | null;
  tenant?: Tenant | null;
  commentsList?: TaskComment[];
  history?: TaskHistory[];
}

export interface TaskComment {
  id: string;
  content: string;
  taskId: string;
  userId: string;
  createdAt: string;
  task?: Task;
  user?: User;
}

export interface TaskHistory {
  id: string;
  taskId: string;
  userId: string;
  action: string;
  previousStatus?: TaskStatus | null;
  newStatus?: TaskStatus | null;
  createdAt: string;
  task?: Task;
  user?: User;
}

export interface Event {
  id: string;
  name: string;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  date: string;
  location?: string | null;
  guestCount?: number | null;
  status: EventStatus;
  serviceType?: string | null;
  audioType?: string | null;
  plannerId?: string | null;
  responsibleId?: string | null;
  notes?: string | null;
  tenantId?: string | null;
  createdAt: string;
  updatedAt: string;
  planner?: User | null;
  responsible?: User | null;
  tenant?: Tenant | null;
  tasks?: Task[];
  cobros?: Cobro[];
}

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  quantity: number;
  assignedToId?: string | null;
  status: InventoryStatus;
  location: InventoryLocation;
  notes?: string | null;
  lastCheckedAt?: string | null;
  serialNumber?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo?: User | null;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  type: VehicleType;
  status: VehicleStatus;
  assignedToId?: string | null;
  mileage?: number | null;
  fuelLevel?: number | null;
  lastMaintenanceAt?: string | null;
  notes?: string | null;
  tenantId?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo?: User | null;
  tenant?: Tenant | null;
}

export interface Cobro {
  id: string;
  clientName: string;
  amount: number;
  status: CobroStatus;
  invoiceNumber?: string | null;
  dueDate?: string | null;
  assignedToId?: string | null;
  notes?: string | null;
  eventId?: string | null;
  tenantId?: string | null;
  createdAt: string;
  updatedAt: string;
  event?: Event | null;
  assignedTo?: User | null;
  tenant?: Tenant | null;
}

export interface Activity {
  id: string;
  userId: string;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  details?: string | null;
  createdAt: string;
  user?: User;
}

export interface WhatsAppMessage {
  id: string;
  userId: string;
  toNumber: string;
  message: string;
  type: WhatsAppMessageType;
  status: WhatsAppMessageStatus;
  relatedTaskId?: string | null;
  relatedEventId?: string | null;
  createdAt: string;
  user?: User | null;
  relatedTask?: Task | null;
  relatedEvent?: Event | null;
}

export interface CompanyInfo {
  name: string;
  slug: string;
  logo?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardStats {
  totalEvents: number;
  activeEvents: number;
  pendingTasks: number;
  inProgressTasks: number;
  completedTasksToday: number;
  pendingCobros: number;
  totalCobrosAmount: number;
  collectedAmount: number;
  availableVehicles: number;
  inventoryItemsCount: number;
  recentActivities: Activity[];
  upcomingEvents: Event[];
  tasksByStatus: Record<TaskStatus, number>;
  tasksByPriority: Record<TaskPriority, number>;
  eventsByStatus: Record<EventStatus, number>;
  cobrosByStatus: Record<CobroStatus, number>;
}

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: TaskCategory;
  type?: TaskType;
  assignedToId?: string;
  assignedById?: string;
  eventId?: string;
  search?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
}

export interface EventFilters {
  status?: EventStatus;
  dateFrom?: string;
  dateTo?: string;
  plannerId?: string;
  responsibleId?: string;
  search?: string;
}

export interface InventoryFilters {
  category?: InventoryCategory;
  status?: InventoryStatus;
  location?: InventoryLocation;
  assignedToId?: string;
  search?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  initialized: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  whatsappNumber?: string;
}

export interface CreateTenantDTO {
  name: string;
  slug: string;
}

export interface UpdateTenantDTO {
  name?: string;
  slug?: string;
  active?: boolean;
}

export interface CreateUserDTO {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role?: UserRole;
  whatsappNumber?: string;
  tenantId?: string;
}

export interface UpdateUserDTO {
  name?: string;
  email?: string;
  phone?: string;
  role?: UserRole;
  whatsappNumber?: string;
  avatar?: string;
  active?: boolean;
  tenantId?: string;
}

export interface CreateTaskDTO {
  title: string;
  description?: string;
  type?: TaskType;
  frequency?: TaskFrequency;
  dayOfWeek?: DayOfWeek;
  dueDate?: string;
  priority?: TaskPriority;
  category?: TaskCategory;
  assignedToId?: string;
  eventId?: string;
  requiresConfirmation?: boolean;
}

export interface UpdateTaskDTO {
  title?: string;
  description?: string;
  type?: TaskType;
  frequency?: TaskFrequency;
  dayOfWeek?: DayOfWeek;
  dueDate?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: TaskCategory;
  comments?: string;
  rescheduledTo?: string;
  assignedToId?: string;
  eventId?: string;
  requiresConfirmation?: boolean;
  confirmedAt?: string;
}

export interface CreateTaskCommentDTO {
  content: string;
  taskId: string;
}

export interface CreateEventDTO {
  name: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  date: string;
  location?: string;
  guestCount?: number;
  status?: EventStatus;
  serviceType?: string;
  audioType?: string;
  plannerId?: string;
  responsibleId?: string;
  notes?: string;
}

export interface UpdateEventDTO {
  name?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  date?: string;
  location?: string;
  guestCount?: number;
  status?: EventStatus;
  serviceType?: string;
  audioType?: string;
  plannerId?: string;
  responsibleId?: string;
  notes?: string;
}

export interface CreateInventoryItemDTO {
  name: string;
  category?: InventoryCategory;
  quantity?: number;
  assignedToId?: string;
  status?: InventoryStatus;
  location?: InventoryLocation;
  notes?: string;
  serialNumber?: string;
}

export interface UpdateInventoryItemDTO {
  name?: string;
  category?: InventoryCategory;
  quantity?: number;
  assignedToId?: string;
  status?: InventoryStatus;
  location?: InventoryLocation;
  notes?: string;
  serialNumber?: string;
  lastCheckedAt?: string;
}

export interface CreateVehicleDTO {
  name: string;
  plate: string;
  type?: VehicleType;
  status?: VehicleStatus;
  assignedToId?: string;
  mileage?: number;
  fuelLevel?: number;
  notes?: string;
}

export interface UpdateVehicleDTO {
  name?: string;
  plate?: string;
  type?: VehicleType;
  status?: VehicleStatus;
  assignedToId?: string;
  mileage?: number;
  fuelLevel?: number;
  lastMaintenanceAt?: string;
  notes?: string;
}

export interface CreateCobroDTO {
  clientName: string;
  amount: number;
  status?: CobroStatus;
  invoiceNumber?: string;
  dueDate?: string;
  assignedToId?: string;
  notes?: string;
  eventId?: string;
}

export interface UpdateCobroDTO {
  clientName?: string;
  amount?: number;
  status?: CobroStatus;
  invoiceNumber?: string;
  dueDate?: string;
  assignedToId?: string;
  notes?: string;
  eventId?: string;
}

export interface CreateWhatsAppMessageDTO {
  userId: string;
  toNumber: string;
  message: string;
  type?: WhatsAppMessageType;
  relatedTaskId?: string;
  relatedEventId?: string;
}
