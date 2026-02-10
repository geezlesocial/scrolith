
import { Contract, TimeEntry, ContractStatus } from '../types';
import { MOCK_CONTRACTS, MOCK_TIME_ENTRIES } from '../constants';

const CONTRACTS_KEY = 'scrolith_contracts';
const TIME_ENTRIES_KEY = 'scrolith_time_entries';
const ACTIVE_SESSION_PREFIX = 'gzl_active_session_';

export const ContractService = {
    // --- Data Access ---
    
    getContracts: async (userId: string, role: 'client' | 'freelancer' | 'admin'): Promise<Contract[]> => {
        try {
            const stored = localStorage.getItem(CONTRACTS_KEY);
            let all: Contract[] = stored ? JSON.parse(stored) : [...MOCK_CONTRACTS];
            
            // Filter
            if (role !== 'admin') {
                all = all.filter(c => role === 'client' ? c.clientId === userId : c.freelancerId === userId);
            }

            // Enrich with live session data and stats
            return all.map(c => {
                const sessionKey = `${ACTIVE_SESSION_PREFIX}${c.id}`;
                const hasActiveSession = !!localStorage.getItem(sessionKey);
                
                // Calculate stats from logs
                const logs = ContractService.getLocalLogsSync(c.id);
                // Earnings pending are logs that are Pending or Approved (but not yet Paid)
                const earningsPending = logs.filter(l => l.status === 'pending' || l.status === 'approved').reduce((sum, l) => sum + (l.earnings || 0), 0);
                
                return {
                    ...c,
                    hoursToday: 2.5, // Mock value, in prod calc from today's logs
                    hoursThisWeek: 12.5, // Mock value
                    earningsPending: earningsPending,
                    activeSessionId: hasActiveSession ? 'session-live' : undefined
                };
            });
        } catch { return []; }
    },

    // Helper for synchronous log retrieval within service
    getLocalLogsSync: (contractId: string): TimeEntry[] => {
        try {
            const stored = localStorage.getItem(TIME_ENTRIES_KEY);
            const all: TimeEntry[] = stored ? JSON.parse(stored) : [...MOCK_TIME_ENTRIES];
            return all.filter(t => t.contractId === contractId);
        } catch { return []; }
    },

    getContractById: async (id: string): Promise<Contract | null> => {
        const stored = localStorage.getItem(CONTRACTS_KEY);
        const all: Contract[] = stored ? JSON.parse(stored) : [...MOCK_CONTRACTS];
        return all.find(c => c.id === id) || null;
    },

    createContract: async (contract: Partial<Contract>): Promise<Contract> => {
        const stored = localStorage.getItem(CONTRACTS_KEY);
        const all: Contract[] = stored ? JSON.parse(stored) : [...MOCK_CONTRACTS];
        
        const newContract: Contract = {
            id: `cnt-${Date.now()}`,
            title: contract.title || 'Untitled Contract',
            clientId: contract.clientId!,
            clientName: contract.clientName || 'Client',
            freelancerId: contract.freelancerId!,
            freelancerName: contract.freelancerName || 'Freelancer',
            type: contract.type || 'hourly',
            hourlyRate: contract.hourlyRate || 0,
            paymentCycle: contract.paymentCycle || 'weekly',
            status: 'active',
            totalHoursLogged: 0,
            totalPaid: 0,
            startDate: new Date().toISOString(),
            description: contract.description || ''
        };

        all.unshift(newContract);
        localStorage.setItem(CONTRACTS_KEY, JSON.stringify(all));
        return newContract;
    },

    updateStatus: async (id: string, status: ContractStatus): Promise<void> => {
        const stored = localStorage.getItem(CONTRACTS_KEY);
        const all: Contract[] = stored ? JSON.parse(stored) : [...MOCK_CONTRACTS];
        const idx = all.findIndex(c => c.id === id);
        if (idx >= 0) {
            all[idx].status = status;
            localStorage.setItem(CONTRACTS_KEY, JSON.stringify(all));
        }
    },

    // --- Time Tracking (ATM) ---

    startTracking: async (contractId: string): Promise<void> => {
        const key = `${ACTIVE_SESSION_PREFIX}${contractId}`;
        if (localStorage.getItem(key)) throw new Error("Session already active");

        const sessionData = {
            contractId,
            startTime: new Date().toISOString(),
            notes: ''
        };
        localStorage.setItem(key, JSON.stringify(sessionData));
    },

    stopTracking: async (contractId: string, notes: string, screenshots: string[] = []): Promise<TimeEntry> => {
        const key = `${ACTIVE_SESSION_PREFIX}${contractId}`;
        const sessionStr = localStorage.getItem(key);
        if (!sessionStr) throw new Error("No active session");

        const session = JSON.parse(sessionStr);
        const endTime = new Date();
        const startTime = new Date(session.startTime);
        const durationMinutes = (endTime.getTime() - startTime.getTime()) / 1000 / 60;

        // Calculate earnings based on contract rate
        const contract = await ContractService.getContractById(contractId);
        const rate = contract?.hourlyRate || 0;
        const earnings = (durationMinutes / 60) * rate;

        const newEntry: TimeEntry = {
            id: `te-${Date.now()}`,
            contractId,
            freelancerId: contract?.freelancerId || 'unknown',
            startTime: session.startTime,
            endTime: endTime.toISOString(),
            durationMinutes,
            description: notes || 'Work Session',
            status: 'pending',
            screenshots,
            earnings,
            activityScore: Math.floor(Math.random() * 20) + 80 // Mock activity 80-100%
        };

        // Save Entry
        const storedEntries = localStorage.getItem(TIME_ENTRIES_KEY);
        const allEntries: TimeEntry[] = storedEntries ? JSON.parse(storedEntries) : [...MOCK_TIME_ENTRIES];
        allEntries.unshift(newEntry);
        localStorage.setItem(TIME_ENTRIES_KEY, JSON.stringify(allEntries));

        // Update Contract Totals
        if (contract) {
            const storedContracts = localStorage.getItem(CONTRACTS_KEY);
            const allContracts: Contract[] = storedContracts ? JSON.parse(storedContracts) : [...MOCK_CONTRACTS];
            const cIdx = allContracts.findIndex(c => c.id === contractId);
            if (cIdx >= 0) {
                allContracts[cIdx].totalHoursLogged += (durationMinutes / 60);
                localStorage.setItem(CONTRACTS_KEY, JSON.stringify(allContracts));
            }
        }

        // Clear Session
        localStorage.removeItem(key);
        return newEntry;
    },

    getTimeEntries: async (contractId: string): Promise<TimeEntry[]> => {
        try {
            const stored = localStorage.getItem(TIME_ENTRIES_KEY);
            const all: TimeEntry[] = stored ? JSON.parse(stored) : [...MOCK_TIME_ENTRIES];
            return all.filter(t => t.contractId === contractId).sort((a,b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        } catch { return []; }
    },

    logTime: async (entry: Partial<TimeEntry>): Promise<TimeEntry> => {
        const stored = localStorage.getItem(TIME_ENTRIES_KEY);
        const all: TimeEntry[] = stored ? JSON.parse(stored) : [...MOCK_TIME_ENTRIES];
        
        const newEntry: TimeEntry = {
            id: `te-${Date.now()}`,
            contractId: entry.contractId!,
            freelancerId: entry.freelancerId!,
            startTime: entry.startTime || new Date().toISOString(),
            endTime: entry.endTime,
            durationMinutes: entry.durationMinutes || 0,
            description: entry.description || 'Manual Entry',
            status: 'pending',
            screenshots: entry.screenshots || [],
            earnings: entry.earnings || 0,
            activityScore: entry.activityScore || 100
        };

        all.unshift(newEntry);
        localStorage.setItem(TIME_ENTRIES_KEY, JSON.stringify(all));
        return newEntry;
    },

    // --- Payment Logic ---

    approveTimeEntry: async (id: string): Promise<void> => {
        const stored = localStorage.getItem(TIME_ENTRIES_KEY);
        const all: TimeEntry[] = stored ? JSON.parse(stored) : [...MOCK_TIME_ENTRIES];
        const idx = all.findIndex(t => t.id === id);
        if (idx >= 0) {
            all[idx].status = 'approved';
            localStorage.setItem(TIME_ENTRIES_KEY, JSON.stringify(all));
        }
    },

    payContractDue: async (contractId: string): Promise<number> => {
        const stored = localStorage.getItem(TIME_ENTRIES_KEY);
        let all: TimeEntry[] = stored ? JSON.parse(stored) : [...MOCK_TIME_ENTRIES];
        
        let totalPaidAmount = 0;

        // Update entries: Set pending/approved logs to 'paid'
        all = all.map(entry => {
            if (entry.contractId === contractId && (entry.status === 'pending' || entry.status === 'approved')) {
                totalPaidAmount += (entry.earnings || 0);
                return { ...entry, status: 'paid' };
            }
            return entry;
        });
        
        localStorage.setItem(TIME_ENTRIES_KEY, JSON.stringify(all));
        
        // Update contract totals
        const contractsStored = localStorage.getItem(CONTRACTS_KEY);
        const contracts: Contract[] = contractsStored ? JSON.parse(contractsStored) : [...MOCK_CONTRACTS];
        const idx = contracts.findIndex(c => c.id === contractId);
        if (idx >= 0) {
            contracts[idx].totalPaid += totalPaidAmount;
            localStorage.setItem(CONTRACTS_KEY, JSON.stringify(contracts));
        }

        return totalPaidAmount;
    }
};
