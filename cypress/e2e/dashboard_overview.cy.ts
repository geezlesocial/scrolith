describe('Dashboard Overview — basic smoke', () => {
  before(() => {
    // Optionally programmatic login via API to speed up tests
    const apiUrl = (Cypress.env('apiUrl') || '/api').replace(/\/$/, '');
    const authEndpoint = `${apiUrl}/auth/login`;
    cy.request('POST', authEndpoint, { email: 'admin@local.test', password: 'adminpass' })
      .then((resp) => {
        expect(resp.status).to.eq(200);
        const token = resp.body?.token;
        const user = resp.body.user || { email: 'admin@local.test', role: 'ADMIN' };
        if (token) {
          Cypress.env('apiToken', token);
          Cypress.env('apiUser', JSON.stringify(user));
        }
      });
  });

  it('Shows overview cards and realtime counts', () => {
    cy.visit('/freelancer/dashboard', {
      onBeforeLoad(win) {
        const token = Cypress.env('apiToken');
        const user = Cypress.env('apiUser');
        if (token) win.localStorage.setItem('token', token);
        if (user) win.localStorage.setItem('user', user);
      },
    });

    // Debug: ensure token was injected into the app window
    cy.window().then((win) => {
      const t = win.localStorage.getItem('token');
      expect(t, 'auth token present in localStorage').to.be.a('string');
    });

    // Wait for overview to load
    cy.get('[data-cy=overview-card-active-orders]', { timeout: 15000 }).should('exist');
    cy.get('[data-cy=overview-card-earnings]', { timeout: 15000 }).should('exist');
    cy.get('[data-cy=overview-card-wallet]', { timeout: 15000 }).should('exist');

    // Unread counters
    cy.get('[data-cy=unread-messages]', { timeout: 10000 }).should('exist');
    cy.get('[data-cy=unread-notifications]', { timeout: 10000 }).should('exist');

    // Values are numbers
    cy.get('[data-cy=overview-card-earnings] .value').invoke('text').then(text => {
      expect(parseFloat(text.replace(/[^0-9.]/g, ''))).to.be.a('number');
    });
  });
});
