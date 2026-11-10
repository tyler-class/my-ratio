import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  text: string;
  tone?: 'bad';
  action?: { label: string; run: () => void };
}

const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((t: Omit<Toast, 'id'>) => {
    clearTimeout(timer.current);
    const next = { ...t, id: Date.now() };
    setToast(next);
    timer.current = setTimeout(
      () => setToast((cur) => (cur?.id === next.id ? null : cur)),
      t.action ? 8000 : 4000,
    );
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toast && (
          <div className={'toast' + (toast.tone ? ' ' + toast.tone : '')}>
            <span>{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action!.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
