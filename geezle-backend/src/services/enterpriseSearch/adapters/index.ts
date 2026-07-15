import type { SearchDomain } from '../contracts/types';
import type { SearchDomainAdapter } from './types';
import { peopleAdapter } from './people.adapter';
import { postsAdapter } from './posts.adapter';
import { pagesAdapter } from './pages.adapter';
import { companiesAdapter } from './companies.adapter';
import { jobsAdapter } from './jobs.adapter';
import { servicesAdapter } from './services.adapter';
import { freelancersAdapter } from './freelancers.adapter';
import { marketplaceAdapter } from './marketplace.adapter';
import { productsAdapter } from './products.adapter';
import { communitiesAdapter } from './communities.adapter';
import { groupsAdapter } from './groups.adapter';
import { discussionsAdapter } from './discussions.adapter';

const registry = new Map<SearchDomain, SearchDomainAdapter>([
  [peopleAdapter.domain, peopleAdapter],
  [postsAdapter.domain, postsAdapter],
  [pagesAdapter.domain, pagesAdapter],
  [companiesAdapter.domain, companiesAdapter],
  [jobsAdapter.domain, jobsAdapter],
  [servicesAdapter.domain, servicesAdapter],
  [freelancersAdapter.domain, freelancersAdapter],
  [marketplaceAdapter.domain, marketplaceAdapter],
  [productsAdapter.domain, productsAdapter],
  [communitiesAdapter.domain, communitiesAdapter],
  [groupsAdapter.domain, groupsAdapter],
  [discussionsAdapter.domain, discussionsAdapter]
]);

export const getAdapter = (domain: SearchDomain): SearchDomainAdapter | null => registry.get(domain) || null;

export const listRegisteredAdapters = (): SearchDomain[] => Array.from(registry.keys());

export const RESERVED_ADAPTER_DOMAINS: SearchDomain[] = ['event', 'course', 'project'];

export type { SearchDomainAdapter, AdapterContext } from './types';
