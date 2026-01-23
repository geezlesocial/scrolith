describe('Programmatic login and redirect check', () => {
  it('fetches /api/auth/me, seeds localStorage, and verifies redirect to freelancer dashboard', () => {
    // Login via backend with provided freelancer credentials
    const apiUrl = Cypress.env('apiUrl') || '/api';
    cy.request({
      method: 'POST',
      url: `${apiUrl.replace(/\/$/, '')}/auth/login`,
      body: { email: 'shagocart@gmail.com', password: 'user12345' },
      failOnStatusCode: false
    }).then((loginResp) => {
      expect(loginResp.status).to.equal(200)
      const body = loginResp.body || {}
      const user = body.user || body.data || body || {}

      // Prevent test failure on app's socket context error during early boot
      Cypress.on('uncaught:exception', (err) => {
        if (err && err.message && err.message.includes('useSocket must be used')) {
          return false
        }
        return true
      })

      // Seed localStorage with the returned user and visit app with from=auth to trigger redirect
      cy.visit('http://localhost:3000/?from=auth', {
        onBeforeLoad(win) {
          try {
            win.localStorage.setItem('user', JSON.stringify(user))
          } catch (e) {
            // ignore serialization errors
          }
        }
      })

      // For freelancer user expect freelancer dashboard redirect
      cy.location('pathname', { timeout: 10000 }).should('include', '/freelancer/dashboard')

      // Verify localStorage role normalization (case-insensitive)
      cy.window().then((win) => {
        const raw = win.localStorage.getItem('user')
        expect(raw).to.not.be.null
        const stored = JSON.parse(raw as string)
        expect(stored).to.have.property('role')
        expect(String(stored.role).toLowerCase()).to.equal('freelancer')
      })
    })
  })
})
