import { useEffect, useState } from 'react';
import {
  assignCaseResource,
  createCase,
  dashboardTimestamp,
  listCases,
  listResources,
  updateCase,
  updateResource,
  type AssignedResource,
  type DashboardTimestamp,
  type Resource,
  type Victim,
} from './api';
import {
  Phone, MapPin, Clock, Users, AlertCircle, CheckCircle2, XCircle,
  ChevronRight, Plus, X, Timer, Heart, Truck, MessageSquare,
  Globe, Hash, FileText, Calendar, PhoneCall, ArrowUpRight
} from 'lucide-react';

const priorityConfig = {
  RED: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-600',
    badge: 'bg-red-500',
    ring: 'ring-red-300',
  },
  YELLOW: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-600',
    badge: 'bg-amber-500',
    ring: 'ring-amber-300',
  },
  GREEN: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-600',
    badge: 'bg-emerald-500',
    ring: 'ring-emerald-300',
  },
};

const statusConfig: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  pending: { bg: 'bg-orange-100', text: 'text-orange-700', icon: Clock },
  contacted: { bg: 'bg-blue-100', text: 'text-blue-700', icon: PhoneCall },
  resolved: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 },
  closed: { bg: 'bg-gray-100', text: 'text-gray-600', icon: XCircle },
};

