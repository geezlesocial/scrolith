describe('Wallet & Withdrawals — smoke', () => {
  const baseUrl = Cypress.config('baseUrl') || 'http://localhost:5173';

  before(() => {
    cy.request('POST', `${baseUrl}/api/auth/login`, { email: 'admin@local.test', password: 'adminpass' })
      .then((resp) => {
        const token = resp.body?.token;
        if (token) {
          window.localStorage.setItem('token', token);
          const user = resp.body.user || { email: 'admin@local.test', role: 'ADMIN' };
          window.localStorage.setItem('user', JSON.stringify(user));
        }
      });
  });

  it('Shows wallet balances and transactions', () => {
    cy.visit('/freelancer/dashboard/wallet');
    cy.get('[data-cy=overview-value-wallet]').should('exist');
    cy.get('[data-cy=wallet-transactions]').should('exist');
  });
});
