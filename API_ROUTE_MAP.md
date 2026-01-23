API Route Map

Favorites (Likes)
- GET `/api/favorites` -> list my favorites
- POST `/api/favorites` -> add favorite
- DELETE `/api/favorites` -> remove favorite
- GET `/api/favorites/expanded` -> gigs/jobs/freelancers for favorites page
- GET `/api/favorites/received` -> freelancer likes stats
- GET `/api/admin/favorites` -> admin list
- GET `/api/admin/favorites/top` -> top favorites

Reviews
- POST `/api/reviews` -> create review (order completed)
- GET `/api/reviews/users/:id` -> published reviews for user
- GET `/api/reviews/me` -> reviews I wrote
- GET `/api/reviews/me/pending` -> eligible orders to review
- PATCH `/api/reviews/:id` -> update review within allowed window
- GET `/api/admin/reviews` -> admin moderation list
- PATCH `/api/admin/reviews/:id/status` -> admin status update

Gcoin
- GET `/api/gcoin/settings`
- POST `/api/gcoin/settings`
- GET `/api/gcoin/wallets`
- GET `/api/gcoin/wallets/:userId`
- POST `/api/gcoin/wallets/:userId/freeze`
- POST `/api/gcoin/wallets/:userId/unfreeze`
- GET `/api/gcoin/transactions`
- GET `/api/gcoin/admin/transactions`
- POST `/api/gcoin/transactions`
- POST `/api/gcoin/admin/credit`
- POST `/api/gcoin/admin/adjust`
- POST `/api/gcoin/transfer`
- GET `/api/gcoin/conversions`
- POST `/api/gcoin/conversions`
- POST `/api/gcoin/conversions/:id`

Community Settings
- GET `/api/community/settings`
- POST `/api/community/settings`
- POST `/api/community/settings/toggle`

Freelancer/Employer Dashboards
- GET `/api/freelancer/overview`
- GET `/api/employer/overview`
- GET `/api/gigs`
- POST `/api/gigs`
- PUT `/api/gigs/:id`
- DELETE `/api/gigs/:id`
- POST `/api/gigs/:id/submit`
- POST `/api/gigs/:id/pause`
- POST `/api/gigs/:id/activate`
- GET `/api/jobs`
- POST `/api/jobs`
- PUT `/api/jobs/:id`
- DELETE `/api/jobs/:id`
- POST `/api/jobs/:id/submit`
- POST `/api/jobs/:id/pause`
- POST `/api/jobs/:id/activate`
- POST `/api/jobs/:id/close`
- GET `/api/orders`
- GET `/api/contracts`
- GET `/api/contracts/:id`
- POST `/api/contracts/:id/tracking/start`
- POST `/api/contracts/:id/tracking/stop`
- GET `/api/contracts/:id/time-entries`
- POST `/api/contracts/time-entries/:id/approve`
- POST `/api/contracts/:id/pay`
- GET `/api/proposals`
- GET `/api/proposals/me`
- POST `/api/proposals/:id/accept`
- POST `/api/proposals/:id/reject`
- POST `/api/proposals/:id/shortlist`
- POST `/api/proposals/:id/unshortlist`
- POST `/api/proposals/:id/message`

Support
- GET `/api/support/categories`
- POST `/api/support/categories`
- DELETE `/api/support/categories/:id`
- POST `/api/support/tickets`
- GET `/api/support/tickets`
- GET `/api/support/tickets/:idOrCode`
- POST `/api/support/tickets/:ticketId/replies`
- PATCH `/api/support/tickets/:id/status`
- PATCH `/api/support/tickets/:id/priority`
