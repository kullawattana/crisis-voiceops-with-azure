export type Priority = 'RED' | 'YELLOW' | 'GREEN';

export interface DashboardTimestamp {
  seconds: number;
  toDate: () => Date;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function toDashboardTimestamp(value: unknown): DashboardTimestamp | undefined {
  if (!value) return undefined;

  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = Number((value as { seconds: number }).seconds);
    return { seconds, toDate: () => new Date(seconds * 1000) };
  }

  if (typeof value === 'string' || value instanceof Date) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return { seconds: Math.floor(date.getTime() / 1000), toDate: () => date };
    }
  }

  return undefined;
}

function timestampNow(): DashboardTimestamp {
  const date = new Date();
  return { seconds: Math.floor(date.getTime() / 1000), toDate: () => date };
}

function timestampFromDate(date: Date): DashboardTimestamp {
  return { seconds: Math.floor(date.getTime() / 1000), toDate: () => date };
}

function serialize(value: unknown): unknown {
  if (value && typeof value === 'object' && 'toDate' in value) {
    return (value as DashboardTimestamp).toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, serialize(val)])
    );
  }
  return value;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status}`);
  }
  return response.json();
}

export interface CallRecord {
  direction: 'inbound' | 'outbound';
  callType: 'initial' | 'callback' | 'pulse_check';
  startedAt?: DashboardTimestamp;
  durationSec: number;
  summary: string;
  guidanceGiven: string;
  telephonyId: string;
}

export interface AssignedResource {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  assignedAt?: DashboardTimestamp;
  status: 'assigned' | 'dispatched' | 'arrived' | 'completed';
}

export interface Victim {
  id: string;
  ticketNumber: string;
  phoneNumber: string;
  primaryLanguage: string;
  location: { text: string };
  victimCount: number;
  situationType: string;
  condition: string;
  priority: Priority;
  priorityReason: string;
  status: 'pending' | 'contacted' | 'resolved' | 'closed';
  injuryDetails: string;
  helpNeeded: string;
  createdAt?: DashboardTimestamp;
  updatedAt?: DashboardTimestamp;
  lastContactAt?: DashboardTimestamp;
  nextPulseAt?: DashboardTimestamp;
  callbackDueAt?: DashboardTimestamp;
  notes: string;
  aiTranscript: string;
  callHistory: CallRecord[];
  assignedResources: AssignedResource[];
}

export interface Allocation {
  victimId: string;
  status: 'allocated' | 'dispatched' | 'arrived' | 'completed';
  allocatedAt?: DashboardTimestamp;
  notes: string;
}

export interface Resource {
  id: string;
  type: string;
  name: string;
  totalCapacity: number;
  available: number;
  status: 'available' | 'deployed' | 'offline';
  contactPhone: string;
  contactName: string;
  baseLocation: { text: string };
  allocations: Allocation[];
  createdAt?: DashboardTimestamp;
  updatedAt?: DashboardTimestamp;
}

function normalizeCase(raw: Record<string, unknown>): Victim {
  const id = String(raw.id || raw.case_id || raw.ticketNumber || '');
  const location =
    typeof raw.location === 'object' && raw.location !== null
      ? raw.location as { text: string }
      : { text: String(raw.location_text || raw.location || '') };
  const immediateNeeds = Array.isArray(raw.immediate_needs)
    ? raw.immediate_needs.join(', ')
    : raw.immediate_needs;

  return {
    id,
    ticketNumber: String(raw.ticketNumber || raw.case_id || id),
    phoneNumber: String(raw.phoneNumber || raw.phone_number || ''),
    primaryLanguage: String(raw.primaryLanguage || raw.primary_language || 'Thai'),
    location,
    victimCount: Number(raw.victimCount || raw.people_affected || 1),
    situationType: String(raw.situationType || raw.incident_type || raw.condition || 'unknown'),
    condition: String(raw.condition || raw.situationType || raw.incident_type || ''),
    priority: (raw.priority || raw.triage_level || 'GREEN') as Priority,
    priorityReason: String(raw.priorityReason || raw.triage_reason || ''),
    status: (raw.status || 'pending') as Victim['status'],
    injuryDetails: String(raw.injuryDetails || raw.injuries || ''),
    helpNeeded: String(raw.helpNeeded || immediateNeeds || ''),
    createdAt: toDashboardTimestamp(raw.createdAt || raw.created_at),
    updatedAt: toDashboardTimestamp(raw.updatedAt || raw.updated_at),
    lastContactAt: toDashboardTimestamp(raw.lastContactAt),
    nextPulseAt: toDashboardTimestamp(raw.nextPulseAt),
    callbackDueAt: toDashboardTimestamp(raw.callbackDueAt),
    notes: String(raw.notes || ''),
    aiTranscript: String(raw.aiTranscript || ''),
    callHistory: ((raw.callHistory as CallRecord[]) || []).map((call) => ({
      ...call,
      startedAt: toDashboardTimestamp(call.startedAt),
    })),
    assignedResources: ((raw.assignedResources as AssignedResource[]) || []).map((assignment) => ({
      ...assignment,
      assignedAt: toDashboardTimestamp(assignment.assignedAt),
    })),
  };
}

function normalizeResource(raw: Record<string, unknown>): Resource {
  const baseLocation =
    typeof raw.baseLocation === 'object' && raw.baseLocation !== null
      ? raw.baseLocation as { text: string }
      : { text: String(raw.baseLocation || '') };

  return {
    id: String(raw.id || ''),
    type: String(raw.type || 'rescue_team'),
    name: String(raw.name || ''),
    totalCapacity: Number(raw.totalCapacity || 0),
    available: Number(raw.available || 0),
    status: (raw.status || 'available') as Resource['status'],
    contactPhone: String(raw.contactPhone || ''),
    contactName: String(raw.contactName || ''),
    baseLocation,
    allocations: ((raw.allocations as Allocation[]) || []).map((allocation) => ({
      ...allocation,
      allocatedAt: toDashboardTimestamp(allocation.allocatedAt),
    })),
    createdAt: toDashboardTimestamp(raw.createdAt),
    updatedAt: toDashboardTimestamp(raw.updatedAt),
  };
}

export async function listCases(): Promise<Victim[]> {
  const data = await request<Record<string, unknown>[]>('/api/cases');
  return data.map(normalizeCase);
}

export async function createCase(payload: Record<string, unknown>): Promise<Victim> {
  const data = await request<Record<string, unknown>>('/api/cases', {
    method: 'POST',
    body: JSON.stringify(serialize(payload)),
  });
  return normalizeCase(data);
}

export async function updateCase(id: string, payload: Record<string, unknown>): Promise<Victim> {
  const data = await request<Record<string, unknown>>(`/api/cases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(serialize(payload)),
  });
  return normalizeCase(data);
}

