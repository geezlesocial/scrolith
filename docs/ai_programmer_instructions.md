
# AI Programmer Instructions: Completion Phase

Use this guide to complete the transition from "Mock Demo" to "Production App" on the local Windows environment.

## 🚨 IMMEDIATE FIX: Folder Structure Refactor
The project currently has a mix of root-level and `src/`-level files, causing import errors like `Failed to resolve import "./components/Navbar" from "src/App.tsx"`.

**Task 1: Standardize Directory Structure**
Run the following actions in the terminal or manually move files:
1.  Ensure a `src/` directory exists.
2.  Move the following folders **INTO** `src/`:
    - `components/`
    - `pages/`
    - `dashboard/`
    - `services/`
    - `context/`
    - `auth/`
    - `main/`
    - `community/`
    - `kyc/`
    - `profile/`
    - `messages/`
    - `create-gig/`
    - `create-job-post/`
3.  Move `App.tsx`, `index.tsx` (rename to `main.tsx` if preferred), and `types.ts` **INTO** `src/`.
4.  Update `index.html`: Change `<script src="/index.tsx">` to `<script src="/src/index.tsx">`.
5.  Update `vite.config.ts`: Ensure aliases point to `src`.

---

## 🛠 Backend & Database Implementation

**Task 2: Database Initialization (PostgreSQL)**
1.  **Install:** Ensure PostgreSQL is running locally (Port 5432).
2.  **Env:** Update `.env` with `DATABASE_URL="postgresql://user:pass@localhost:5432/atmyworks"`.
3.  **Prisma Setup:**
    *   Create `server/prisma/schema.prisma`.
    *   Define models matching `src/types.ts`: `User`, `Gig`, `Job`, `Order`, `Escrow`, `Wallet`, `Transaction`, `Message`, `SupportTicket`.
    *   Run `npx prisma migrate dev --name init`.

**Task 3: Authentication Implementation**
1.  **Middleware:** Create `server/src/middleware/auth.ts` to verify JWT tokens.
2.  **Auth Controller:** Update `login` and `signup` in `server/src/controllers/authController.ts` to use `bcrypt` and `prisma.user`.
3.  **Frontend:** Update `src/services/auth.ts` to call the real API endpoints instead of `localStorage`.

**Task 4: Marketplace Logic**
1.  **Gigs/Jobs:** Update `commerceController.ts` to perform CRUD operations on Prisma models.
2.  **Search:** Implement `pgvector` or simple SQL `LIKE` queries for search functionality.
3.  **Payments:** Connect Stripe Node.js SDK in `paymentController.ts`.

---

## 💻 Developer Workflow

**Running the App:**
1.  **Backend:**
    ```bash
    cd server
    npm install
    npx prisma generate
    npm run dev
    ```
2.  **Frontend:**
    ```bash
    cd ..
    npm run dev
    ```

**Troubleshooting:**
*   If imports fail, check `tsconfig.json` paths and ensure all code files are inside `src/`.
*   If database connection fails, verify credentials in `.env` and check if Postgres service is running.
