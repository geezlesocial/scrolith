import { Gig, Job, ListingCategory, Plan, UploadedFile } from '../types';
import { mockGigs, mockJobs, mockCategories, mockPlans } from './mockData';

class Database {
  private gigs: Gig[] = [...mockGigs];
  private jobs: Job[] = [...mockJobs];
  private categories: ListingCategory[] = [...mockCategories];
  private plans: Plan[] = [...mockPlans];
  private files: UploadedFile[] = [];

  // Gigs
  getGigs(): Gig[] {
    return [...this.gigs];
  }

  getGigById(id: string): Gig | undefined {
    return this.gigs.find(g => g.id === id);
  }

  saveGig(gig: Gig): Gig {
    const index = this.gigs.findIndex(g => g.id === gig.id);
    if (index >= 0) {
      this.gigs[index] = { ...gig, updatedAt: new Date().toISOString() };
      return this.gigs[index];
    } else {
      const newGig = {
        ...gig,
        id: gig.id || `gig-${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.gigs.push(newGig);
      return newGig;
    }
  }

  deleteGig(id: string): boolean {
    const initialLength = this.gigs.length;
    this.gigs = this.gigs.filter(g => g.id !== id);
    return this.gigs.length < initialLength;
  }

  // Jobs
  getJobs(): Job[] {
    return [...this.jobs];
  }

  getJobById(id: string): Job | undefined {
    return this.jobs.find(j => j.id === id);
  }

  saveJob(job: Job): Job {
    const index = this.jobs.findIndex(j => j.id === job.id);
    if (index >= 0) {
      this.jobs[index] = { ...job, updatedAt: new Date().toISOString() };
      return this.jobs[index];
    } else {
      const newJob = {
        ...job,
        id: job.id || `job-${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.jobs.push(newJob);
      return newJob;
    }
  }

  deleteJob(id: string): boolean {
    const initialLength = this.jobs.length;

    this.jobs = this.jobs.filter(j => j.id !== id);
    return this.jobs.length < initialLength;
  }

  // Categories
  getCategories(type?: 'gig' | 'job'): ListingCategory[] {
    if (!type) return [...this.categories];
    return this.categories.filter(c => c.type === type);
  }

  saveCategory(category: ListingCategory): ListingCategory {
    const index = this.categories.findIndex(c => c.id === category.id);
    if (index >= 0) {
      this.categories[index] = category;
      return this.categories[index];
    } else {
      this.categories.push(category);
      return category;
    }
  }

  deleteCategory(id: string): boolean {
    const initialLength = this.categories.length;
    this.categories = this.categories.filter(c => c.id !== id);
    return this.categories.length < initialLength;
  }

  // Plans
  getPlans(): Plan[] {
    return [...this.plans];
  }

  savePlan(plan: Plan): Plan {
    const index = this.plans.findIndex(p => p.id === plan.id);
    if (index >= 0) {
      this.plans[index] = plan;
      return this.plans[index];
    } else {
      this.plans.push(plan);
      return plan;
    }
  }

  // Files
  saveFile(file: UploadedFile): UploadedFile {
    this.files.push(file);
    return file;
  }

  getFileById(id: string): UploadedFile | undefined {
    return this.files.find(f => f.id === id);
  }

  getFiles(): UploadedFile[] {
    return [...this.files];
  }

  deleteFile(id: string): UploadedFile | null {
    const index = this.files.findIndex(f => f.id === id);
    if (index < 0) return null;
    const [removed] = this.files.splice(index, 1);
    return removed;
  }
}

export const db = new Database();
