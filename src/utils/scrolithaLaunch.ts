export const SCROLITHA_OPEN_QUERY_PARAM = 'scrolitha';
export const SCROLITHA_PROMPT_QUERY_PARAM = 'scrolitha_prompt';

const splitPathAndSearch = (inputPath: string) => {
  const source = String(inputPath || '/').trim() || '/';
  const [pathname, search = ''] = source.split('?', 2);
  return {
    pathname: pathname || '/',
    params: new URLSearchParams(search)
  };
};

export const buildScrolithaPath = (basePath: string, prompt?: string) => {
  const { pathname, params } = splitPathAndSearch(basePath);
  params.set(SCROLITHA_OPEN_QUERY_PARAM, 'open');
  const nextPrompt = String(prompt || '').trim();
  if (nextPrompt) {
    params.set(SCROLITHA_PROMPT_QUERY_PARAM, nextPrompt);
  } else {
    params.delete(SCROLITHA_PROMPT_QUERY_PARAM);
  }
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}`;
};

export const readScrolithaLaunchParams = (search: string) => {
  const params = new URLSearchParams(search);
  const shouldOpen = params.get(SCROLITHA_OPEN_QUERY_PARAM) === 'open';
  const prompt = String(params.get(SCROLITHA_PROMPT_QUERY_PARAM) || '').trim();
  return {
    shouldOpen,
    prompt
  };
};

export const clearScrolithaLaunchParams = (search: string) => {
  const params = new URLSearchParams(search);
  params.delete(SCROLITHA_OPEN_QUERY_PARAM);
  params.delete(SCROLITHA_PROMPT_QUERY_PARAM);
  const query = params.toString();
  return query ? `?${query}` : '';
};
