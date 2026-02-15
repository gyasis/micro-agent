// Simple test to verify micro-agent works
import { describe, it, expect } from 'vitest';

function add(a: number, b: number): number {
  return a + b;
}

describe('Simple Math', () => {
  it('should add two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });

  it('should add negative numbers', () => {
    expect(add(-1, -2)).toBe(-3);
  });
});
