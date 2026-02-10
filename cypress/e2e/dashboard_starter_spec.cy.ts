describe('Scrolith Dashboards — Starter Specs', () => {
  beforeEach(() => {
    // adjust baseUrl in cypress config or use full URL
    cy.visit('/');
    // TODO: implement app-specific login helper or set token in localStorage
  });

  it('Uploaded Files: can open FilePicker, upload and delete a file', () => {
    // Navigate to Uploaded Files page
    cy.visit('/freelancer/dashboard/uploaded-files');
    cy.get('button').contains('Upload').should('exist');

    // Use fixture to upload (app must support test fixtures or stub network)
    cy.fixture('images/sample.png', 'base64').then(fileContent => {
      cy.intercept('POST', '/api/files', {
        statusCode: 200,
        body: {
          success: true,
          data: { id: 'file_test_1', url: 'https://cdn.test/file_test_1.png', name: 'sample.png', type: 'image/png', size: 12345, uploadedAt: new Date().toISOString(), usedIn: [] }
        }
      }).as('uploadFile');

      // open upload modal and simulate upload via UI (adjust selectors to app)
      cy.get('button').contains('Upload').click();
      cy.get('input[type=file]').attachFile({ fileContent, fileName: 'sample.png', mimeType: 'image/png', encoding: 'base64' });
      cy.wait('@uploadFile');
      cy.contains('sample.png').should('be.visible');
    });

    // Delete flow
    cy.intercept('DELETE', '/api/files/file_test_1', { statusCode: 200, body: { success: true } }).as('deleteFile');
    cy.get('[data-testid="file-row-file_test_1"]').within(() => {
      cy.get('button').contains('Delete').click();
    });
    cy.get('button').contains('Confirm').click();
    cy.wait('@deleteFile');
    cy.contains('sample.png').should('not.exist');
  });

  it('Freelancer: create gig -> appears as draft', () => {
    cy.visit('/freelancer/dashboard/my-gigs');
    cy.get('button').contains('Create Gig').click();

    // Fill minimal fields (selectors will vary)
    cy.get('input[name="title"]').type('Test Gig from Cypress');
    cy.get('textarea[name="description"]').type('Short description');
    cy.get('input[name="price"]').clear().type('50');

    // Ensure media selection uses FilePicker modal
    cy.get('button').contains('Select Media').click();
    // Intercept files list
    cy.intercept('GET', '/api/files*', { statusCode: 200, body: { success: true, data: [] } }).as('getFiles');
    cy.wait('@getFiles');
    cy.get('button').contains('Save Draft').click();

    // Intercept create gig
    cy.intercept('POST', '/api/gigs', { statusCode: 200, body: { success: true, data: { id: 'gig_test_1', status: 'draft' } } }).as('createGig');
    cy.wait('@createGig');

    // After save, ensure draft appears in list
    cy.intercept('GET', '/api/gigs*', { statusCode: 200, body: { success: true, data: [{ id: 'gig_test_1', title: 'Test Gig from Cypress', status: 'draft' }] } }).as('gigsList');
    cy.reload();
    cy.wait('@gigsList');
    cy.contains('Test Gig from Cypress').should('be.visible');
  });

  it('Navigation: freelancer and client uploaded-files routes load', () => {
    // Visit freelancer uploaded files route
    cy.visit('/freelancer/dashboard/uploaded-files');
    cy.contains('Uploaded Files').should('be.visible');

    // Visit client uploaded files route
    cy.visit('/client/dashboard/uploaded-files');
    cy.contains('Uploaded Files').should('be.visible');
  });
});

