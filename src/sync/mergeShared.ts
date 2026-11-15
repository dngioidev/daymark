import { canonicalJson } from '../utils/canonicalJson';

export const sameValue = (a: unknown, b: unknown): boolean => canonicalJson(a ?? null) === canonicalJson(b ?? null);

export const CONFLICT_SEPARATOR = '\n\n---\n*Edited on another device at the same time:*\n\n';
