import React from 'react';
import GroupsWorkspace from './components/GroupsWorkspace';
import ProfessionalIntegrationStrip from '../components/discovery/ProfessionalIntegrationStrip';

const Clubs: React.FC = () => (
  <div className="space-y-4">
    <div className="px-3 pt-3 sm:px-4 sm:pt-4">
      <ProfessionalIntegrationStrip surface="community" />
    </div>
    <GroupsWorkspace />
  </div>
);

export default Clubs;
