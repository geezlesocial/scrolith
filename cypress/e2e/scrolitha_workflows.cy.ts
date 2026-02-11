describe('Scrolitha Workflows (Starter)', () => {
  const bootstrapUser = (role: 'freelancer' | 'employer' | 'admin') => {
    cy.intercept('GET', '**/auth/me', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          id: role === 'admin' ? 'admin_1' : 'user_1',
          email: `${role}@example.com`,
          name: role,
          username: role,
          role
        }
      }
    }).as('authMe');

    cy.visit(role === 'admin' ? '/admin/dashboard' : '/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('token', 'test-token');
        win.localStorage.setItem(
          'user',
          JSON.stringify({
            id: role === 'admin' ? 'admin_1' : 'user_1',
            email: `${role}@example.com`,
            name: role,
            username: role,
            role
          })
        );
      }
    });
  };

  it('1) opens Ask Scrolitha widget on member_home', () => {
    bootstrapUser('freelancer');
    cy.contains('button', 'Ask Scrolitha').should('be.visible').click();
    cy.contains('Scrolitha Assistant').should('be.visible');
  });

  it('2) create gig via Scrolitha chat + execute', () => {
    bootstrapUser('freelancer');
    cy.intercept('POST', '**/scrolitha/chat', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          conversationId: 'c_1',
          reply: 'I prepared one action: Create a gig draft.',
          suggestedActions: [
            {
              actionId: 'plan_create_gig',
              actionKey: 'create_gig',
              toolKey: 'CREATE_GIG',
              summary: 'Create a gig draft.',
              requiresConfirmation: true,
              paramsPreview: {}
            }
          ],
          needsConfirmation: true
        }
      }
    }).as('chatCreateGig');

    cy.intercept('POST', '**/scrolitha/execute', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          success: true,
          result: { gigId: 'gig_1', status: 'draft' },
          emittedEvents: ['scrolitha:action_completed', 'gigs:status_updated'],
          deepLink: '/freelancer/dashboard?tab=gigs'
        }
      }
    }).as('executeGig');

    cy.contains('button', 'Ask Scrolitha').click();
    cy.get('textarea[placeholder="Ask Scrolitha..."]').type('Create gig');
    cy.contains('button', 'Send').click();
    cy.wait('@chatCreateGig');
    cy.contains('button', 'Execute').click();
    cy.wait('@executeGig');
  });

  it('3) upload file via Scrolitha flow', () => {
    bootstrapUser('freelancer');

    cy.intercept('POST', '**/files/upload', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          id: 'file_1',
          name: 'sample.txt',
          mimeType: 'text/plain',
          type: 'document',
          size: 10,
          url: 'https://cdn.local/file_1'
        }
      }
    }).as('uploadFile');

    cy.intercept('POST', '**/scrolitha/chat', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          conversationId: 'c_2',
          reply: 'I prepared one action: Bind a file from Uploaded Files.',
          suggestedActions: [
            {
              actionId: 'plan_bind_file',
              actionKey: 'upload_file_to_library',
              toolKey: 'UPLOAD_FILE_TO_LIBRARY',
              summary: 'Bind a file from Uploaded Files.',
              requiresConfirmation: true,
              paramsPreview: {}
            }
          ],
          needsConfirmation: true
        }
      }
    }).as('chatBindFile');

    cy.intercept('POST', '**/scrolitha/execute', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          success: true,
          result: { fileId: 'file_1' },
          emittedEvents: ['scrolitha:action_completed']
        }
      }
    }).as('executeBindFile');

    cy.contains('button', 'Ask Scrolitha').click();
    cy.get('input[type="file"]').selectFile({
      contents: Cypress.Buffer.from('sample content'),
      fileName: 'sample.txt',
      mimeType: 'text/plain'
    });

    cy.wait('@uploadFile');
    cy.wait('@chatBindFile');
    cy.wait('@executeBindFile');
  });

  it('4) generate project brief quick action', () => {
    bootstrapUser('employer');
    cy.contains('button', 'Ask Scrolitha').click();
    cy.contains('button', 'Generate brief').click();
  });

  it('5) reads Scrolitha history', () => {
    bootstrapUser('freelancer');
    cy.intercept('GET', '**/scrolitha/history*', {
      statusCode: 200,
      body: {
        success: true,
        data: [
          {
            id: 'c_1',
            messages: [
              { id: 'm_1', sender: 'user', content: 'Create gig', createdAt: new Date().toISOString() },
              { id: 'm_2', sender: 'assistant', content: 'I prepared one action', createdAt: new Date().toISOString() }
            ]
          }
        ]
      }
    }).as('history');

    cy.contains('button', 'Ask Scrolitha').click();
    cy.wait('@history');
  });

  it('6) admin can open Scrolitha module tab', () => {
    bootstrapUser('admin');
    cy.contains('button', 'Scrolitha').click();
    cy.contains('Scrolitha').should('exist');
  });

  it('7) admin updates Scrolitha policies', () => {
    bootstrapUser('admin');
    cy.intercept('GET', '**/admin/scrolitha/config*', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          scope: 'admin',
          enabled: true,
          safeMode: false,
          requireConfirmationByDefault: true,
          lowRiskAutoExecute: false,
          denyListedTools: [],
          promptBlocklist: [],
          userRateLimitPerMinute: 30,
          adminActionCapPerMinute: 10
        }
      }
    }).as('getConfig');
    cy.intercept('PUT', '**/admin/scrolitha/config', { statusCode: 200, body: { success: true, data: { scope: 'admin', enabled: true } } }).as('saveConfig');

    cy.contains('button', 'Scrolitha').click();
    cy.contains('button', 'Policies & Security').click();
    cy.wait('@getConfig');
    cy.contains('button', 'Save Policies').click();
    cy.wait('@saveConfig');
  });

  it('8) admin approves application via Scrolitha with confirmation', () => {
    bootstrapUser('admin');
    cy.intercept('POST', '**/admin/scrolitha/chat', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          conversationId: 'c_admin',
          reply: 'I prepared one action: Review a monetization application.',
          suggestedActions: [
            {
              actionId: 'plan_app_review',
              actionKey: 'review_monetization_application',
              toolKey: 'REVIEW_MONETIZATION_APPLICATION',
              summary: 'Review a monetization application.',
              requiresConfirmation: true,
              paramsPreview: {}
            }
          ],
          needsConfirmation: true
        }
      }
    }).as('adminChat');

    cy.intercept('POST', '**/admin/scrolitha/execute', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          success: true,
          result: { id: 'app_1', status: 'APPROVED' },
          emittedEvents: ['scrolitha:action_completed', 'notifications:new']
        }
      }
    }).as('adminExecute');

    cy.contains('button', 'Scrolitha').click();
    cy.contains('button', 'Console').click();
    cy.get('textarea[placeholder*="Approve monetization application"]').type('Approve monetization application app_1');
    cy.contains('button', 'Send').click();
    cy.wait('@adminChat');

    cy.get('textarea[placeholder*="Optional params JSON"]').first().type('{"applicationId":"app_1","decision":"approve"}');
    cy.contains('button', 'Execute').click();
    cy.wait('@adminExecute');
  });

  it('9) permission denied for admin tool from non-admin user', () => {
    bootstrapUser('freelancer');
    cy.intercept('POST', '**/scrolitha/execute', {
      statusCode: 400,
      body: {
        success: false,
        message: 'Scrolitha execution failed',
        error: 'Tool scope mismatch.'
      }
    }).as('executeDenied');

    cy.request({
      method: 'POST',
      url: '/api/scrolitha/execute',
      failOnStatusCode: false,
      body: {
        actionId: 'admin_only_action',
        confirmed: true,
        params: {}
      }
    }).its('status').should('eq', 400);
    cy.wait('@executeDenied');
  });

  it('10) admin audit and analytics load from Scrolitha tab', () => {
    bootstrapUser('admin');
    cy.intercept('GET', '**/admin/scrolitha/audit*', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          items: [
            {
              id: 'audit_1',
              eventType: 'action_executed',
              toolKey: 'CREATE_GIG',
              resultStatus: 'ok',
              actorId: 'admin_1',
              actorRole: 'admin',
              createdAt: new Date().toISOString(),
              resultSummary: 'Completed.'
            }
          ],
          nextCursor: null
        }
      }
    }).as('audit');

    cy.intercept('GET', '**/admin/scrolitha/analytics*', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          totals: {
            conversations: 5,
            actions: 10,
            failureRate: 0,
            avgRating: 4.5,
            feedbackCount: 3,
            estimatedMinutesSaved: 20
          },
          topTools: [{ toolKey: 'CREATE_GIG', count: 3 }]
        }
      }
    }).as('analytics');

    cy.contains('button', 'Scrolitha').click();
    cy.contains('button', 'Audit Logs').click();
    cy.wait('@audit');
    cy.contains('button', 'Analytics').click();
    cy.wait('@analytics');
  });
});
