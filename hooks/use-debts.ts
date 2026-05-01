import { useState, useEffect } from 'react';

export type DebtStatus = 'pending' | 'paid';
export type DebtType = 'owe_me' | 'i_owe';

export interface Debt {
  id: string;
  personName: string;
  type: DebtType;
  amount: number;
  dueDate: string;
  status: DebtStatus;
  description: string;
  createdAt: string;
}

export function useDebts() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('app_debts');
    if (stored) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDebts(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse stored debts", e);
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('app_debts', JSON.stringify(debts));
    }
  }, [debts, isLoaded]);

  const addDebt = (debt: Omit<Debt, 'id' | 'createdAt'>) => {
    const newDebt: Debt = {
      ...debt,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    setDebts(prev => [...prev, newDebt]);
  };

  const updateDebt = (id: string, updates: Partial<Debt>) => {
    setDebts(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const deleteDebt = (id: string) => {
    setDebts(prev => prev.filter(d => d.id !== id));
  };

  const markAsPaid = (id: string) => {
    updateDebt(id, { status: 'paid' });
  };

  const markAsPending = (id: string) => {
    updateDebt(id, { status: 'pending' });
  };

  return { debts, addDebt, updateDebt, deleteDebt, markAsPaid, markAsPending, isLoaded };
}
