describe('Freelancer MyGigs — smoke', () => {
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

  it('Navigates to My Gigs and shows list', () => {
    cy.visit('/freelancer/dashboard/gigs');
    cy.get('[data-cy=mygigs-list]').should('exist');
  });
});
