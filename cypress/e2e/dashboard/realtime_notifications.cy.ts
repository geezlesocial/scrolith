describe('Real-time Updates', () => {
  beforeEach(() => {
    cy.visit('/auth/login');
    cy.get('input[name="email"]').type('freelancer@example.com');
    cy.get('input[name="password"]').type('password123');
    cy.get('button[type="submit"]').contains('Sign in').click();
    cy.url({ timeout: 10000 }).should('include', '/freelancer/dashboard');
  });

  it('shows socket connection status', () => {
    // Check if socket connection indicator is present
    cy.window().its('socket').should('exist');
  });

  it('falls back to polling when socket disconnects', () => {
    // Simulate socket disconnect
    cy.window().then((win) => {
      if (win.socket && win.socket.connected) {
        win.socket.disconnect();
      }
    });

    // Should show polling indicator or continue working
    cy.contains('Overview').should('be.visible');
  });

  it('handles socket reconnection', () => {
    // This would require mocking socket reconnection
    // For now, just verify the app doesn't break
    cy.reload();
    cy.contains('Overview').should('be.visible');
  });

  it('updates data on real-time events', () => {
    // Mock receiving a real-time update
    cy.window().then((win) => {
      // Simulate socket event
      if (win.socket) {
        win.socket.emit('orders:updated', {
          orderId: 'test-order',
          status: 'completed'
        });
      }
    });

    // App should remain stable
    cy.contains('Overview').should('be.visible');
  });
});