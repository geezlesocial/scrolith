
import { SupportTicket, TicketReply, TicketStatus, TicketPriority, TicketCategory } from '../types';

const STORAGE_KEY = 'scrolith_support_tickets';
const CATEGORIES_KEY = 'scrolith_support_categories';

// Initial Mock Data
const INITIAL_TICKETS: SupportTicket[] = [
    {
        id: 'GZL-SUP-2023-00105',
        trackingCode: 'GZL-ABC12345',
        userId: 'u1',
        fullName: 'Sarah Jenkins',
        email: 'sarah@example.com',
        mobile: '+15550199',
        subject: 'Payment Issue',
        message: 'I requested a withdrawal 3 days ago but it is still pending. Please assist.',
        status: 'Open',
        priority: 'High',
        category: 'Billing',
        createdAt: '2023-10-25T14:30:00Z',
        updatedAt: '2023-10-25T14:30:00Z',
        isReadByAdmin: false,
        isReadByUser: true,
        replies: []
    },
    {
        id: 'GZL-SUP-2023-00102',
        trackingCode: 'GZL-XYZ98765',
        userId: 'u2',
        fullName: 'TechCorp Inc.',
        email: 'billing@techcorp.com',
        mobile: '+15550288',
        subject: 'Feature Request',
        message: 'Can we get an invoice generation feature?',
        status: 'Resolved',
        priority: 'Low',
        category: 'General',
        createdAt: '2023-10-20T09:15:00Z',
        updatedAt: '2023-10-22T11:00:00Z',
        isReadByAdmin: true,
        isReadByUser: true,
        replies: [
            {
                id: 'r1',
                ticketId: 'GZL-SUP-2023-00102',
                sender: 'admin',
                senderName: 'Support Team',
                message: 'Hi there, invoices are available in the Financials tab. Let us know if you need more help.',
                timestamp: '2023-10-21T10:00:00Z'
            }
        ]
    }
];

const INITIAL_CATEGORIES: TicketCategory[] = [
    { id: 'cat-1', name: 'General Inquiry', isActive: true },
    { id: 'cat-2', name: 'Technical Support', isActive: true },
    { id: 'cat-3', name: 'Billing Issue', isActive: true },
    { id: 'cat-4', name: 'Report a User', isActive: true },
    { id: 'cat-5', name: 'Dispute', isActive: true }
];

// Helper to get tickets from storage or initialize
const getStoredTickets = (): SupportTicket[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error("Failed to parse tickets", e);
    }
    // Initialize if empty
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_TICKETS));
    return INITIAL_TICKETS;
};

