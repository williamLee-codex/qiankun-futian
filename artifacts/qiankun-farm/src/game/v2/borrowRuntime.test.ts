import { describe, expect, it } from 'vitest';
import {
  applySuanniProtection,
  baseBorrowQuantity,
  settleBorrow,
} from './borrowRuntime';

const HOUR = 60 * 60 * 1000;
const rng = (...values: number[]) => {
  let i = 0;
  return { next: () => values[i++] ?? 0.99 };
};

describe('Farm V2 borrow settlement', () => {
  it('uses 30% ceil formula and always leaves at least one crop', () => {
    expect(baseBorrowQuantity(10)).toBe(3);
    expect(baseBorrowQuantity(4)).toBe(2);
    expect(baseBorrowQuantity(2)).toBe(1);
    expect(baseBorrowQuantity(1)).toBe(0);
  });

  it('requires fields 2-5 and exact one-hour mature protection', () => {
    const maturesAt = 1000;
    const targets = [
      { landId: 1 as const, currentQuantity: 20, maturesAt },
      { landId: 2 as const, currentQuantity: 10, maturesAt },
      { landId: 6 as const, currentQuantity: 2, maturesAt },
    ];

    expect(settleBorrow({
      targets,
      now: maturesAt + HOUR - 1,
      pets: { suanniActive: false, tingActive: false, qilinActive: false },
      rng: rng(),
    }).successful).toBe(false);

    const result = settleBorrow({
      targets,
      now: maturesAt + HOUR,
      pets: { suanniActive: false, tingActive: false, qilinActive: false },
      rng: rng(),
    });
    expect(result.fields.map((x) => x.landId)).toEqual([2]);
    expect(result.totalBorrowed).toBe(3);
  });

  it('applies Suanni 30% protection after calculating base quantity', () => {
    expect(applySuanniProtection(3, true)).toBe(2);
    expect(applySuanniProtection(2, true)).toBe(1);
    expect(applySuanniProtection(1, true)).toBe(0);

    const result = settleBorrow({
      targets: [{ landId: 2, currentQuantity: 10, maturesAt: 0 }],
      now: HOUR,
      pets: { suanniActive: true, tingActive: false, qilinActive: false },
      rng: rng(),
    });
    expect(result.totalBorrowed).toBe(2);
    expect(result.fields[0].remainingQuantity).toBe(8);
  });

  it('lets Qilin independently block each attempted target at 50%', () => {
    const result = settleBorrow({
      targets: [
        { landId: 2, currentQuantity: 10, maturesAt: 0 },
        { landId: 3, currentQuantity: 6, maturesAt: 0 },
      ],
      now: HOUR,
      pets: { suanniActive: false, tingActive: true, qilinActive: true },
      // Ting succeeds; field2 Qilin blocks; field3 Qilin does not.
      rng: rng(0.1, 0.2, 0.8),
    });
    expect(result.fields).toHaveLength(2);
    expect(result.fields[0].blockedByQilin).toBe(true);
    expect(result.fields[1].blockedByQilin).toBe(false);
    expect(result.fields[1].borrowedQuantity).toBe(2);
    expect(result.successful).toBe(true);
  });

  it('Ting can add only one different second field and the action stays one settlement', () => {
    const result = settleBorrow({
      targets: [
        { landId: 2, currentQuantity: 10, maturesAt: 0 },
        { landId: 3, currentQuantity: 6, maturesAt: 0 },
        { landId: 4, currentQuantity: 4, maturesAt: 0 },
      ],
      now: HOUR,
      pets: { suanniActive: false, tingActive: true, qilinActive: false },
      rng: rng(0.29),
    });
    expect(result.fields.map((x) => x.landId)).toEqual([2, 3]);
    expect(result.totalBorrowed).toBe(5);
  });

  it('a fully blocked attempt is not a successful borrow', () => {
    const result = settleBorrow({
      targets: [{ landId: 2, currentQuantity: 10, maturesAt: 0 }],
      now: HOUR,
      pets: { suanniActive: false, tingActive: false, qilinActive: true },
      rng: rng(0.1),
    });
    expect(result.successful).toBe(false);
    expect(result.totalBorrowed).toBe(0);
  });
});
