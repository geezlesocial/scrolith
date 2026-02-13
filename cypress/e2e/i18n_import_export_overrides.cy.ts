describe('i18n import/export and overrides', () => {
  const adminEmail = Cypress.env('adminEmail');
  const adminPassword = Cypress.env('adminPassword');

  it('imports JSON dictionary and exports locale payload', () => {
    if (!adminEmail || !adminPassword) {
      cy.log('Skipping: set CYPRESS_adminEmail and CYPRESS_adminPassword');
      return;
    }

    cy.visit('/auth/login');
    cy.apiLogin(adminEmail, adminPassword).then(({ token }) => {
      const dictionary = {
        'qa.sample.title': 'QA Title',
        'qa.sample.subtitle': 'QA Subtitle'
      };

      cy.request({
        method: 'POST',
        url: '/api/admin/i18n/import',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          format: 'json',
          locale: 'en',
          dictionary
        }
      }).its('status').should('eq', 200);

      cy.request({
        method: 'GET',
        url: '/api/admin/i18n/export',
        headers: { Authorization: `Bearer ${token}` },
        qs: { format: 'json', locale: 'en' }
      }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body?.data?.content || '').to.contain('qa.sample.title');
      });
    });
  });

  it('creates an override and verifies replacement behavior on auth page', () => {
    if (!adminEmail || !adminPassword) {
      cy.log('Skipping: set CYPRESS_adminEmail and CYPRESS_adminPassword');
      return;
    }

    cy.visit('/auth/login');
    cy.apiLogin(adminEmail, adminPassword).then(({ token }) => {
      const replacement = `Back to login (${Date.now()})`;
      cy.request({
        method: 'POST',
        url: '/api/admin/i18n/overrides',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          locale: 'en',
          matchText: 'Back to sign in',
          replacementText: replacement,
          enabled: true,
          priority: 1
        }
      }).its('status').should('eq', 200);

      cy.visit('/auth/forgot-password');
      cy.contains(replacement, { timeout: 15000 }).should('exist');
    });
  });
});

