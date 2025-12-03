import { describe, expect, it } from 'vitest';
import { sanitizeUserInput } from '@/brain/MonGarsBrainService';

describe('sanitizeUserInput', () => {
  it('trims and collapses whitespace', () => {
    const input = '  Bonjour    mon   gars  ';
    const output = sanitizeUserInput(input);
    expect(output).toBe('Bonjour mon gars');
  });

  it('returns empty string for whitespace-only content', () => {
    expect(sanitizeUserInput('   ')).toBe('');
  });
});
