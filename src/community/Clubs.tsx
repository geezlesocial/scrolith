import React from 'react';
import GroupsWorkspace from './components/GroupsWorkspace';
import ProfessionalIntegrationStrip from '../components/discovery/ProfessionalIntegrationStrip';

/**
 * Phase 24 — Groups/communities discovery surface under /community/clubs.
 */
const Clubs: React.FC = () => (
  <div className="min-w-0 space-y-3 overflow-x-hidden sm:space-y-4" data-testid="community-clubs-page">
    <div className="px-0.5 sm:px-1">
      <ProfessionalIntegrationStrip surface="community" />
    </div>
    <GroupsWorkspace />
  </div>
);

export default Clubs;