function formatTime(timestamp: DashboardTimestamp | undefined): string {
  if (!timestamp) return '-';
  const date = timestamp.toDate();
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDate(timestamp: DashboardTimestamp | undefined): string {
  if (!timestamp) return '-';
  const date = timestamp.toDate();
  return date.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function getTimeRemaining(dueAt: DashboardTimestamp | undefined): { text: string; urgent: boolean; overdue: boolean } {
  if (!dueAt) return { text: '-', urgent: false, overdue: false };
  const now = new Date();
  const due = dueAt.toDate();
  const diff = due.getTime() - now.getTime();
  if (diff < 0) return { text: 'OVERDUE', urgent: true, overdue: true };
  const minutes = Math.floor(diff / 60000);
  if (minutes < 10) return { text: `${minutes}m`, urgent: true, overdue: false };
  if (minutes < 60) return { text: `${minutes}m`, urgent: false, overdue: false };
  const hours = Math.floor(minutes / 60);
  return { text: `${hours}h ${minutes % 60}m`, urgent: false, overdue: false };
}

export default function Victims() {
  const [victims, setVictims] = useState<Victim[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [showClosed, setShowClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Victim | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [showAssignResource, setShowAssignResource] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const data = await listCases();
      if (!active) return;
      setVictims(data);
      setLoading(false);
    };
    load();
    const interval = window.setInterval(load, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const data = await listResources();
      if (active) setResources(data);
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
      const updated = victims.find(v => v.id === selected.id);
      if (updated) setSelected(updated);
    } else if (victims.length > 0 && !loading) {
      // Auto-select first victim on load
      const firstVisible = victims.filter(v => v.status !== 'closed')[0] || victims[0];
      if (firstVisible) setSelected(firstVisible);
    }
  }, [victims, loading]);

  const visibleVictims = showClosed
    ? victims
    : victims.filter(v => v.status !== 'closed');

  const priorityOrder = { RED: 0, YELLOW: 1, GREEN: 2 };
  const sortedVictims = [...visibleVictims].sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });

  const filteredVictims = filter === 'all'
    ? sortedVictims
    : sortedVictims.filter(v => v.priority === filter);

  const counts = {
    RED: visibleVictims.filter(v => v.priority === 'RED').length,
    YELLOW: visibleVictims.filter(v => v.priority === 'YELLOW').length,
    GREEN: visibleVictims.filter(v => v.priority === 'GREEN').length,
    closed: victims.filter(v => v.status === 'closed').length,
  };

  const updateStatus = async (victimId: string, newStatus: string) => {
    const updated = await updateCase(victimId, {
      status: newStatus,
    });
    setVictims((items) => items.map((item) => item.id === victimId ? updated : item));
  };

  const saveNotes = async () => {
    if (!selected) return;
    const updated = await updateCase(selected.id, {
      notes: notesValue,
    });
    setVictims((items) => items.map((item) => item.id === selected.id ? updated : item));
    setEditingNotes(false);
  };

  const startEditNotes = () => {
    setNotesValue(selected?.notes || '');
    setEditingNotes(true);
  };

  const assignResource = async (resourceId: string) => {
    if (!selected) return;
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return;

    const assignment: AssignedResource = {
      resourceId: resource.id,
      resourceName: resource.name,
      resourceType: resource.type,
      assignedAt: dashboardTimestamp.now(),
      status: 'assigned',
    };

    const updatedCase = await assignCaseResource(selected.id, assignment);

    const updatedResource = await updateResource(resourceId, {
      available: Math.max(0, (resource.available || 0) - 1),
      status: 'deployed',
    });

    setVictims((items) => items.map((item) => item.id === selected.id ? updatedCase : item));
    setResources((items) => items.map((item) => item.id === resourceId ? updatedResource : item));
    setShowAssignResource(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          <span>Loading cases...</span>
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
          {(['RED', 'YELLOW', 'GREEN'] as const).map((priority) => {
            const config = priorityConfig[priority];
            const isActive = filter === priority;
            return (
              <button
                key={priority}
                onClick={() => setFilter(filter === priority ? 'all' : priority)}
                className={`relative p-4 rounded-xl border-2 transition-all ${config.bg} ${config.border} ${
                  isActive ? `ring-2 ${config.ring}` : ''
                } hover:shadow-md`}
              >
                <div className={`text-3xl font-bold font-mono ${config.text}`}>
                  {counts[priority]}
                </div>
                <div className={`text-xs font-medium ${config.text} opacity-70`}>
                  {priority}
                </div>
                {priority === 'RED' && counts.RED > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="flex gap-2 mb-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Cases ({visibleVictims.length})</option>
            <option value="RED">RED Only ({counts.RED})</option>
            <option value="YELLOW">YELLOW Only ({counts.YELLOW})</option>
            <option value="GREEN">GREEN Only ({counts.GREEN})</option>
          </select>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>

        <label className="flex items-center gap-2 mb-4 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Show closed ({counts.closed})
        </label>

        {/* Case List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {filteredVictims.map((victim) => {
            const config = victim.status === 'closed'
              ? { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-500' }
              : priorityConfig[victim.priority];
            const timeInfo = getTimeRemaining(victim.callbackDueAt);
            const isSelected = selected?.id === victim.id;

            return (
              <button
                key={victim.id}
                onClick={() => setSelected(victim)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${config.bg} ${config.border} ${
                  isSelected ? 'ring-2 ring-blue-500' : ''
                } ${victim.status === 'closed' ? 'opacity-60' : ''} hover:shadow-md`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-sm text-gray-900">
                        {victim.ticketNumber || '-'}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold text-white ${
                        victim.status === 'closed' ? 'bg-gray-400' : priorityConfig[victim.priority].badge
                      }`}>
                        {victim.priority}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 truncate">
                      <span className="text-gray-500">{victim.situationType || 'Unknown'}</span>
                      {victim.location?.text && (
                        <>
                          <span className="mx-1.5">·</span>
                          <span>{victim.location.text}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Phone className="w-3 h-3" />
                    <span className="font-mono">{victim.phoneNumber || 'No phone'}</span>
                  </div>
                  {victim.status !== 'closed' && victim.status !== 'resolved' && (
                    <div className={`flex items-center gap-1.5 text-xs font-medium ${
                      timeInfo.overdue ? 'text-red-600' : timeInfo.urgent ? 'text-amber-600' : 'text-gray-500'
                    }`}>
                      <Timer className="w-3 h-3" />
                      {timeInfo.text}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {filteredVictims.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No cases found</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Detail */}
      <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {selected ? (
          <div className="h-full overflow-y-auto">
            {/* Detail Header */}
            <div className={`p-6 border-b border-gray-200 ${
              selected.status === 'closed' ? 'bg-gray-50' : priorityConfig[selected.priority].bg
            }`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono font-bold text-xl text-gray-900">
                      {selected.ticketNumber || '-'}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold text-white ${
                      selected.status === 'closed' ? 'bg-gray-400' : priorityConfig[selected.priority].badge
                    }`}>
                      {selected.priority}
                    </span>
                    {(() => {
                      const StatusIcon = statusConfig[selected.status]?.icon || Clock;
                      return (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${
                          statusConfig[selected.status]?.bg
                        } ${statusConfig[selected.status]?.text}`}>
                          <StatusIcon className="w-3 h-3" />
                          {selected.status.toUpperCase()}
                        </span>
                      );
                    })()}
                    {selected.primaryLanguage && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-purple-100 text-purple-700">
                        <Globe className="w-3 h-3" />
                        {selected.primaryLanguage}
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 capitalize">
                    {selected.situationType || 'Unknown Situation'}
                  </h2>
                </div>
              </div>

              {/* Status Actions */}
              <div className="flex gap-2 mt-4 flex-wrap">
                {selected.status === 'pending' && (
                  <button
                    onClick={() => updateStatus(selected.id, 'contacted')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <PhoneCall className="w-4 h-4" />
                    Mark Contacted
                  </button>
                )}
                {(selected.status === 'pending' || selected.status === 'contacted') && (
                  <button
                    onClick={() => updateStatus(selected.id, 'resolved')}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Mark Resolved
                  </button>
                )}
                {selected.status !== 'closed' && (
                  <button
                    onClick={() => updateStatus(selected.id, 'closed')}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    Close Case
                  </button>
                )}
                {selected.status === 'closed' && (
                  <button
                    onClick={() => updateStatus(selected.id, 'pending')}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    Reopen
                  </button>
                )}
              </div>
            </div>

            {/* Detail Content */}
            <div className="p-6 space-y-6">
              {/* Key Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                    <Phone className="w-3.5 h-3.5" />
                    PHONE
                  </div>
                  <p className="font-mono text-lg text-gray-900">{selected.phoneNumber || '-'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                    <Users className="w-3.5 h-3.5" />
                    VICTIMS
                  </div>
                  <p className="font-mono text-3xl font-bold text-gray-900">{selected.victimCount || 1}</p>
                </div>
              </div>

              {/* Location */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                  <MapPin className="w-3.5 h-3.5" />
                  LOCATION
                </div>
                <p className="text-gray-900">{selected.location?.text || '-'}</p>
              </div>

              {/* Callback Timer */}
              {selected.status !== 'closed' && selected.status !== 'resolved' && (
                <div className="grid grid-cols-2 gap-4">
                  {(() => {
                    const timeInfo = getTimeRemaining(selected.callbackDueAt);
                    return (
                      <div className={`rounded-xl p-4 border-2 ${
                        timeInfo.overdue
                          ? 'bg-red-50 border-red-200'
                          : timeInfo.urgent
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className={`flex items-center gap-2 text-xs mb-2 ${
                          timeInfo.overdue ? 'text-red-600' : timeInfo.urgent ? 'text-amber-600' : 'text-gray-500'
                        }`}>
                          <Timer className="w-3.5 h-3.5" />
                          CALLBACK DUE
                        </div>
                        <p className={`font-mono text-2xl font-bold ${
                          timeInfo.overdue ? 'text-red-600' : timeInfo.urgent ? 'text-amber-600' : 'text-gray-900'
                        }`}>
                          {timeInfo.text}
                        </p>
                      </div>
                    );
                  })()}
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                      <Clock className="w-3.5 h-3.5" />
                      NEXT PULSE
                    </div>
                    <p className="text-gray-900">{formatTime(selected.nextPulseAt)}</p>
                  </div>
                </div>
              )}

              {/* Injuries & Help Needed */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                    <Heart className="w-3.5 h-3.5" />
                    INJURIES
                  </div>
                  <p className="text-gray-700">{selected.injuryDetails || '-'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                    <Truck className="w-3.5 h-3.5" />
                    HELP NEEDED
                  </div>
                  <p className="text-gray-700">{selected.helpNeeded || '-'}</p>
                </div>
              </div>

              {/* Priority Reason */}
              {selected.priorityReason && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                    <AlertCircle className="w-3.5 h-3.5" />
                    PRIORITY REASON
                  </div>
                  <p className="text-gray-700">{selected.priorityReason}</p>
                </div>
              )}

              {/* Notes */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-gray-500 text-xs">
                    <FileText className="w-3.5 h-3.5" />
                    NOTES
                  </div>
                  {!editingNotes && (
                    <button
                      onClick={startEditNotes}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      Edit
                    </button>
                  )}
                </div>
                {editingNotes ? (
                  <div>
                    <textarea
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={saveNotes}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingNotes(false)}
                        className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600 whitespace-pre-wrap">{selected.notes || 'No notes'}</p>
                )}
              </div>

              {/* Assigned Resources */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-gray-500 text-xs">
                    <Truck className="w-3.5 h-3.5" />
                    ASSIGNED RESOURCES ({selected.assignedResources?.length || 0})
                  </div>
                  <button
                    onClick={() => setShowAssignResource(true)}
                    className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700"
                  >
                    <Plus className="w-3 h-3" />
                    Assign
                  </button>
                </div>

                {selected.assignedResources && selected.assignedResources.length > 0 ? (
                  <div className="space-y-2">
                    {selected.assignedResources.map((res, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
                        <div>
                          <span className="font-medium text-gray-900">{res.resourceName}</span>
                          <span className="ml-2 text-sm text-gray-500">{res.resourceType}</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          res.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                          res.status === 'arrived' ? 'bg-blue-100 text-blue-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {res.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No resources assigned</p>
                )}

                {showAssignResource && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-gray-300">
                    <select
                      onChange={(e) => e.target.value && assignResource(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      defaultValue=""
                    >
                      <option value="">Select resource...</option>
                      {resources.filter(r => r.available > 0 && r.status !== 'offline').map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.type}) - {r.available} available
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowAssignResource(false)}
                      className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Call History */}
              {selected.callHistory && selected.callHistory.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-2 text-gray-500 text-xs mb-3">
                    <MessageSquare className="w-3.5 h-3.5" />
                    CALL HISTORY ({selected.callHistory.length})
                  </div>
                  <div className="space-y-2">
                    {selected.callHistory.map((call, i) => (
                      <div key={i} className="p-3 bg-white rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              call.direction === 'inbound' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {call.direction}
                            </span>
                            <span className="text-sm text-gray-500">{call.callType}</span>
                          </div>
                          <span className="text-xs text-gray-400">{formatTime(call.startedAt)}</span>
                        </div>
                        {call.summary && <p className="text-sm text-gray-600">{call.summary}</p>}
                        {call.durationSec > 0 && (
                          <p className="text-xs text-gray-400 mt-1">{Math.round(call.durationSec)}s</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                <div>
                  <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                    <Calendar className="w-3 h-3" />
                    CREATED
                  </div>
                  <p className="text-sm text-gray-600">{formatDate(selected.createdAt)}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                    <Clock className="w-3 h-3" />
                    LAST CONTACT
                  </div>
                  <p className="text-sm text-gray-600">{formatDate(selected.lastContactAt)}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Hash className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Select a case to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Add Case Modal */}
      {showForm && <AddVictimForm onClose={() => setShowForm(false)} />}
    </div>
  );
}

function AddVictimForm({ onClose }: { onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    phoneNumber: '',
    location: '',
    situationType: 'medical',
    victimCount: 1,
    injuryDetails: '',
    helpNeeded: '',
    priority: 'YELLOW' as 'RED' | 'YELLOW' | 'GREEN',
    priorityReason: '',
    primaryLanguage: 'Thai',
  });

  const generateTicketNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    return `C${year}${month}${day}${seq}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const now = new Date();
    const callbackMinutes = form.priority === 'RED' ? 10 : form.priority === 'YELLOW' ? 30 : 1440;

    await createCase({
      ticketNumber: generateTicketNumber(),
      phoneNumber: form.phoneNumber,
      primaryLanguage: form.primaryLanguage,
      location: { text: form.location },
      victimCount: form.victimCount,
      situationType: form.situationType,
      condition: form.situationType,
      injuryDetails: form.injuryDetails,
      helpNeeded: form.helpNeeded,
      priority: form.priority,
      priorityReason: form.priorityReason,
      status: 'pending',
      lastContactAt: now.toISOString(),
      nextPulseAt: dashboardTimestamp.fromDate(new Date(now.getTime() + 60 * 60000)),
      callbackDueAt: dashboardTimestamp.fromDate(new Date(now.getTime() + callbackMinutes * 60000)),
      notes: 'Manually added from dashboard',
      aiTranscript: '',
      callHistory: [],
      assignedResources: [],
    });

    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">New Case</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Priority */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Priority</label>
            <div className="grid grid-cols-3 gap-2">
              {(['RED', 'YELLOW', 'GREEN'] as const).map((p) => {
                const config = priorityConfig[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm({ ...form, priority: p })}
                    className={`py-3 rounded-xl font-bold text-sm transition-all border-2 ${
                      form.priority === p
                        ? `${config.badge} text-white ${config.border}`
                        : `${config.bg} ${config.text} ${config.border}`
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Situation & Language */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Situation</label>
              <select
                value={form.situationType}
                onChange={(e) => setForm({ ...form, situationType: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="fire">Fire</option>
                <option value="flood">Flood</option>
                <option value="earthquake">Earthquake</option>
                <option value="medical">Medical</option>
                <option value="accident">Accident</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Language</label>
              <input
                type="text"
                value={form.primaryLanguage}
                onChange={(e) => setForm({ ...form, primaryLanguage: e.target.value })}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Thai, English..."
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Phone Number</label>
            <input
              type="tel"
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0812345678"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Location</label>
            <textarea
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="Address or landmarks"
            />
          </div>

          {/* Victim Count */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Victim Count</label>
            <input
              type="number"
              min={1}
              value={form.victimCount}
              onChange={(e) => setForm({ ...form, victimCount: parseInt(e.target.value) || 1 })}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Injuries */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Injuries</label>
            <textarea
              value={form.injuryDetails}
              onChange={(e) => setForm({ ...form, injuryDetails: e.target.value })}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
            />
          </div>

          {/* Help Needed */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Help Needed</label>
            <textarea
              value={form.helpNeeded}
              onChange={(e) => setForm({ ...form, helpNeeded: e.target.value })}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
            />
          </div>

          {/* Priority Reason */}
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Priority Reason</label>
            <input
              type="text"
              value={form.priorityReason}
              onChange={(e) => setForm({ ...form, priorityReason: e.target.value })}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Why this priority?"
            />
          </div>

          {/* Actions */}
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
              disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating...' : 'Create Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
