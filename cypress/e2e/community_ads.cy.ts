describe('Community Ads end-to-end flow', () => {
  const apiUrl = (Cypress.env('apiUrl') || 'http://localhost:5000/api').replace(/\/$/, '');

  it('creates an ad, pays, triggers reconciliation, and observes PAID status', () => {
    // Create draft (dev auth via x-dev-role header)
    cy.request({
      method: 'POST',
      url: `${apiUrl}/community/ads/draft`,
      headers: { 'x-dev-role': 'freelancer' },
      body: { title: 'Cypress Ad', body: 'Buy now', placement: 'feed', budget: 5 }
    }).then((resp) => {
      expect(resp.status).to.eq(200);
      const ad = resp.body.data;
      expect(ad).to.have.property('id');
      const adId = ad.id;

      // Call pay endpoint
      cy.request({
        method: 'POST',
        url: `${apiUrl}/community/ads/${adId}/pay`,
        headers: { 'x-dev-role': 'freelancer' }
      }).then((payResp) => {
        expect(payResp.status).to.eq(200);
        expect(payResp.body.success).to.eq(true);
        const piId = payResp.body.data.paymentIntentId;
        expect(piId).to.be.a('string');

        // Trigger admin reconciliation
        cy.request({
          method: 'POST',
          url: `${apiUrl}/payments/reconcile-adpayments`,
          headers: { 'x-dev-role': 'admin' }
        }).then((recResp) => {
          expect(recResp.status).to.eq(200);

          // Verify ad status via getMyAds (dev user is freelancer)
          cy.request({
            method: 'GET',
            url: `${apiUrl}/community/ads/me`,
            headers: { 'x-dev-role': 'freelancer' }
          }).then((myAds) => {
            expect(myAds.status).to.eq(200);
            const ads = myAds.body.data;
            const found = ads.find((a: any) => a.id === adId);
            expect(found).to.exist;
            expect(['PAID', 'SUBMITTED_FOR_REVIEW', 'ACTIVE', 'AWAITING_PAYMENT']).to.include(found.status);
            // prefer PAID after reconciliation
            expect(found.status).to.eq('PAID');
          });
        });
      });
    });
  });
});
