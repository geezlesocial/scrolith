describe('Employer - My Jobs', () => {
  beforeEach(() => {
    // Login as employer
    cy.visit('/auth/login');
    cy.get('input[name="email"]').type('employer@example.com');
    cy.get('input[name="password"]').type('password123');
    cy.get('button[type="submit"]').contains('Sign in').click();

    // Wait for dashboard to load
    cy.url({ timeout: 10000 }).should('include', '/employer/dashboard');

    // Navigate to My Jobs
    cy.window().then((win) => {
      win.dispatchEvent(new CustomEvent('dashboard-navigation', { detail: { tab: 'my-jobs' } }));
    });
  });

  it('loads My Jobs page successfully', () => {
    cy.contains('My Job Posts').should('be.visible');
    cy.contains('Create, manage, and track applications in real time').should('be.visible');
  });

  it('displays jobs table with correct columns', () => {
    // Check table headers
    cy.contains('Title').should('be.visible');
    cy.contains('Budget').should('be.visible');
    cy.contains('Proposals').should('be.visible');
    cy.contains('Status').should('be.visible');
    cy.contains('Posted').should('be.visible');
    cy.contains('Actions').should('be.visible');
  });

  it('shows loading state initially', () => {
    // Reload to see loading state
    cy.reload();
    cy.get('.animate-pulse').should('exist');
  });

  it('allows filtering by status', () => {
    // Test status filters
    cy.contains('button', 'Draft').click();
    cy.contains('button', 'Active').click();
    cy.contains('button', 'All').click();
  });

  it('shows empty state when no jobs exist', () => {
    // Mock empty response
    cy.intercept('GET', '**/jobs**', { jobs: [], pagination: { total: 0 } }).as('emptyJobs');

    cy.reload();
    cy.wait('@emptyJobs');
    cy.contains('No job posts yet').should('be.visible');
  });

  it('allows creating new job', () => {
    cy.contains('New Job').should('be.visible').click();
    // This would navigate to create job page - test navigation
  });

  it('handles API errors gracefully', () => {
    // Mock API error
    cy.intercept('GET', '**/jobs**', { statusCode: 500 }).as('jobsError');

    cy.reload();
    cy.wait('@jobsError');
    // Should show error message or retry option
  });
});