
# AtMyWorks | Next-Gen Freelance Marketplace

A comprehensive freelance platform featuring AI-driven governance, real-time collaboration, and secure crypto/fiat payments.

## 🚀 Quick Start

### 1. Prerequisites
- Node.js v18+
- PostgreSQL (Optional for demo mode, required for production)

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory:
```env
# Frontend Keys
VITE_GEMINI_API_KEY=your_gemini_key

# Backend Keys (Optional for UI demo)
DATABASE_URL="postgresql://user:password@localhost:5432/atmyworks"
STRIPE_SECRET_KEY=sk_test_...
OPENAI_API_KEY=sk_...
JWT_SECRET=supersecret
```

### 4. Run the Application

**Option A: Full Stack (Frontend + Backend)**
Open two terminals:

Terminal 1 (Backend):
```bash
npm run server
```

Terminal 2 (Frontend):
```bash
npm run dev
```

**Option B: Frontend Only (Mock Mode)**
If you just want to view the UI with mock data, simply run:
```bash
npm run dev
```
*Note: Some AI features requiring server-side processing will fallback to simulated responses.*

## 📂 Project Structure

- **`src/`**: React Frontend (Vite)
  - `components/`: Reusable UI blocks
  - `dashboard/`: Role-specific layouts (Admin, Freelancer, Client)
  - `services/`: API wrappers (Mock/Real hybrid)
  - `context/`: Global state (User, Cart, Socket)
  
- **`server/`**: Node.js/Express Backend
  - `src/controllers/`: Business logic
  - `src/routes/`: API endpoints
  - `src/ai/`: Prompts and AI orchestration

## 🛠 Features

- **AI Governance**: Dispute prediction, smart contract clauses, and escrow advice.
- **ATM Tracker**: Real-time hourly work tracking with "Activity Monitor".
- **Semantic Search**: Vector-based gig matching using embeddings.
- **Admin Dashboard**: Full platform control (Users, Finance, Content, AI Settings).
