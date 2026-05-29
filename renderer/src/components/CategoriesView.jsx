import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Share2, 
  MessageSquare, 
  ShoppingBag, 
  Film, 
  Bot, 
  Files, 
  Copy,
  LayoutGrid,
  ChevronRight,
  FolderOpen
} from 'lucide-react';
import { motion } from 'framer-motion';

const CategoryCard = ({ icon: Icon, label, count, color, dbKey }) => (
  <motion.button 
    whileHover={{ y: -5, scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={() => window.electronAPI.openFolder(`D:\\vit\\Screenshot organizer_new\\OrganizedScreenshots\\${dbKey}`)}
    className="bg-bg-card-dark border border-border-dark p-6 rounded-3xl flex flex-col items-center text-center gap-4 group transition-all relative overflow-hidden"
  >
    <div className={`p-4 rounded-2xl ${color} shadow-lg transition-transform group-hover:scale-110 z-10`}>
      <Icon size={32} className="text-white" />
    </div>
    <div className="z-10">
      <h3 className="text-lg font-bold text-white tracking-tight">{label}</h3>
      <p className="text-xs text-text-dim mt-1 font-bold uppercase tracking-widest">{count} Items</p>
    </div>
    <div className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
       <FolderOpen size={16} className="text-primary" />
    </div>
  </motion.button>
);

const CategoriesView = () => {
  const [counts, setCounts] = useState({});

  useEffect(() => {
    const fetchCounts = async () => {
       const stats = await window.electronAPI.getStats();
       // This will be dynamic after we update the IPC to return category breakdown
       // For now, we'll map the total counts
       setCounts(stats.breakdown || {});
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 5000);
    return () => clearInterval(interval);
  }, []);

  const categories = [
    { icon: BookOpen, label: 'Study', count: counts['Study'] || 0, color: 'bg-blue-600', dbKey: 'Study' },
    { icon: Share2, label: 'Social Media', count: counts['Social Media'] || 0, color: 'bg-primary', dbKey: 'Social Media' },
    { icon: MessageSquare, label: 'Communication', count: counts['Communication'] || 0, color: 'bg-emerald-600', dbKey: 'Communication' },
    { icon: ShoppingBag, label: 'Shopping', count: counts['Shopping'] || 0, color: 'bg-orange-600', dbKey: 'Shopping' },
    { icon: Bot, label: 'AI Chats', count: counts['AI Chats'] || 0, color: 'bg-indigo-600', dbKey: 'AI Chats' },
    { icon: Files, label: 'Documents', count: counts['Documents'] || 0, color: 'bg-cyan-600', dbKey: 'Documents' },
    { icon: Copy, label: 'Duplicates', count: counts['Duplicates'] || 0, color: 'bg-slate-600', dbKey: 'Duplicates' },
    { icon: Files, label: 'Uncategorized', count: counts['Uncategorized'] || 0, color: 'bg-gray-600', dbKey: 'Uncategorized' },
  ];

  return (
    <div className="p-8 h-full overflow-y-auto">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Categories</h2>
          <p className="text-text-dim text-sm font-medium">Browse your screenshots by AI analysis clusters</p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pb-10">
        {categories.map((cat, i) => (
          <CategoryCard key={i} {...cat} />
        ))}
      </div>
    </div>
  );
};

export default CategoriesView;
