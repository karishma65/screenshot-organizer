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
  FolderOpen,
  Inbox,
  Loader2,
  AlertCircle,
  User,
  CreditCard,
  FileText
} from 'lucide-react';
import { motion } from 'framer-motion';
import CategoryDetailView from './CategoryDetailView';

const CategoryCard = ({ icon: Icon, label, count, color, dbKey, onClick }) => (
  <motion.button 
    whileHover={{ y: -5, scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
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
       <ChevronRight size={16} className="text-primary" />
    </div>
  </motion.button>
);

const CategoriesView = () => {
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        console.log('Renderer: Fetching category stats...');
        setError(null);
        setLoading(true);
        const stats = await window.electronAPI.getStats();
        
        if (!stats) {
          console.error('get-stats failed: Backend returned null');
          setError('Backend failed to return data.');
          return;
        }

        if (stats.breakdown) {
          setCounts(stats.breakdown);
        } else {
          console.warn('get-stats: breakdown missing in response');
          setCounts({});
        }
      } catch (e) {
        console.error('get-stats failed', e);
        setError(`System Error: ${e.message}`);
      } finally {
        setLoading(false);
      }
    };
    fetchCounts();

    let unsub = null;
    try {
      unsub = window.electronAPI.on('stats-updated', (data) => {
        if (data && data.breakdown) {
          setCounts(data.breakdown);
        }
      });
    } catch (e) {
      console.error('Failed to subscribe to stats-updated', e);
    }

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Category detail view
  if (selectedCategory) {
    return (
      <CategoryDetailView
        category={selectedCategory.dbKey}
        categoryLabel={selectedCategory.label}
        onBack={() => setSelectedCategory(null)}
      />
    );
  }

  const categories = [
    { icon: BookOpen, label: 'Study', count: counts['STUDY'] || 0, color: 'bg-blue-600', dbKey: 'STUDY' },
    { icon: LayoutGrid, label: 'Digital', count: counts['DIGITAL'] || 0, color: 'bg-primary', dbKey: 'DIGITAL' },
    { icon: ShoppingBag, label: 'Shopping', count: counts['SHOPPING'] || 0, color: 'bg-orange-600', dbKey: 'SHOPPING' },
    { icon: CreditCard, label: 'Finance', count: counts['FINANCE'] || 0, color: 'bg-emerald-600', dbKey: 'FINANCE' },
    { icon: User, label: 'Personal', count: counts['PERSONAL'] || 0, color: 'bg-rose-600', dbKey: 'PERSONAL' },
    { icon: FileText, label: 'Documents', count: counts['DOCUMENTS'] || 0, color: 'bg-cyan-600', dbKey: 'DOCUMENTS' },
    { icon: Copy, label: 'Duplicates', count: counts['DUPLICATES'] || 0, color: 'bg-indigo-600', dbKey: 'DUPLICATES' },
    { icon: Files, label: 'Uncategorized', count: counts['UNCATEGORIZED'] || 0, color: 'bg-gray-600', dbKey: 'UNCATEGORIZED' },
  ];

  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <Loader2 size={48} className="text-primary animate-spin" />
        <p className="text-text-dim font-bold uppercase tracking-widest text-xs animate-pulse">Loading categories...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="w-16 h-16 bg-rose-500/20 text-rose-500 rounded-2xl flex items-center justify-center mb-2">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-white font-bold text-lg">Error</h3>
        <p className="text-text-dim text-sm max-w-xs">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-8 h-full overflow-y-auto">
      <header className="mb-10 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Categories</h2>
          <p className="text-text-dim text-sm font-medium">Browse your screenshots by AI analysis clusters</p>
        </div>
      </header>

      {totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox size={56} className="text-text-dim opacity-20 mb-4" />
          <h3 className="text-white font-bold text-xl mb-2">No screenshots yet</h3>
          <p className="text-text-dim text-sm max-w-sm">
            Your categories will populate automatically as screenshots are processed by the AI engine.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pb-10">
          {categories.map((cat, i) => (
            <CategoryCard 
              key={i} 
              {...cat} 
              onClick={() => setSelectedCategory(cat)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CategoriesView;
