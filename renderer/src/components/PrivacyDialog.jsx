import React, { useState, useEffect } from 'react';
import { Shield, Lock, EyeOff, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PrivacyDialog = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem('privacy_accepted');
    if (!accepted) {
      setIsOpen(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('privacy_accepted', 'true');
    setIsOpen(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-bg-card-dark border border-border-dark p-8 rounded-3xl max-w-lg w-full shadow-2xl"
          >
            <div className="w-16 h-16 bg-primary/20 text-primary rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <Shield size={32} />
            </div>
            
            <h2 className="text-2xl font-bold text-white text-center mb-2">Privacy First Local AI</h2>
            <p className="text-text-dim text-center mb-8">
              Welcome! Before we start organizing your screenshots, we want you to know how we handle your data.
            </p>

            <div className="space-y-4 mb-10">
              <div className="flex gap-4 items-start">
                <div className="mt-1 text-emerald-500"><Lock size={18} /></div>
                <div>
                  <h4 className="text-sm font-bold text-white">100% Offline Processing</h4>
                  <p className="text-xs text-text-dim">All AI analysis (OCR, classification, clustering) happens directly on your machine. No data ever leaves your computer.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="mt-1 text-emerald-500"><EyeOff size={18} /></div>
                <div>
                  <h4 className="text-sm font-bold text-white">No Cloud Storage</h4>
                  <p className="text-xs text-text-dim">We don't use Firebase, AWS, or any external servers. Your screenshots stay in your local folders.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="mt-1 text-emerald-500"><CheckCircle2 size={18} /></div>
                <div>
                  <h4 className="text-sm font-bold text-white">Privacy by Design</h4>
                  <p className="text-xs text-text-dim">Your original screenshots are never modified or moved. We only create categorized copies for organization.</p>
                </div>
              </div>
            </div>

            <button 
              onClick={handleAccept}
              className="w-full py-4 bg-primary hover:bg-primary-dark text-white font-bold rounded-2xl transition-all shadow-lg shadow-primary/20 active:scale-[0.98]"
            >
              I Understand & Accept
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default PrivacyDialog;
