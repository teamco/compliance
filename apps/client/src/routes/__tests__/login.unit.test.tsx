import { describe, it, expect } from 'vitest';
import { isSafeReturnTo } from '../login';

describe('isSafeReturnTo', () => {
  it('accepts a same-origin relative path', () => {
    expect(isSafeReturnTo('/accept-invite?token=abc')).toBe(true);
  });

  it('accepts the root path', () => {
    expect(isSafeReturnTo('/')).toBe(true);
  });

  it('rejects a protocol-relative path', () => {
    expect(isSafeReturnTo('//evil.com')).toBe(false);
  });

  it('rejects a backslash trick', () => {
    expect(isSafeReturnTo('/\\evil.com')).toBe(false);
  });

  it('rejects an absolute URL', () => {
    expect(isSafeReturnTo('https://evil.com')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isSafeReturnTo('')).toBe(false);
  });
});
