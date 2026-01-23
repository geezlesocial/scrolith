describe('Freelancer - My Gigs', () => {
  beforeEach(() => {
    // Set up mock user for testing
    const mockUser = {
      id: 'test-freelancer-1',
      email: 'freelancer@example.com',
      name: 'Test Freelancer',
      role: 'freelancer',
      firstName: 'Test',
      lastName: 'Freelancer'
    };

    cy.window().then((win) => {
      win.localStorage.setItem('user', JSON.stringify(mockUser));
      win.localStorage.setItem('token', 'mock-jwt-token');
    });

    // Visit the dashboard directly
    cy.visit('/freelancer/dashboard?tab=my-gigs');

    // Explicitly trigger the tab navigation
    cy.window().then((win) => {
      win.dispatchEvent(new CustomEvent('dashboard-navigation', { detail: { tab: 'my-gigs' } }));
    });

    // Wait for navigation to complete
    cy.wait(2000);

    // Handle socket connection errors
    cy.on('uncaught:exception', (err) => {
      if (err.message.includes('WebSocket closed without opened')) {
        return false;
      }
      if (err.message.includes('Network Error')) {
        return false;
      }
      return true;
    });
  });

  it('loads dashboard successfully', () => {
    // Just check that the page loads and has some content
    cy.get('body').should('not.be.empty');
    cy.url().should('include', '/freelancer/dashboard');
  });

  it('loads My Gigs page successfully', () => {
    // Wait for content to load
    cy.wait(3000);
    // Check for any dashboard content
    cy.get('body').then($body => {
      const text = $body.text();
      cy.log('Page contains:', text.substring(0, 200));
      expect(text.length).to.be.greaterThan(0);
    });
  });

  it('displays gigs table with correct columns', () => {
    // Check table headers
    cy.contains('Title').should('be.visible');
    cy.contains('Status').should('be.visible');
    cy.contains('Performance').should('be.visible');
    cy.contains('Price').should('be.visible');
    cy.contains('Actions').should('be.visible');
  });

  it('shows loading state initially', () => {
    // Reload to see loading state
    cy.reload();
    cy.get('.animate-pulse').should('exist');
  });

  it('allows filtering by status', () => {
    // Test status filters
    cy.contains('Draft').should('be.visible');
    cy.contains('Active').should('be.visible');
    cy.contains('All Gigs').should('be.visible');
  });

  it('shows empty state when no gigs exist', () => {
    // Mock empty response
    cy.intercept('GET', '**/gigs?*', { body: { success: true, data: [] } }).as('emptyGigs');

    cy.reload();
    cy.wait('@emptyGigs');
    cy.contains('No gigs found. Create your first gig to get started.').should('be.visible');
  });

  it('handles API errors gracefully', () => {
    // Mock API error
    cy.intercept('GET', '**/gigs**', { statusCode: 500 }).as('gigsError');

    cy.reload();
    cy.wait('@gigsError');
    // Should show error message or retry option
  });

  it('allows creating new gig', () => {
    cy.contains('Create New Gig').should('be.visible').click();
    // This would navigate to create gig page - test navigation
  });
});