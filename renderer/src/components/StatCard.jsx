import React from 'react';
import { motion } from 'framer-motion';

const StatCard = ({ title, value, subtext, color, icon: Icon }) => {
  const colorMap = {
    primary: 'bg-primary/20 text-primary border-primary/30',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    green: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    rose: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={`p-6 rounded-2xl border ${colorMap[color] || colorMap.primary} bg-bg-card-dark`}
    >
      <div className="flex justify-between items-start mb-4">
        <p className="text-sm font-medium opacity-80">{title}</p>
        <div className={`p-2 rounded-lg ${colorMap[color].split(' ')[0]}`}>
          {Icon && <Icon size={18} />}
        </div>
      </div>
      <div className="flex flex-col">
        <h3 className="text-3xl font-bold text-white mb-1">{value}</h3>
        <p className="text-xs opacity-60 font-medium">{subtext}</p>
      </div>
    </motion.div>
  );
};

export default StatCard;