// Helper to save tickets and notify listeners
const saveTickets = (tickets: SupportTicket[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
    // Dispatch event for real-time updates within the same window/tab
    window.dispatchEvent(new Event('ticket_db_change'));
};

// Helper for categories
const getStoredCategories = (): TicketCategory[] => {
    try {
        const stored = localStorage.getItem(CATEGORIES_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error("Failed to parse categories", e);
    }
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(INITIAL_CATEGORIES));
    return INITIAL_CATEGORIES;
};

const saveCategories = (categories: TicketCategory[]) => {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
    window.dispatchEvent(new Event('ticket_db_change'));
};

export const SupportService = {
    // Ticket Categories Management (Admin)
    getCategories: async (): Promise<TicketCategory[]> => {
        return new Promise(resolve => {
            setTimeout(() => resolve(getStoredCategories()), 200);
        });
    },

    saveCategory: async (category: TicketCategory): Promise<TicketCategory> => {
        return new Promise(resolve => {
            const categories = getStoredCategories();
            const idx = categories.findIndex(c => c.id === category.id);
            if (idx >= 0) categories[idx] = category;
            else categories.push({ ...category, id: category.id || `cat-${Date.now()}` });
            
            saveCategories(categories);
            resolve(category);
        });
    },

    deleteCategory: async (id: string): Promise<void> => {
        return new Promise(resolve => {
            const categories = getStoredCategories().filter(c => c.id !== id);
            saveCategories(categories);
            resolve();
        });
    },

    // Public / User methods
    createTicket: async (data: Partial<SupportTicket>): Promise<SupportTicket> => {
        return new Promise(resolve => {
            setTimeout(() => {
                const tickets = getStoredTickets();
                const trackingCode = `GZL-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
                
                const newTicket: SupportTicket = {
                    id: `GZL-SUP-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
                    trackingCode,
                    userId: data.userId || 'guest',
                    fullName: data.fullName || 'Guest',
                    email: data.email || '',
                    mobile: data.mobile || '',
                    subject: data.subject || '',
                    message: data.message || '',
                    status: 'Open',
                    priority: 'Medium',
                    category: data.category || 'General',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    replies: [],
                    isReadByAdmin: false,
                    isReadByUser: true,
                    attachments: data.attachments || []
                };
                
                tickets.unshift(newTicket);
                saveTickets(tickets);
                
                resolve(newTicket);
            }, 800);
        });
    },

    getTicketById: async (idOrCode: string, email?: string): Promise<SupportTicket | null> => {
        return new Promise(resolve => {
            setTimeout(() => {
                const tickets = getStoredTickets();
                // Match by ID OR Tracking Code, plus Email verification if provided
                const ticket = tickets.find(t => 
                    (t.id === idOrCode || t.trackingCode === idOrCode) && 
                    (!email || t.email.toLowerCase() === email.toLowerCase())
                );
                resolve(ticket || null);
            }, 500);
        });
    },

    replyToTicket: async (ticketId: string, reply: Partial<TicketReply>): Promise<TicketReply> => {
        return new Promise(resolve => {
            setTimeout(() => {
                const tickets = getStoredTickets();
                const ticketIndex = tickets.findIndex(t => t.id === ticketId);
                
                if (ticketIndex === -1) throw new Error("Ticket not found");

                const newReply: TicketReply = {
                    id: Math.random().toString(36).substr(2, 9),
                    ticketId,
                    sender: reply.sender || 'user',
                    senderName: reply.senderName || 'User',
                    message: reply.message || '',
                    timestamp: new Date().toISOString(),
                    attachments: reply.attachments || [],
                    internalNote: reply.internalNote || false
                };

                tickets[ticketIndex].replies.push(newReply);
                tickets[ticketIndex].updatedAt = new Date().toISOString();
                
                if (reply.sender === 'admin' && !reply.internalNote) {
                    tickets[ticketIndex].isReadByUser = false;
                    tickets[ticketIndex].status = 'Waiting for User';
                } else if (reply.sender === 'user') {
                    tickets[ticketIndex].isReadByAdmin = false;
                    tickets[ticketIndex].status = 'Open'; // Re-open if user replies
                }

                saveTickets(tickets);
                resolve(newReply);
            }, 500);
        });
    },

    // Admin methods
    getAllTickets: async (): Promise<SupportTicket[]> => {
        return new Promise(resolve => {
            // Simulate network delay but fetch fresh data
            setTimeout(() => {
                resolve(getStoredTickets());
            }, 300);
        });
    },

    updateTicketStatus: async (id: string, status: TicketStatus): Promise<void> => {
        return new Promise(resolve => {
            const tickets = getStoredTickets();
            const idx = tickets.findIndex(t => t.id === id);
            if (idx > -1) {
                tickets[idx].status = status;
                tickets[idx].updatedAt = new Date().toISOString();
                saveTickets(tickets);
            }
            resolve();
        });
    },

    updateTicketPriority: async (id: string, priority: TicketPriority): Promise<void> => {
        return new Promise(resolve => {
            const tickets = getStoredTickets();
            const idx = tickets.findIndex(t => t.id === id);
            if (idx > -1) {
                tickets[idx].priority = priority;
                saveTickets(tickets);
            }
            resolve();
        });
    }
};
