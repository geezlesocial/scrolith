export const mockSlides = [
  {
    id: 'slide-1',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1920&q=80',
    title: 'Unlock Your Potential',
    subtitle: 'Find the best freelance jobs in tech, design, and marketing.',
    redirectUrl: '/browse-jobs',
    roleVisibility: ['guest', 'freelancer', 'employer'],
    sortOrder: 1,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    backgroundColor: '#000'
  },
  {
    id: 'slide-2',
    mediaType: 'image',
    mediaUrl: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1920&q=80',
    title: 'Hire Top Talent',
    subtitle: 'Get work done faster with our vetted network of professionals.',
    redirectUrl: '/browse',
    roleVisibility: ['guest', 'employer', 'freelancer'],
    sortOrder: 2,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    backgroundColor: '#000'
  }
];