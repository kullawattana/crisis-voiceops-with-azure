import { useState } from 'react';
import { AlertTriangle, Users, Activity, Package, Radio } from 'lucide-react';
import Victims from './Victims';
import Resources from './Resources';
import PulseCheck from './PulseCheck';

type Tab = 'victims' | 'pulse' | 'resources';

function App() {
  const [tab, setTab] = useState<Tab>('victims');

  const navItems = [
    { id: 'victims' as Tab, label: 'Cases', icon: Users },
    { id: 'pulse' as Tab, label: 'Pulse Check', icon: Activity },
    { id: 'resources' as Tab, label: 'Resources', icon: Package },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Logo/Brand */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <div>
  <h1 className="text-lg font-semibold text-slate-900 tracking-tight">
                    Crisis Command
                  </h1>
                  <p className="text-xs text-slate-500 font-mono">
                    EMERGENCY RESPONSE SYSTEM
                  </p>
                </div>
              </div>
            </div>

            {/* Status Indicator */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span className="text-xs font-medium text-emerald-400">SYSTEM ONLINE</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="flex gap-1">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all relative ${
                  tab === id
                    ? 'text-slate-900'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {tab === id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-cyan-500" />
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-[1600px] mx-auto px-6 py-6">
        {tab === 'victims' && <Victims />}
        {tab === 'pulse' && <PulseCheck />}
        {tab === 'resources' && <Resources />}
      </main>
    </div>
  );
}

export default App;
