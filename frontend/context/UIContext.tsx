'use client';
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

type ModalType = 'ALERT' | 'CONFIRM' | 'SUCCESS' | 'ERROR';

interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: React.ReactNode; // Allow HTML/Components in message
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface UIContextType {
  showAlert: (title: string, message: string | React.ReactNode) => Promise<void>;
  showError: (title: string, message: string) => Promise<void>;
  showSuccess: (title: string, message: string) => Promise<void>;
  showConfirm: (title: string, message: string) => Promise<boolean>;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: 'ALERT',
    title: '',
    message: '',
  });

  // We use a ref to store the "resolve" function of the Promise
  const resolver = useRef<(value: boolean) => void>(() => {});

  const close = () => {
    setModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleConfirm = () => {
    close();
    resolver.current(true);
  };

  const handleCancel = () => {
    close();
    resolver.current(false);
  };

  const openModal = useCallback((type: ModalType, title: string, message: React.ReactNode) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = (result: boolean) => resolve(result); // Store the resolver
      setModal({
        isOpen: true,
        type,
        title,
        message,
        onConfirm: handleConfirm,
        onCancel: handleCancel,
      });
    });
  }, []);

  const showAlert = async (title: string, message: string | React.ReactNode) => { await openModal('ALERT', title, message); };
  const showError = async (title: string, message: string) => { await openModal('ERROR', title, message); };
  const showSuccess = async (title: string, message: string) => { await openModal('SUCCESS', title, message); };
  const showConfirm = async (title: string, message: string) => { return await openModal('CONFIRM', title, message); };

  // --- THE VISUAL COMPONENT ---
  return (
    <UIContext.Provider value={{ showAlert, showError, showSuccess, showConfirm }}>
      {children}
      
      {/* GLOBAL MODAL OVERLAY */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
             style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
               style={{ boxShadow: '0 0 50px rgba(0,0,0,0.8)' }}>
            
            {/* Header Line (Color coded) */}
            <div className={`h-1 w-full ${
              modal.type === 'ERROR' ? 'bg-red-500' : 
              modal.type === 'SUCCESS' ? 'bg-green-500' : 
              modal.type === 'CONFIRM' ? 'bg-yellow-500' : 'bg-blue-500'
            }`} />

            <div className="p-6 text-center">
              {/* Icon */}
              <div className="text-5xl mb-4">
                {modal.type === 'ERROR' && '❌'}
                {modal.type === 'SUCCESS' && '✅'}
                {modal.type === 'CONFIRM' && '⚠️'}
                {modal.type === 'ALERT' && 'ℹ️'}
              </div>

              {/* Title */}
              <h3 className="text-2xl font-black text-white uppercase tracking-wide mb-2" 
                  style={{ fontFamily: 'Orbitron, monospace' }}>
                {modal.title}
              </h3>

              {/* Message */}
              <div className="text-slate-300 text-sm leading-relaxed mb-6 whitespace-pre-line">
                {modal.message}
              </div>

              {/* Buttons */}
              <div className="flex gap-3 justify-center">
                {modal.type === 'CONFIRM' && (
                  <button 
                    onClick={handleCancel}
                    className="px-6 py-3 rounded-xl font-bold uppercase text-slate-400 bg-slate-800 hover:bg-slate-700 transition-all"
                  >
                    Cancel
                  </button>
                )}
                
                <button 
                  onClick={handleConfirm}
                  className={`px-8 py-3 rounded-xl font-bold uppercase text-white shadow-lg transition-all transform hover:scale-105 ${
                    modal.type === 'ERROR' ? 'bg-red-600 hover:bg-red-500' :
                    modal.type === 'SUCCESS' ? 'bg-green-600 hover:bg-green-500' :
                    modal.type === 'CONFIRM' ? 'bg-yellow-600 hover:bg-yellow-500' :
                    'bg-blue-600 hover:bg-blue-500'
                  }`}
                >
                  {modal.type === 'CONFIRM' ? 'Confirm' : 'Okay'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-fade-in { animation: fadeIn 0.2s ease-out; }
        .animate-scale-in { animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </UIContext.Provider>
  );
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) throw new Error("useUI must be used within a UIProvider");
  return context;
};