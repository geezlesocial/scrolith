describe('i18n locale switching', () => {
  it('switches locale and updates html lang/dir metadata', () => {
    cy.visit('/');
    cy.window().then((win) => {
      win.localStorage.setItem('Scrolith.i18n.locale', 'ar');
    });
    cy.reload();

    cy.get('html').should('have.attr', 'lang').and('match', /ar|en/);
    cy.get('html').should('have.attr', 'dir').and('match', /rtl|ltr/);
  });
});