export async function assignCaseResource(id: string, payload: AssignedResource): Promise<Victim> {
  const data = await request<Record<string, unknown>>(`/api/cases/${id}/assign-resource`, {
    method: 'POST',
    body: JSON.stringify(serialize(payload)),
  });
  return normalizeCase(data);
}

export async function listResources(): Promise<Resource[]> {
  const data = await request<Record<string, unknown>[]>('/api/resources');
  return data.map(normalizeResource);
}

export async function createResource(payload: Record<string, unknown>): Promise<Resource> {
  const data = await request<Record<string, unknown>>('/api/resources', {
    method: 'POST',
    body: JSON.stringify(serialize(payload)),
  });
  return normalizeResource(data);
}

export async function updateResource(id: string, payload: Record<string, unknown>): Promise<Resource> {
  const data = await request<Record<string, unknown>>(`/api/resources/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(serialize(payload)),
  });
  return normalizeResource(data);
}

export async function allocateResource(id: string, payload: Allocation): Promise<Resource> {
  const data = await request<Record<string, unknown>>(`/api/resources/${id}/allocate`, {
    method: 'POST',
    body: JSON.stringify(serialize(payload)),
  });
  return normalizeResource(data);
}

export const dashboardTimestamp = {
  now: timestampNow,
  fromDate: timestampFromDate,
};
