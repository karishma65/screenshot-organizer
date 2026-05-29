import React from 'react';
import { 
  LayoutDashboard, 
  FolderTree, 
  Search, 
  Copy, 
  Activity, 
  Settings,
  CircleDot
} from 'lucide-react';

const SidebarItem = ({ icon: Icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
      active 
        ? 'bg-primary/10 text-primary border-l-4 border-primary' 
        : 'text-text-dim hover:bg-white/5 hover:text-white'
    }`}
  >
    <Icon size={20} />
    <span className="font-medium text-sm">{label}</span>
  </button>
);

const Sidebar = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'categories', icon: FolderTree, label: 'Categories' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'duplicates', icon: Copy, label: 'Duplicates' },
    { id: 'activity', icon: Activity, label: 'Activity' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="w-64 h-screen bg-bg-card-dark border-r border-border-dark flex flex-col p-4">
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
          <CircleDot className="text-white" size={24} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white leading-none">Screenshot</h1>
          <p className="text-xs text-text-dim mt-1">Organizer</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => (
          <SidebarItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeTab === item.id}
            onClick={() => setActiveTab(item.id)}
          />
        ))}
      </nav>

      <div className="mt-auto pt-6 border-t border-border-dark">
        <div className="flex items-center gap-2 px-2 text-xs text-text-dim mb-4">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Monitoring Active
        </div>
        <div className="bg-white/5 rounded-lg p-3">
          <p className="text-[10px] text-text-dim uppercase tracking-wider mb-2 font-semibold">Screenshot Folder</p>
          <p className="text-xs text-white truncate max-w-full">C:\Users\A.KARISHMA\Pictures\Screenshots</p>
          <button 
            onClick={() => window.electronAPI.openFolder('C:\\Users\\A.KARISHMA\\Pictures\\Screenshots')}
            className="w-full mt-3 py-2 bg-white/5 hover:bg-white/10 text-white text-xs rounded transition-colors"
          >
            Open Folder
          </button>
        </div>
        <div className="mt-4 text-[10px] text-center text-text-dim">
          v1.0.0
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
