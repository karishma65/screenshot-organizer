import React from 'react';
import { Copy, Trash2, CheckCircle2, AlertCircle, Maximize2, Trash, Check } from 'lucide-react';
import { motion } from 'framer-motion';

const DuplicateGroup = ({ original, duplicate, similarity }) => (
  <div className="bg-bg-card-dark border border-border-dark rounded-3xl overflow-hidden p-6 mb-6">
    <div className="flex justify-between items-center mb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-rose-500/20 text-rose-500 rounded-xl flex items-center justify-center">
          <Copy size={20} />
        </div>
        <div>
          <h4 className="text-white font-bold tracking-tight">Duplicate Found</h4>
          <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest">{similarity}% Visual Match</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-xl transition-all border border-white/10">Keep Both</button>
        <button className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-rose-600/20">Remove Duplicate</button>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-3">
        <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest flex items-center gap-2">
          <CheckCircle2 size={12} className="text-emerald-500" /> Original Screenshot
        </p>
        <div className="aspect-video bg-black/40 rounded-2xl flex items-center justify-center border border-white/5 group relative overflow-hidden">
          <span className="text-xs text-text-dim opacity-50 font-medium">{original}</span>
          <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
             <button className="p-3 bg-white rounded-full text-primary shadow-xl"><Maximize2 size={24}/></button>
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest flex items-center gap-2">
          <AlertCircle size={12} className="text-rose-500" /> Detected Duplicate
        </p>
        <div className="aspect-video bg-black/40 rounded-2xl flex items-center justify-center border border-rose-500/30 group relative overflow-hidden">
          <span className="text-xs text-text-dim opacity-50 font-medium">{duplicate}</span>
          <div className="absolute inset-0 bg-rose-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
             <button className="p-3 bg-white rounded-full text-rose-500 shadow-xl"><Trash2 size={24}/></button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const DuplicatesView = () => {
  return (
    <div className="p-8 h-full flex flex-col overflow-hidden">
      <header className="mb-8 flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Duplicates Manager</h2>
          <p className="text-text-dim text-sm font-medium">Clean up your storage by removing visually identical screenshots</p>
        </div>
        <div className="flex bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl gap-6">
          <div className="text-center border-r border-rose-500/20 pr-6">
            <p className="text-2xl font-black text-rose-500">226</p>
            <p className="text-[9px] text-rose-400 font-bold uppercase tracking-wider">Duplicates</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-white">842MB</p>
            <p className="text-[9px] text-text-dim font-bold uppercase tracking-wider">Safe to Clean</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <DuplicateGroup original="Screenshot_2024-05-20.png" duplicate="IMG_9821_Copy.png" similarity="98.5" />
        <DuplicateGroup original="Web_Ref_UI.png" duplicate="UI_Reference_Final.png" similarity="99.2" />
        <DuplicateGroup original="Chat_History.png" duplicate="IMG_99212.png" similarity="95.0" />
      </div>
    </div>
  );
};

export default DuplicatesView;
