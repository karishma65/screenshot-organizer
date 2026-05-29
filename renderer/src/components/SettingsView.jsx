import React from 'react';
import { 
  Settings, 
  Folder, 
  Bell, 
  ShieldCheck, 
  Database, 
  Monitor, 
  HardDrive,
  ExternalLink
} from 'lucide-react';
import { motion } from 'framer-motion';

const SettingToggle = ({ label, description, checked }) => (
  <div className="flex items-center justify-between p-4 hover:bg-white/5 transition-all rounded-2xl group">
    <div>
      <h4 className="text-sm font-bold text-white tracking-tight">{label}</h4>
      <p className="text-[11px] text-text-dim mt-0.5 group-hover:text-gray-400 transition-colors uppercase tracking-wider font-bold text-[9px]">{description}</p>
    </div>
    <div className={`w-12 h-6 rounded-full relative p-1 transition-all cursor-pointer ${checked ? 'bg-primary' : 'bg-white/10'}`}>
       <div className={`w-4 h-4 bg-white rounded-full transition-all ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
    </div>
  </div>
);

const SettingsView = () => {
  return (
    <div className="p-8 h-full overflow-y-auto">
      <header className="mb-10 shrink-0">
        <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">System Settings</h2>
        <p className="text-text-dim text-sm font-medium">Fine-tune your local organization engine</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Monitoring Section */}
        <section className="bg-bg-card-dark border border-border-dark rounded-3xl overflow-hidden p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border-dark">
            <Monitor className="text-primary" size={24} />
            <h3 className="text-lg font-bold text-white tracking-tight">Active Monitoring</h3>
          </div>
          <div className="space-y-4">
            <SettingToggle label="Real-time Watching" description="Monitor folder for new screenshots instantly" checked={true} />
            <SettingToggle label="Startup Boot" description="Launch organizer when system starts" checked={true} />
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
               <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mb-3">Target Screenshots Directory</p>
               <div className="flex gap-3">
                 <div className="flex-1 bg-black/30 p-3 rounded-xl border border-white/5 text-xs text-white truncate">
                   C:\Users\A.KARISHMA\Pictures\Screenshots
                 </div>
                 <button className="px-4 py-2 bg-primary/20 text-primary border border-primary/30 rounded-xl font-bold text-xs hover:bg-primary hover:text-white transition-all">Change</button>
               </div>
            </div>
          </div>
        </section>

        {/* File Handling */}
        <section className="bg-bg-card-dark border border-border-dark rounded-3xl overflow-hidden p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border-dark">
            <HardDrive className="text-primary" size={24} />
            <h3 className="text-lg font-bold text-white tracking-tight">File Management</h3>
          </div>
          <div className="space-y-4">
            <SettingToggle label="Create Categorized Copies" description="Preserve original file and create a new copy" checked={true} />
            <SettingToggle label="Smart Reclustering" description="Automatically group related study material" checked={true} />
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
               <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mb-3">Organization Root</p>
               <div className="flex gap-3">
                 <div className="flex-1 bg-black/30 p-3 rounded-xl border border-white/5 text-xs text-white truncate">
                   D:\vit\Screenshot organizer_new\OrganizedScreenshots
                 </div>
                 <button onClick={() => window.electronAPI.openFolder('D:\\vit\\Screenshot organizer_new\\OrganizedScreenshots')} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl font-bold text-xs text-white transition-all flex items-center gap-2">
                   View <ExternalLink size={12}/>
                 </button>
               </div>
            </div>
          </div>
        </section>

        <section className="bg-bg-card-dark border border-border-dark rounded-3xl overflow-hidden p-6 shadow-2xl lg:col-span-2">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-border-dark">
            <div className="flex items-center gap-3">
              <Database className="text-rose-500" size={24} />
              <h3 className="text-lg font-bold text-white tracking-tight">Danger Zone</h3>
            </div>
          </div>
          <div className="flex items-center justify-between bg-rose-500/5 p-6 rounded-2xl border border-rose-500/20">
            <div>
              <h4 className="text-white font-bold mb-1">Rebuild Library</h4>
              <p className="text-xs text-text-dim max-w-md">This will clear the index and re-organize all screenshots using the latest AI logic. Your original screenshots will not be deleted.</p>
            </div>
            <button 
              onClick={async () => {
                if(confirm("Are you sure you want to rebuild the entire library? This will restart the initial scan.")) {
                   await window.electronAPI.rebuildLibrary();
                   alert("Library reset. Please restart the application to begin the re-scan.");
                }
              }}
              className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-rose-600/20 text-sm"
            >
              Start Rebuild
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsView;
