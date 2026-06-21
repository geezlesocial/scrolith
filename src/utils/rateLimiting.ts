// GLOBAL RATE LIMITING CONSTANTS (SHARED across ALL services)
let lastAPICallTime = 0;
let lastAuthCallTime = 0;
let lastCMSCallTime = 0;
let lastSearchCallTime = 0;

// Queues to manage concurrent requests
const apiQueue: (() => Promise<void>)[] = [];
const authQueue: (() => Promise<void>)[] = [];
const cmsQueue: (() => Promise<void>)[] = [];
const searchQueue: (() => Promise<void>)[] = [];

let isProcessingAPI = false;
let isProcessingAuth = false;
let isProcessingCMS = false;
let isProcessingSearch = false;

export const MIN_DELAY = 450;
export const MIN_AUTH_DELAY = 500;
export const MIN_CMS_DELAY = 350;
export const MIN_SEARCH_DELAY = 400;

const processQueue = async (queue: (() => Promise<void>)[], isProcessingRef: { value: boolean }) => {
  if (isProcessingRef.value || queue.length === 0) return;

  isProcessingRef.value = true;
  const request = queue.shift();
  if (request) {
    await request();
  }
  isProcessingRef.value = false;

  // Process next in queue
  setTimeout(() => processQueue(queue, isProcessingRef), 0);
};

const addToQueue = (queue: (() => Promise<void>)[], request: () => Promise<void>, isProcessingRef: { value: boolean }) => {
  queue.push(request);
  processQueue(queue, isProcessingRef);
};

// Global API Rate Limit
export const getGlobalRateLimit = async () => {
  return new Promise<void>((resolve) => {
    const request = async () => {
      const now = Date.now();
      const timeSinceLast = now - lastAPICallTime;
      const delay = Math.max(0, MIN_DELAY - timeSinceLast);
      if (delay > 0) await new Promise(res => setTimeout(res, delay));
      lastAPICallTime = Date.now();
      resolve();
    };
    addToQueue(apiQueue, request, { value: isProcessingAPI });
  });
};

// Auth Rate Limit
export const getAuthRateLimit = async () => {
  return new Promise<void>((resolve) => {
    const request = async () => {
      const now = Date.now();
      const timeSinceLast = now - lastAuthCallTime;
      const delay = Math.max(0, MIN_AUTH_DELAY - timeSinceLast);
      if (delay > 0) await new Promise(res => setTimeout(res, delay));
      lastAuthCallTime = Date.now();
      resolve();
    };
    addToQueue(authQueue, request, { value: isProcessingAuth });
  });
};

// CMS Rate Limit
export const getCMSRateLimit = async () => {
  return new Promise<void>((resolve) => {
    const request = async () => {
      const now = Date.now();
      const timeSinceLast = now - lastCMSCallTime;
      const delay = Math.max(0, MIN_CMS_DELAY - timeSinceLast);
      if (delay > 0) await new Promise(res => setTimeout(res, delay));
      lastCMSCallTime = Date.now();
      resolve();
    };
    addToQueue(cmsQueue, request, { value: isProcessingCMS });
  });
};

// Search Rate Limit
export const getSearchRateLimit = async () => {
  return new Promise<void>((resolve) => {
    const request = async () => {
      const now = Date.now();
      const timeSinceLast = now - lastSearchCallTime;
      const delay = Math.max(0, MIN_SEARCH_DELAY - timeSinceLast);
      if (delay > 0) await new Promise(res => setTimeout(res, delay));
      lastSearchCallTime = Date.now();
      resolve();
    };
    addToQueue(searchQueue, request, { value: isProcessingSearch });
  });
};