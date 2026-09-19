import path from 'node:path';

export const isPathWithin = (root: string, candidate: string): boolean => {
  const rootPath = path.resolve(root);
  const candidatePath = path.resolve(candidate);
  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}${path.sep}`);
};

export const requirePathWithin = (root: string, candidate: string): string => {
  const resolved = path.resolve(candidate);
  if (!isPathWithin(root, resolved)) throw new Error('Path is outside the approved directory');
  return resolved;
};
