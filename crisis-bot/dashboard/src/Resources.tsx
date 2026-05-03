import { useEffect, useState } from 'react';
import {
  allocateResource,
  createResource,
  dashboardTimestamp,
  listResources,
  updateResource,
  type Allocation,
  type DashboardTimestamp,
  type Resource,
} from './api';
import {
  Truck, Users, Home, Flame, Anchor, Stethoscope, MapPin, Phone, User,
  Plus, X, ChevronRight, CheckCircle2, Clock, Wifi, WifiOff, Hash
} from 'lucide-react';

const statusConfig = {
  available: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', badge: 'bg-emerald-500', icon: Wifi },
  deployed: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600', badge: 'bg-blue-500', icon: Truck },
  offline: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-500', badge: 'bg-gray-400', icon: WifiOff },
};

const typeConfig: Record<string, { label: string; icon: typeof Truck }> = {
  ambulance: { label: 'Ambulance', icon: Truck },
  rescue_team: { label: 'Rescue Team', icon: Users },
  shelter: { label: 'Shelter', icon: Home },
  medical_team: { label: 'Medical Team', icon: Stethoscope },
  fire_truck: { label: 'Fire Truck', icon: Flame },
  boat: { label: 'Boat', icon: Anchor },
};

function formatTime(timestamp: DashboardTimestamp | undefined): string {
  if (!timestamp) return '-';
  const date = timestamp.toDate();
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export default function Resources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showAllocateForm, setShowAllocateForm] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const data = await listResources();
      if (!active) return;
      setResources(data);
      setLoading(false);
    };
    load();
    const interval = window.setInterval(load, 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (selected) {
      const updated = resources.find(r => r.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [resources]);

  const deployedCount = resources.filter(r => r.status === 'deployed').length;
  const availableCount = resources.filter(r => r.status === 'available').length;

  const updateStatus = async (resourceId: string, newStatus: string) => {
    const updated = await updateResource(resourceId, {
      status: newStatus,
    });
    setResources((items) => items.map((item) => item.id === resourceId ? updated : item));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          <span>Loading resources...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-160px)]">
      {/* Left Panel - List */}
      <div className="w-[420px] flex flex-col flex-shrink-0">
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-4 rounded-xl bg-blue-50 border-2 border-blue-200">
            <div className="text-3xl font-bold font-mono text-blue-600">{resources.length}</div>
            <div className="text-xs font-medium text-blue-600 opacity-70">TOTAL</div>
          </div>
          <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-200">
            <div className="text-3xl font-bold font-mono text-emerald-600">{availableCount}</div>
            <div className="text-xs font-medium text-emerald-600 opacity-70">AVAILABLE</div>
          </div>
          <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-200">
            <div className="text-3xl font-bold font-mono text-amber-600">{deployedCount}</div>
            <div className="text-xs font-medium text-amber-600 opacity-70">DEPLOYED</div>
          </div>
        </div>

        {/* Add Button */}
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors mb-4"
        >
          <Plus className="w-4 h-4" />
          Add Resource
        </button>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {resources.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Truck className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No resources yet</p>
            </div>
          ) : (
            resources.map((resource) => {
              const config = statusConfig[resource.status] || statusConfig.offline;
              const typeInfo = typeConfig[resource.type] || { label: resource.type, icon: Truck };
              const TypeIcon = typeInfo.icon;
              const isSelected = selected?.id === resource.id;

              return (
                <button
                  key={resource.id}
                  onClick={() => setSelected(resource)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${config.bg} ${config.border} ${
                    isSelected ? 'ring-2 ring-blue-500' : ''
                  } hover:shadow-md`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold text-white ${config.badge}`}>
                          {resource.status.toUpperCase()}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <TypeIcon className="w-3 h-3" />
                          {typeInfo.label}
                        </span>
                      </div>
                      <div className="font-medium text-gray-900">{resource.name}</div>
                      <div className="text-sm text-gray-500 truncate mt-1">
                        {resource.baseLocation?.text || 'No location'}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                    <div className="text-xs text-gray-500">
                      <span className="font-mono font-bold text-gray-900">{resource.available || 0}</span>
                      <span className="mx-1">/</span>
                      <span>{resource.totalCapacity || 0}</span>
                      <span className="ml-1">units</span>
                    </div>
                    {resource.allocations && resource.allocations.length > 0 && (
                      <span className="text-xs text-purple-600 font-medium">
                        {resource.allocations.length} allocated
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Panel - Detail */}
      <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {selected ? (
          <div className="h-full overflow-y-auto">
            {/* Detail Header */}
            {(() => {
              const config = statusConfig[selected.status] || statusConfig.offline;
              const typeInfo = typeConfig[selected.type] || { label: selected.type, icon: Truck };
              const TypeIcon = typeInfo.icon;
              const StatusIcon = config.icon;

              return (
                <div className={`p-6 border-b border-gray-200 ${config.bg}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold text-white ${config.badge}`}>
                      <StatusIcon className="w-3 h-3" />
                      {selected.status.toUpperCase()}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      <TypeIcon className="w-3 h-3" />
                      {typeInfo.label}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900">{selected.name}</h2>

                  {/* Status Actions */}
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {selected.status !== 'available' && (
                      <button
                        onClick={() => updateStatus(selected.id, 'available')}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <Wifi className="w-4 h-4" />
                        Mark Available
                      </button>
                    )}
                    {selected.status !== 'deployed' && (
                      <button
                        onClick={() => updateStatus(selected.id, 'deployed')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <Truck className="w-4 h-4" />
                        Mark Deployed
                      </button>
                    )}
                    {selected.status !== 'offline' && (
                      <button
                        onClick={() => updateStatus(selected.id, 'offline')}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <WifiOff className="w-4 h-4" />
                        Mark Offline
                      </button>
                    )}
                    <button
                      onClick={() => setShowAllocateForm(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Allocate
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Detail Content */}
            <div className="p-6 space-y-6">
              {/* Capacity */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    AVAILABLE
                  </div>
                  <p className="font-mono text-3xl font-bold text-gray-900">{selected.available || 0}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                    <Users className="w-3.5 h-3.5" />
                    TOTAL CAPACITY
                  </div>
                  <p className="font-mono text-3xl font-bold text-gray-900">{selected.totalCapacity || 0}</p>
                </div>
              </div>

              {/* Location */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                  <MapPin className="w-3.5 h-3.5" />
                  BASE LOCATION
                </div>
                <p className="text-gray-900">{selected.baseLocation?.text || '-'}</p>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                    <User className="w-3.5 h-3.5" />
                    CONTACT NAME
                  </div>
                  <p className="text-gray-900">{selected.contactName || '-'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                    <Phone className="w-3.5 h-3.5" />
                    CONTACT PHONE
                  </div>
                  <p className="font-mono text-gray-900">{selected.contactPhone || '-'}</p>
                </div>
              </div>

              {/* Allocations */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-3">
                  <Truck className="w-3.5 h-3.5" />
                  ALLOCATIONS ({selected.allocations?.length || 0})
                </div>
                {selected.allocations && selected.allocations.length > 0 ? (
                  <div className="space-y-2">
                    {selected.allocations.map((alloc, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
                        <div>
                          <span className="font-mono text-sm text-purple-700">{alloc.victimId.slice(0, 16)}...</span>
                          {alloc.notes && <p className="text-xs text-gray-500 mt-1">{alloc.notes}</p>}
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            alloc.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            alloc.status === 'arrived' ? 'bg-blue-100 text-blue-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                            {alloc.status}
                          </span>
                          <p className="text-xs text-gray-400 mt-1">{formatTime(alloc.allocatedAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No allocations</p>
                )}
              </div>

              {/* Timestamps */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                  <Clock className="w-3 h-3" />
                  CREATED
                </div>
                <p className="text-sm text-gray-600">{formatTime(selected.createdAt)}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Hash className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Select a resource to view details</p>
            </div>
          </div>
        )}
      </div>

      {showForm && <AddResourceForm onClose={() => setShowForm(false)} />}
      {showAllocateForm && selected && (
        <AllocateForm
          resource={selected}
          onClose={() => setShowAllocateForm(false)}
        />
      )}
    </div>
  );
}

function AddResourceForm({ onClose }: { onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'ambulance',
    totalCapacity: 1,
    available: 1,
    baseLocation: '',
    contactName: '',
    contactPhone: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    await createResource({
      name: form.name,
      type: form.type,
      totalCapacity: form.totalCapacity,
      available: form.available,
      status: 'available',
      baseLocation: { text: form.baseLocation },
      contactName: form.contactName,
      contactPhone: form.contactPhone,
      allocations: [],
    });

    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">New Resource</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Resource Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Ambulance Unit 1"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ambulance">Ambulance</option>
              <option value="rescue_team">Rescue Team</option>
              <option value="medical_team">Medical Team</option>
              <option value="shelter">Shelter</option>
              <option value="fire_truck">Fire Truck</option>
              <option value="boat">Boat</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Total Capacity</label>
              <input
                type="number"
                min={1}
                value={form.totalCapacity}
                onChange={(e) => setForm({ ...form, totalCapacity: parseInt(e.target.value) || 1 })}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Available</label>
              <input
                type="number"
                min={0}
                value={form.available}
                onChange={(e) => setForm({ ...form, available: parseInt(e.target.value) || 0 })}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Base Location</label>
            <input
              type="text"
              value={form.baseLocation}
              onChange={(e) => setForm({ ...form, baseLocation: e.target.value })}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Hospital A, District B"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Contact Name</label>
              <input
                type="text"
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Contact Phone</label>
              <input
                type="tel"
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-gray-600 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.name}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating...' : 'Create Resource'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AllocateForm({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [victimId, setVictimId] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!victimId.trim()) return;

    setSaving(true);

    const allocation: Allocation = {
      victimId: victimId.trim(),
      status: 'allocated',
      allocatedAt: dashboardTimestamp.now(),
      notes: notes,
    };

    await allocateResource(resource.id, allocation);

    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Allocate {resource.name}</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Case ID</label>
            <input
              type="text"
              value={victimId}
              onChange={(e) => setVictimId(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Paste case/ticket number"
              required
            />
            <p className="text-xs text-gray-400 mt-1">Copy the ticket number from the Cases panel</p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={2}
              placeholder="e.g., ETA 15 minutes"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-gray-600 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !victimId.trim()}
              className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Allocating...' : 'Allocate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
