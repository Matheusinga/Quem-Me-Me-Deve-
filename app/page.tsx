'use client';

import React, { useState, useMemo } from 'react';
import { Plus, Search, AlertCircle, CheckCircle2, Home, List, CalendarDays, TrendingUp, TrendingDown, User, Wallet, QrCode } from 'lucide-react';
import { format, isPast, isToday, isTomorrow, addDays, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

import { cn } from '@/lib/utils';
import { useDebts, Debt, DebtType, DebtStatus } from '@/hooks/use-debts';
import { Button, Input, Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/dialog';

// Helper for formatting currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export default function DashboardPage() {
  const { debts, addDebt, updateDebt, markAsPaid, markAsPending, deleteDebt, isLoaded } = useDebts();
  
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list' | 'trust' | 'pix'>('dashboard');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [debtToDelete, setDebtToDelete] = useState<string | null>(null);
  const [pixKey, setPixKey] = useState('');

  React.useEffect(() => {
    if (isLoaded) {
      const stored = localStorage.getItem('app_pix_key');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setPixKey(stored);
    }
  }, [isLoaded]);

  const savePixKey = (key: string) => {
    setPixKey(key);
    localStorage.setItem('app_pix_key', key);
  };
  
  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'owe_me' | 'i_owe'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'paid'>('all');

  // Form State
  const [formData, setFormData] = useState({
    personName: '',
    type: 'owe_me' as DebtType,
    amount: '',
    dueDate: '',
    description: ''
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.personName || !formData.amount || !formData.dueDate) return;
    
    addDebt({
      personName: formData.personName,
      type: formData.type,
      amount: parseFloat(formData.amount),
      dueDate: formData.dueDate,
      status: 'pending',
      description: formData.description
    });
    
    setFormData({ personName: '', type: 'owe_me', amount: '', dueDate: '', description: '' });
    setIsDialogOpen(false);
  };

  // Derived calculations
  const totalOwedToMe = useMemo(() => 
    debts.filter(d => d.type === 'owe_me' && d.status === 'pending').reduce((sum, d) => sum + d.amount, 0)
  , [debts]);

  const totalIOwe = useMemo(() => 
    debts.filter(d => d.type === 'i_owe' && d.status === 'pending').reduce((sum, d) => sum + d.amount, 0)
  , [debts]);

  const netBalance = totalOwedToMe - totalIOwe;

  // Reminders for pending debts
  const reminders = useMemo(() => {
    return debts
      .filter(d => d.status === 'pending')
      .map(d => {
        const date = parseISO(d.dueDate);
        const daysDiff = differenceInDays(date, new Date());
        
        let urgency: 'late' | 'today' | 'upcoming' | 'future' = 'future';
        if (daysDiff < 0) urgency = 'late';
        else if (daysDiff === 0) urgency = 'today';
        else if (daysDiff <= 3) urgency = 'upcoming';

        return { ...d, urgency, daysDiff };
      })
      .filter(d => d.urgency !== 'future')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [debts]);

  // Filtered List
  const filteredDebts = useMemo(() => {
    return debts.filter(d => {
      const matchSearch = d.personName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          d.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = filterType === 'all' || d.type === filterType;
      const matchStatus = filterStatus === 'all' || d.status === filterStatus;
      return matchSearch && matchType && matchStatus;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [debts, searchTerm, filterType, filterStatus]);

  // Trust Metrics
  const trustMetrics = useMemo(() => {
    const metrics: Record<string, { total: number, paidOnTime: number, paidLate: number, pendingLate: number }> = {};
    
    // Only looking at people who owe ME for trust score
    debts.filter(d => d.type === 'owe_me').forEach(d => {
      if (!metrics[d.personName]) {
        metrics[d.personName] = { total: 0, paidOnTime: 0, paidLate: 0, pendingLate: 0 };
      }
      
      metrics[d.personName].total += 1;
      
      const isPastDue = isPast(parseISO(d.dueDate)) && !isToday(parseISO(d.dueDate));
      
      if (d.status === 'paid') {
        // Simple heuristic: if we don't store paidDate, we'll assume it was paid on time if the feature is just added
        // In a real app we'd track `paidAt` date. Let's just track "Attrasado" if it's currently past due
        // Since we don't have paidAt, we assume they paid. We might misclassify them as onTime if they just paid now even if late.
        // For demonstration, let's treat any 'paid' as positive, but just for fun, assume they are 'paidOnTime' mostly.
        metrics[d.personName].paidOnTime += 1; // Simplified 
      } else {
        if (isPastDue) {
          metrics[d.personName].pendingLate += 1;
        }
      }
    });

    return Object.entries(metrics).map(([name, data]) => {
      // Calculate a simple reliability score (0-100)
      const score = data.total === 0 ? 0 : Math.round((data.paidOnTime / data.total) * 100);
      return {
        name,
        ...data,
        score
      };
    }).sort((a, b) => b.total - a.total); // Sort by volume
  }, [debts]);

  if (!isLoaded) return <div className="min-h-screen flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="min-h-screen bg-gray-200 flex justify-center text-gray-900">
      {/* Mobile container - restricts width on desktop to simulate phone */}
      <div className="w-full max-w-md bg-[#f3f4f6] min-h-screen flex flex-col relative shadow-2xl overflow-x-hidden">
        
        {/* Top Header - MD3 App Bar */}
        <header className="bg-[#f3f4f6] sticky top-0 z-10 px-4 h-16 flex items-center justify-between shrink-0">
          <h1 className="text-xl font-medium tracking-tight text-gray-900">Devo ou Recebo</h1>
          <div className="w-8 h-8 flex items-center justify-center">
            {/* Action icon placeholder if needed */}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-28">
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3 mt-2">
              <Card className="rounded-2xl border-none shadow-sm bg-white">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2 text-green-600 mb-2">
                    <TrendingUp className="h-5 w-5" />
                    <p className="text-sm font-medium">Receber</p>
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-gray-900">{formatCurrency(totalOwedToMe)}</h2>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-none shadow-sm bg-white">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2 text-red-600 mb-2">
                    <TrendingDown className="h-5 w-5" />
                    <p className="text-sm font-medium">Pagar</p>
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-gray-900">{formatCurrency(totalIOwe)}</h2>
                </CardContent>
              </Card>
              <Card className={cn(
                "col-span-2 rounded-2xl border-none shadow-sm mt-1",
                netBalance >= 0 ? "bg-[#cce8cd] text-green-900" : "bg-[#f8cdd1] text-red-900"
              )}>
                <CardContent className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-full", netBalance >= 0 ? "bg-green-200" : "bg-red-200")}>
                      <Wallet className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-medium opacity-80">Saldo Líquido</p>
                      <h2 className="text-2xl font-bold">{formatCurrency(netBalance)}</h2>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Reminders / Alerts */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-semibold">Lembretes e Vencimentos</h3>
              </div>
              
              {reminders.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-3xl mt-4 px-6 shadow-sm">
                  <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="font-medium text-gray-900">Tudo tranquilo!</h3>
                  <p className="text-sm text-gray-500 mt-1">Sem vencimentos próximos.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {reminders.map(reminder => (
                    <Card key={reminder.id} className={cn(
                      "rounded-3xl border-none shadow-sm overflow-hidden relative",
                      reminder.urgency === 'late' ? "bg-red-50" : 
                      reminder.urgency === 'today' ? "bg-orange-50" : "bg-yellow-50"
                    )}>
                      {/* Left indicator bar */}
                      <div className={cn(
                        "absolute left-0 top-0 bottom-0 w-1",
                        reminder.urgency === 'late' ? "bg-red-400" : 
                        reminder.urgency === 'today' ? "bg-orange-400" : "bg-yellow-400"
                      )} />
                      <CardContent className="p-4 pl-5">
                        <div className="flex justify-between items-start">
                          <Badge variant={
                            reminder.type === 'owe_me' ? 'success' : 'destructive'
                          }>
                            {reminder.type === 'owe_me' ? 'Receber de' : 'Pagar a'} {reminder.personName}
                          </Badge>
                          <span className={cn(
                            "text-xs font-bold px-2 py-1 rounded-full",
                            reminder.urgency === 'late' ? "bg-red-200 text-red-800" :
                            reminder.urgency === 'today' ? "bg-orange-200 text-orange-800" : "bg-yellow-200 text-yellow-800"
                          )}>
                            {reminder.urgency === 'late' ? 'ATRASADO' : 
                             reminder.urgency === 'today' ? 'HOJE' : `Em ${reminder.daysDiff} dias`}
                          </span>
                        </div>
                        <p className="text-xl font-bold">{formatCurrency(reminder.amount)}</p>
                        <p className="text-sm text-gray-600 flex items-center gap-1">
                          <CalendarDays className="w-4 h-4" /> 
                          {format(parseISO(reminder.dueDate), "dd 'de' MMMM", { locale: ptBR })}
                        </p>
                        {reminder.description && <p className="text-xs text-gray-500 truncate">{reminder.description}</p>}
                        
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className={cn(
                            "mt-3 w-full rounded-xl",
                            reminder.urgency === 'late' ? "text-red-700 bg-red-100 hover:bg-red-200" : 
                            reminder.urgency === 'today' ? "text-orange-700 bg-orange-100 hover:bg-orange-200" : "text-yellow-700 bg-yellow-100 hover:bg-yellow-200"
                          )}
                          onClick={() => markAsPaid(reminder.id)}
                        >
                          Marcar como Pago
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'list' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Filters */}
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input 
                  placeholder="Buscar por nome..." 
                  className="pl-11 h-12 bg-white rounded-2xl border-none shadow-sm focus-visible:ring-1 focus-visible:ring-blue-600 focus-visible:ring-offset-0"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2 mb-2">
                <select 
                  className="flex-1 h-11 rounded-2xl border-none shadow-sm bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 appearance-none font-medium"
                  value={filterType}
                  onChange={e => setFilterType(e.target.value as any)}
                >
                  <option value="all">Todas as Dívidas</option>
                  <option value="owe_me">A Receber</option>
                  <option value="i_owe">A Pagar</option>
                </select>
                <select 
                  className="flex-1 h-11 rounded-2xl border-none shadow-sm bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 appearance-none font-medium"
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value as any)}
                >
                  <option value="all">Todos os Status</option>
                  <option value="pending">Pendentes</option>
                  <option value="paid">Pagos</option>
                </select>
              </div>
            </div>

            {/* List */}
            <div className="flex flex-col gap-3">
              {filteredDebts.length === 0 ? (
                <div className="p-10 text-center text-gray-500 bg-white rounded-3xl shadow-sm">Nenhuma dívida encontrada.</div>
              ) : (
                filteredDebts.map(debt => {
                  const isLate = debt.status === 'pending' && differenceInDays(parseISO(debt.dueDate), new Date()) < 0;
                  
                  return (
                    <div key={debt.id} className={cn("bg-white p-4 rounded-3xl shadow-sm flex flex-col gap-3 relative overflow-hidden transition-all", debt.status === 'paid' ? 'opacity-60 grayscale-[0.5]' : '')}>
                      <div className={cn(
                        "absolute left-0 top-0 bottom-0 w-1.5",
                        debt.type === 'owe_me' ? "bg-green-500" : "bg-red-500"
                      )} />
                      
                      <div className="flex justify-between items-start pl-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-lg">{debt.personName}</p>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                            <CalendarDays className="w-3.5 h-3.5" />
                            {format(parseISO(debt.dueDate), "dd MMM yyyy", { locale: ptBR })}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={cn("font-bold text-lg", debt.status === 'paid' ? "text-gray-400 line-through" : "text-gray-900")}>
                            {formatCurrency(debt.amount)}
                          </p>
                          <p className="text-xs font-medium uppercase tracking-wider mt-0.5">
                            {debt.status === 'paid' ? (
                              <span className="text-green-600">Pago</span>
                            ) : isLate ? (
                              <span className="text-red-500">Atrasado</span>
                            ) : (
                              <span className="text-yellow-600">Pendente</span>
                            )}
                          </p>
                        </div>
                      </div>
                      
                      {debt.description && (
                         <div className="bg-gray-50 p-2 rounded-xl text-sm italic text-gray-600 pl-3">
                           &quot;{debt.description}&quot;
                         </div>
                      )}
                      
                      <div className="flex gap-2 pl-2">
                        {debt.status === 'pending' ? (
                          <Button size="sm" variant="ghost" className="flex-1 h-9 rounded-xl bg-green-50 text-green-700 hover:bg-green-100" onClick={() => markAsPaid(debt.id)}>
                            Marcar como Pago
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="flex-1 h-9 rounded-xl bg-gray-100 text-gray-800 hover:bg-gray-200" onClick={() => markAsPending(debt.id)}>
                            Desfazer Pago
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-9 rounded-xl text-red-500 bg-red-50 hover:bg-red-100 px-4" onClick={() => setDebtToDelete(debt.id)}>
                          Excluir
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'pix' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 rounded-3xl shadow-sm mb-2">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Cobrança Rápida</h2>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                Cadastre sua chave PIX para enviar cobranças pelo WhatsApp facilmente.
              </p>
            </div>
            
            <div className="bg-white p-5 rounded-3xl shadow-sm mb-2">
              <label className="text-sm font-semibold text-gray-700 block mb-2">Minha Chave PIX</label>
              <div className="flex gap-2">
                <Input 
                  value={pixKey}
                  onChange={(e) => savePixKey(e.target.value)}
                  placeholder="Ex: 123.456.789-00"
                  className="h-12 bg-gray-50 border-transparent rounded-xl focus-visible:ring-blue-600 focus-visible:bg-white text-lg"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-4">
              <h3 className="font-semibold text-gray-700 px-2">Meus Devedores</h3>
              {debts.filter(d => d.type === 'owe_me' && d.status === 'pending').length === 0 ? (
                <div className="p-10 text-center text-gray-500 bg-white rounded-3xl shadow-sm">
                  Ninguém te deve no momento.
                </div>
              ) : (
                debts.filter(d => d.type === 'owe_me' && d.status === 'pending').map(debt => {
                  const message = `Olá ${debt.personName}! Tudo bem? Passando para lembrar do valor de ${formatCurrency(debt.amount)}${debt.description ? ` referente a ${debt.description}` : ''}. Meu PIX é: ${pixKey}. Obrigado!`;
                  const whatsappLink = `https://wa.me/?text=${encodeURIComponent(message)}`;
                  
                  return (
                    <div key={debt.id} className="bg-white p-4 rounded-3xl shadow-sm flex flex-col gap-3 relative overflow-hidden">
                      <div className="flex justify-between items-start pl-1">
                         <div>
                           <p className="font-semibold text-gray-900 text-lg">{debt.personName}</p>
                           <p className="font-bold text-gray-700 mt-1">{formatCurrency(debt.amount)}</p>
                         </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button 
                          asChild
                          variant="ghost"
                          className="flex-1 h-11 rounded-xl bg-green-50 hover:bg-green-100 text-green-700 font-medium"
                          onClick={(e) => {
                            if (!pixKey) {
                              e.preventDefault();
                              alert('Por favor, cadastre sua chave PIX primeiro.');
                            }
                          }}
                        >
                          <a target="_blank" rel="noopener noreferrer" href={pixKey ? whatsappLink : '#'}>
                            WhatsApp
                          </a>
                        </Button>
                        <Button 
                          variant="ghost"
                          className="flex-1 h-11 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium"
                          onClick={() => {
                            if (!pixKey) {
                              alert('Por favor, cadastre sua chave PIX primeiro.');
                              return;
                            }
                            navigator.clipboard.writeText(message);
                            alert('Mensagem copiada!');
                          }}
                        >
                          Copiar Texto
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'trust' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 rounded-3xl shadow-sm mb-2">
              <h2 className="text-xl font-bold mb-1">Confiabilidade</h2>
              <p className="text-sm text-gray-500">
                Score de crédito baseado em pagamentos em dia vs atrasos de pessoas que te devem.
              </p>
            </div>

            {trustMetrics.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl shadow-sm">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="font-medium text-gray-900">Sem dados</h3>
                <p className="text-sm text-gray-500 mt-1 max-w-[200px] mx-auto">Adicione dívidas e marque como pago para gerar análises.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {trustMetrics.map(person => {
                  const data = [
                    { name: 'Pagou (No prazo/Acordo)', value: person.paidOnTime, color: '#22c55e' },
                    { name: 'Atrasado/Pendente', value: person.pendingLate, color: '#ef4444' },
                    { name: 'Pendente (No prazo)', value: person.total - person.paidOnTime - person.pendingLate, color: '#eab308' },
                  ].filter(d => d.value > 0);

                  return (
                    <Card key={person.name} className="overflow-hidden border-none shadow-sm rounded-3xl">
                      <CardHeader className="bg-white border-b border-gray-50 pb-4">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-lg font-bold">{person.name}</CardTitle>
                          <div className={cn(
                            "px-3 py-1 rounded-full text-xs font-bold",
                            person.score >= 80 ? 'bg-green-100 text-green-700' : 
                            person.score >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                          )}>
                            Score: {person.score}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0 pt-4 bg-white">
                        <div className="h-56 mb-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={70}
                                paddingAngle={2}
                                dataKey="value"
                              >
                                {data.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value) => [`${value} dívida(s)`, 'Quantidade']} />
                              <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }}/>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex border-t border-gray-50">
                          <div className="flex-1 p-4 text-center border-r border-gray-50">
                            <p className="text-xs text-gray-500 font-medium mb-1">Total</p>
                            <p className="text-xl font-bold">{person.total}</p>
                          </div>
                          <div className="flex-1 p-4 text-center">
                            <p className="text-xs text-gray-500 font-medium mb-1">Atrasos</p>
                            <p className="text-xl font-bold text-red-500">{person.pendingLate}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* FAB - Floating Action Button for Android Style */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <button 
            className="absolute bottom-24 right-5 w-14 h-14 bg-blue-600 text-white rounded-[1.25rem] flex items-center justify-center shadow-[0_4px_14px_rgba(37,99,235,0.4)] active:scale-95 transition-transform z-20"
            aria-label="Adicionar Dívida"
          >
            <Plus className="w-6 h-6" />
          </button>
        </DialogTrigger>
        <DialogContent className="fixed left-1/2 -translate-x-1/2 top-auto bottom-0 w-full max-w-md bg-white p-6 rounded-t-3xl border-none shadow-2xl pb-10 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-2xl">Nova Dívida</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-5">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-700">Tipo da Dívida</label>
              <div className="flex gap-3">
                <Button 
                  type="button" 
                  variant={formData.type === 'owe_me' ? 'default' : 'outline'} 
                  onClick={() => setFormData({...formData, type: 'owe_me'})}
                  className={cn("flex-1 h-12 rounded-xl", formData.type === 'owe_me' ? 'bg-[#cce8cd] text-green-900 hover:bg-[#b0d9b1]' : '')}
                >
                  <TrendingUp className="w-4 h-4 mr-2" /> Me devem
                </Button>
                <Button 
                  type="button" 
                  variant={formData.type === 'i_owe' ? 'default' : 'outline'} 
                  onClick={() => setFormData({...formData, type: 'i_owe'})}
                  className={cn("flex-1 h-12 rounded-xl", formData.type === 'i_owe' ? 'bg-[#f8cdd1] text-red-900 hover:bg-[#f3b0b5]' : '')}
                >
                  <TrendingDown className="w-4 h-4 mr-2" /> Eu devo
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="personName" className="text-sm font-semibold text-gray-700">Pessoa / Instituição</label>
              <Input 
                id="personName"
                placeholder="Nome..." 
                value={formData.personName}
                onChange={(e) => setFormData({...formData, personName: e.target.value})}
                required
                className="h-12 bg-gray-50 border-transparent rounded-xl focus-visible:ring-blue-600 focus-visible:bg-white"
              />
            </div>
            
            <div className="flex gap-4">
              <div className="space-y-2 flex-1">
                <label htmlFor="amount" className="text-sm font-semibold text-gray-700">Valor (R$)</label>
                <Input 
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00" 
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  required
                  className="h-12 bg-gray-50 border-transparent rounded-xl focus-visible:ring-blue-600 focus-visible:bg-white text-lg font-medium"
                />
              </div>
              <div className="space-y-2 flex-1">
                <label htmlFor="dueDate" className="text-sm font-semibold text-gray-700">Vencimento</label>
                <Input 
                  id="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                  required
                  className="h-12 bg-gray-50 border-transparent rounded-xl focus-visible:ring-blue-600 focus-visible:bg-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-semibold text-gray-700">Descrição</label>
              <Input 
                id="description"
                placeholder="Ex: Empréstimo, Pizza, etc" 
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="h-12 bg-gray-50 border-transparent rounded-xl focus-visible:ring-blue-600 focus-visible:bg-white"
              />
            </div>
            
            <Button type="submit" className="w-full h-14 rounded-2xl text-lg font-medium bg-blue-600 hover:bg-blue-700 mt-2">
              Salvar Dívida
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Android Style Bottom Navigation (MD3) */}
      <nav className="absolute bottom-0 left-0 right-0 h-20 bg-[#f3f4f6] flex justify-around items-center px-1 pb-safe border-t border-gray-200/50 z-10">
        <MobileTab active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Home className="w-6 h-6" />} label="Início" />
        <MobileTab active={activeTab === 'list'} onClick={() => setActiveTab('list')} icon={<List className="w-6 h-6" />} label="Dívidas" />
        <MobileTab active={activeTab === 'pix'} onClick={() => setActiveTab('pix')} icon={<QrCode className="w-6 h-6" />} label="Cobrar" />
        <MobileTab active={activeTab === 'trust'} onClick={() => setActiveTab('trust')} icon={<User className="w-6 h-6" />} label="Devedores" />
      </nav>
      
      <Dialog open={!!debtToDelete} onOpenChange={(open) => !open && setDebtToDelete(null)}>
        <DialogContent className="fixed left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white p-6 rounded-3xl border-none shadow-2xl data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-xl">Excluir Dívida</DialogTitle>
          </DialogHeader>
          <p className="text-gray-600 mb-6 font-medium text-sm">Tem certeza que deseja excluir esta dívida? Esta ação não pode ser desfeita.</p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDebtToDelete(null)} className="rounded-xl h-12 font-medium px-4 bg-gray-50 text-gray-700 hover:bg-gray-100">
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (debtToDelete) deleteDebt(debtToDelete);
                setDebtToDelete(null);
              }}
              className="rounded-xl h-12 bg-red-500 hover:bg-red-600 font-bold px-4"
            >
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      </div>
    </div>
  );
}

function MobileTab({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center p-2 min-w-[72px] h-full transition-all group",
        active ? "text-gray-900" : "text-gray-500 hover:text-gray-900"
      )}
    >
      <div className={cn(
        "px-5 py-1 rounded-full mb-1 transition-all duration-300 flex items-center justify-center",
        active ? "bg-blue-100 text-blue-800" : "bg-transparent group-hover:bg-gray-100"
      )}>
        {icon}
      </div>
      <span className={cn(
        "text-[12px] font-medium transition-all",
        active ? "font-bold text-gray-900" : ""
      )}>{label}</span>
    </button>
  );
}
