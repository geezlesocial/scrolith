import "./commands";

// Prevent Cypress from failing on harmless app boot errors (optional but helpful)
Cypress.on("uncaught:exception", (err) => {
  // If your app throws known non-test-breaking errors during initial boot,
  // ignore them here. Add messages as needed.
  if (err?.message?.includes("useSocket must be used")) return false;
  if (err?.message?.includes("WebSocket closed without opened")) return false;
  if (err?.message?.includes("Socket connection")) return false;
  if (err?.message?.includes("Network Error")) return false;
  return true;
});

// Intercept API calls and return mock responses
beforeEach(() => {
  cy.intercept('GET', '**/messages/conversations', { body: { success: true, data: [] } }).as('messages');
  cy.intercept('GET', '**/notifications*', { body: { success: true, data: [] } }).as('notifications');
  cy.intercept('GET', '**/orders', { body: { success: true, data: [] } }).as('orders');
  cy.intercept('GET', '**/contracts', { body: { success: true, data: [] } }).as('contracts');
  cy.intercept('GET', '**/wallet/me', { body: { success: true, data: { balance: 0, transactions: [] } } }).as('wallet');

  // Mock gigs API
  cy.intercept('GET', '**/gigs*', { body: {
    success: true,
    data: [
      {
        id: 'gig-1',
        title: 'Test Web Development Gig',
        status: 'active',
        category: 'web-development',
        subcategory: 'frontend',
        price: { amount: 50, type: 'fixed' },
        performance: { views: 100, clicks: 10, orders: 2 },
        createdAt: new Date().toISOString()
      }
    ]
  } }).as('gigs');
});
