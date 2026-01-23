Dashboard Audit Report

Admin Dashboard
- Overview: `/api/wallet/platform-financials`, `/api/admin/analytics/activity`, `/api/admin/analytics/revenue-breakdown` -> OK (routes exist)
- Marketplace Analytics: `/api/admin/analytics/*` -> OK (routes exist)
- Reviews Moderation: `/api/admin/reviews`, `/api/admin/reviews/:id/status` -> OK (added admin page + service)
- Community Settings: `/api/community/settings`, `/api/community/settings/toggle` -> OK (routes exist, normalized in service)
- Gcoin Manager: `/api/gcoin/*` -> OK (routes exist, service normalized)
- Support & Disputes: `/api/support/tickets`, `/api/support/categories` -> OK (routes exist)
- Files: `/api/files` -> OK (existing files service)

Freelancer Dashboard
- Overview: `/api/freelancer/overview` -> OK (service wired)
- My Gigs: `/api/gigs` + `/api/gigs/:id/*` -> OK (service wired)
- Orders: `/api/orders` -> OK (service wired)
- Contracts: `/api/contracts` -> OK (ContractList wired)
- Proposals: `/api/proposals/me` -> OK (MyProposals wired)
- Reviews: `/api/reviews/users/:id` -> OK (new page + service)
- Likes: `/api/favorites/received` -> OK (new page + service)
- Wallet & Gcoin: `/api/wallet/*`, `/api/gcoin/*` -> OK (WalletModule wired)
- Uploaded Files: `/api/files` -> OK (UploadedFilesManager wired)

Employer Dashboard
- Overview: `/api/employer/overview` -> OK (service wired)
- My Jobs: `/api/jobs` + `/api/jobs/:id/*` -> OK (service wired)
- Proposals & Offers: `/api/proposals` -> OK (service wired)
- Contracts: `/api/contracts` -> OK (ContractList wired)
- Escrow: `/api/wallet/escrows` -> OK (WalletService wired)
- Favorites: `/api/favorites/expanded` -> OK (new page)
- Reviews: `/api/reviews/me/pending`, `/api/reviews/me`, `/api/reviews` -> OK (new page + service)
- Wallet & Gcoin: `/api/wallet/*`, `/api/gcoin/*` -> OK (WalletModule wired)
- Uploaded Files: `/api/files` -> OK (UploadedFilesManager wired)
