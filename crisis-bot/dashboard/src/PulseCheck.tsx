import { useEffect, useState } from 'react';
import {
  dashboardTimestamp,
  listCases,
  updateCase,
  type DashboardTimestamp,
  type Victim,
} from './api';
import {
  Activity, Phone, MapPin, Clock, AlertCircle, CheckCircle2,
  Timer, ChevronRight, Heart, Hash
} from 'lucide-react';

const priorityConfig = {
  RED: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-600',
    badge: 'bg-red-500',
  },
  YELLOW: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-600',
    badge: 'bg-amber-500',
  },
  GREEN: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-600',
    badge: 'bg-emerald-500',
  },
};

function formatTime(timestamp: DashboardTimestamp | undefined): string {
  if (!timestamp) return '-';
  const date = timestamp.toDate();
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function getMinutesUntil(timestamp: DashboardTimestamp | undefined): number {
  if (!timestamp) return Infinity;
  const now = new Date();
  const target = timestamp.toDate();
  return Math.floor((target.getTime() - now.getTime()) / 60000);
}

function formatTimeRemaining(minutes: number): string {
  if (minutes < 0) return 'OVERDUE';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export default function PulseCheck() {
  const [victims, setVictims] = useState<Victim[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Victim | null>(null);
  const [updating, setUpdating] = useState(false);
  const [notes, setNotes] = useState('');

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
    if (selected) {
      const updated = victims.find(v => v.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [victims]);

  const now = new Date();

  const upcomingPulse = victims
    .filter(v => {
      if (v.status === 'closed' || v.status === 'resolved') return false;
      if (!v.nextPulseAt) return false;
      return true;
    })
    .sort((a, b) => {
      const aTime = a.nextPulseAt?.toDate().getTime() || 0;
      const bTime = b.nextPulseAt?.toDate().getTime() || 0;
      return aTime - bTime;
    });

  const overdueCount = upcomingPulse.filter(v => getMinutesUntil(v.nextPulseAt) < 0).length;
  const urgentCount = upcomingPulse.filter(v => {
    const m = getMinutesUntil(v.nextPulseAt);
    return m >= 0 && m <= 15;
  }).length;

  const confirmPulseCheck = async (newPriority?: string) => {
    if (!selected) return;
    setUpdating(true);

    const nextPulse = new Date(now.getTime() + 60 * 60000);

    const updates: Record<string, unknown> = {
      lastContactAt: new Date().toISOString(),
      nextPulseAt: dashboardTimestamp.fromDate(nextPulse),
    };

    if (newPriority) {
      updates.priority = newPriority;
    }

    const updated = await updateCase(selected.id, updates);
    setVictims((items) => items.map((item) => item.id === selected.id ? updated : item));
    setUpdating(false);
    setSelected(null);
    setNotes('');
  };

  const markResolved = async () => {
    if (!selected) return;
    setUpdating(true);
    const updated = await updateCase(selected.id, {
      status: 'resolved',
    });
    setVictims((items) => items.map((item) => item.id === selected.id ? updated : item));
    setUpdating(false);
    setSelected(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          <span>Loading pulse checks...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-160px)]">
      {/* Left Panel - List */}
      <div className="w-[420px] flex flex-col flex-shrink-0">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-4 rounded-xl bg-purple-50 border-2 border-purple-200">
            <div className="text-3xl font-bold font-mono text-purple-600">{upcomingPulse.length}</div>
            <div className="text-xs font-medium text-purple-600 opacity-70">PENDING</div>
          </div>
          <div className="p-4 rounded-xl bg-red-50 border-2 border-red-200 relative">
            <div className="text-3xl font-bold font-mono text-red-600">{overdueCount}</div>
            <div className="text-xs font-medium text-red-600 opacity-70">OVERDUE</div>
            {overdueCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </div>
          <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-200">
            <div className="text-3xl font-bold font-mono text-amber-600">{urgentCount}</div>
            <div className="text-xs font-medium text-amber-600 opacity-70">URGENT</div>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {upcomingPulse.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No pending pulse checks</p>
            </div>
          ) : (
            upcomingPulse.map((victim) => {
              const minutesUntil = getMinutesUntil(victim.nextPulseAt);
              const isOverdue = minutesUntil < 0;
              const isUrgent = minutesUntil >= 0 && minutesUntil <= 15;
              const config = priorityConfig[victim.priority];
              const isSelected = selected?.id === victim.id;

              return (
                <button
                  key={victim.id}
                  onClick={() => setSelected(victim)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    isOverdue ? 'bg-red-50 border-red-200' :
                    isUrgent ? 'bg-amber-50 border-amber-200' :
                    'bg-purple-50 border-purple-200'
                  } ${isSelected ? 'ring-2 ring-purple-500' : ''} hover:shadow-md`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-sm text-gray-900">
                          {victim.ticketNumber || '-'}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold text-white ${config.badge}`}>
                          {victim.priority}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 truncate">
                        {victim.situationType} - {victim.location?.text || 'No location'}
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className={`font-mono font-bold text-lg ${
                        isOverdue ? 'text-red-600 animate-pulse' : isUrgent ? 'text-amber-600' : 'text-purple-600'
                      }`}>
                        {formatTimeRemaining(minutesUntil)}
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 mt-1" />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    Last contact: {formatTime(victim.lastContactAt)}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Panel - Pulse Check Form */}
      <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {selected ? (
          <div className="h-full overflow-y-auto">
            {/* Header */}
            <div className={`p-6 border-b border-gray-200 ${priorityConfig[selected.priority].bg}`}>
              <div className="flex items-center gap-3 mb-2">
                <span className="font-mono font-bold text-xl text-gray-900">{selected.ticketNumber}</span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold text-white ${priorityConfig[selected.priority].badge}`}>
                  {selected.priority}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 capitalize">{selected.situationType}</h2>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Info Grid */}
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
                    <Timer className="w-3.5 h-3.5" />
                    DUE IN
                  </div>
                  {(() => {
                    const m = getMinutesUntil(selected.nextPulseAt);
                    return (
                      <p className={`font-mono text-2xl font-bold ${
                        m < 0 ? 'text-red-600' : m <= 15 ? 'text-amber-600' : 'text-purple-600'
                      }`}>
                        {formatTimeRemaining(m)}
                      </p>
                    );
                  })()}
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                  <MapPin className="w-3.5 h-3.5" />
                  LOCATION
                </div>
                <p className="text-gray-900">{selected.location?.text || '-'}</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                  <Heart className="w-3.5 h-3.5" />
                  CONDITION
                </div>
                <p className="text-gray-700">{selected.condition || selected.injuryDetails || '-'}</p>
              </div>

              {/* Notes */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  PULSE CHECK NOTES
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  rows={3}
                  placeholder="Status update, any changes..."
                />
              </div>

              {/* Actions */}
              <div className="space-y-3 pt-2">
                <p className="text-sm text-gray-500 font-medium">Update priority and schedule next check (+1 hour):</p>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => confirmPulseCheck('RED')}
                    disabled={updating}
                    className="py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
                  >
                    Confirm RED
                  </button>
                  <button
                    onClick={() => confirmPulseCheck('YELLOW')}
                    disabled={updating}
                    className="py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
                  >
                    Confirm YELLOW
                  </button>
                  <button
                    onClick={() => confirmPulseCheck('GREEN')}
                    disabled={updating}
                    className="py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
                  >
                    Confirm GREEN
                  </button>
                </div>

                <button
                  onClick={() => confirmPulseCheck()}
                  disabled={updating}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  Confirm (Keep {selected.priority})
                </button>

                <button
                  onClick={markResolved}
                  disabled={updating}
                  className="flex items-center justify-center gap-2 w-full py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Mark Resolved
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Hash className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Select a case to perform pulse check</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
