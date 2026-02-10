export const executeRecaptcha = async (siteKey: string, action: string): Promise<string> => {
  const key = (siteKey || '').trim();
  if (!key) {
    throw new Error('reCAPTCHA site key is missing.');
  }

  const grecaptcha = (window as any)?.grecaptcha;
  if (!grecaptcha || typeof grecaptcha.execute !== 'function') {
    throw new Error('reCAPTCHA is not ready. Please try again.');
  }

  return new Promise((resolve, reject) => {
    try {
      grecaptcha.ready(async () => {
        try {
          const token = await grecaptcha.execute(key, { action });
          resolve(token);
        } catch (err: any) {
          reject(err);
        }
      });
    } catch (err: any) {
      reject(err);
    }
  });
};
