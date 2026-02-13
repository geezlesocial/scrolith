describe('i18n admin live update', () => {
  const adminEmail = Cypress.env('adminEmail');
  const adminPassword = Cypress.env('adminPassword');

  it('updates a translation value via admin API and reflects on login UI', () => {
    if (!adminEmail || !adminPassword) {
      cy.log('Skipping: set CYPRESS_adminEmail and CYPRESS_adminPassword');
      return;
    }

    cy.visit('/auth/login');
    cy.apiLogin(adminEmail, adminPassword).then(({ token }) => {
      const marker = `Sign in (${Date.now()})`;
      cy.request({
        method: 'PUT',
        url: '/api/admin/i18n/values',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          key: 'auth.login.submit_label',
          locale: 'en',
          value: marker
        }
      }).its('status').should('eq', 200);

      cy.visit('/auth/login');
      cy.contains(marker, { timeout: 15000 }).should('exist');
    });
  });
});

