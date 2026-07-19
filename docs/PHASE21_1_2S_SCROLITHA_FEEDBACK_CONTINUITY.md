# Phase 21.1.2S — Scrolitha / Intelligence Continuity

Interest feedback hits existing product APIs:

- Posts: `postOptionsApi.interested` / `notInterested` → `/posts/:id/interested|not-interested` with `surface: post_interest_survey`
- Scroll: `ScrollService.interested` / `notInterested` with `surface: scroll_interest_survey`

These feed the **existing** preference/intelligence fabric (not a new ML engine). Scrolitha may consume preferences **indirectly** through that fabric — do not claim direct audio/transcript training. Passive signals (view duration, engagement) remain separate and complementary.
