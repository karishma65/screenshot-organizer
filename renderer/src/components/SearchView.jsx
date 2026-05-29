import React, { useState } from 'react';
import { Search, Filter, Image as ImageIcon, Calendar, Tag, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';

const SearchResultCard = ({ filename, category, platform, date }) => (
  <motion.div 
    whileHover={{ y: -4 }}
    className="bg-bg-card-dark border border-border-dark rounded-2xl overflow-hidden group cursor-pointer"
  >
    <div className="aspect-video bg-white/5 flex items-center justify-center relative group-hover:bg-white/10 transition-colors">
      <ImageIcon size={40} className="text-text-dim opacity-20" />
      <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-md text-[10px] text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider">
        Preview
      </div>
    </div>
    <div className="p-4">
      <h4 className="text-sm font-bold text-white truncate mb-1">{filename}</h4>
      <div className="flex gap-2 mb-3">
        <span className="text-[9px] px-2 py-0.5 bg-primary/10 text-primary rounded-full font-bold uppercase">{category}</span>
        <span className="text-[9px] px-2 py-0.5 bg-white/5 text-text-dim rounded-full font-bold uppercase">{platform}</span>
      </div>
      <div className="flex justify-between items-center text-[10px] text-text-dim font-medium">
        <span className="flex items-center gap-1"><Calendar size={10} /> {date}</span>
      </div>
    </div>
  </motion.div>
);

const SearchView = () => {
  const [activeFilter, setActiveFilter] = useState('All');

  const results = [
    { filename: 'Invoice_2024_05.png', category: 'Shopping', platform: 'Amazon', date: 'May 20, 2024' },
    { filename: 'Lesson_Note_SQL.png', category: 'Study', platform: 'YouTube', date: 'May 18, 2024' },
    { filename: 'Chat_Log_Project.png', category: 'Communication', platform: 'WhatsApp', date: 'May 15, 2024' },
    { filename: 'Design_Inspiration.png', category: 'Social Media', platform: 'Instagram', date: 'May 12, 2024' },
    { filename: 'Code_Snippet_React.png', category: 'Personal', platform: 'VS Code', date: 'May 10, 2024' },
    { filename: 'Flight_Ticket.png', category: 'Documents', platform: 'Email', date: 'May 05, 2024' },
  ];

  return (
    <div className="p-8 h-full flex flex-col overflow-hidden">
      <header className="mb-8 flex flex-col gap-6 shrink-0">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Search Gallery</h2>
          <p className="text-text-dim text-sm font-medium">Find anything in your screenshot library instantly</p>
        </div>

        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim" size={20} />
            <input 
              type="text" 
              placeholder="Search by text, category, or platform..." 
              className="w-full pl-12 pr-4 py-4 bg-bg-card-dark border border-border-dark rounded-2xl text-white focus:outline-none focus:border-primary transition-all shadow-xl shadow-black/20"
            />
          </div>
          <button className="px-6 bg-primary text-white font-bold rounded-2xl hover:bg-primary-dark transition-all flex items-center gap-2">
            <Filter size={18} /> Filters
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {['All', 'Study', 'Social Media', 'Communication', 'Shopping', 'AI Chats', 'Documents'].map(filter => (
            <button 
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                activeFilter === filter 
                  ? 'bg-primary/20 text-primary border-primary/50' 
                  : 'bg-bg-card-dark text-text-dim border-border-dark hover:text-white'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-8">
          {results.map((res, i) => (
            <SearchResultCard key={i} {...res} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchView;
