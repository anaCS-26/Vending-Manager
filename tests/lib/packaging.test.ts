import { describe, it, expect } from 'vitest';
import {
  boxPriceFromPieceCost,
  boxSize,
  checkReceivedBoxes,
  costPerPiece,
  describeInBoxes,
  describePackaging,
  describeReceivedLine,
  formatPieceSize,
  parsePackaging,
  piecesFromBoxes,
  splitIntoBoxes,
} from '@/lib/packaging';

describe('boxSize', () => {
  it('uses the box size when there is one', () => {
    expect(boxSize(24)).toBe(24);
  });

  it('treats a missing or nonsense box as a box of one, so callers can always multiply', () => {
    expect(boxSize(null)).toBe(1);
    expect(boxSize(undefined)).toBe(1);
    expect(boxSize(0)).toBe(1);
    expect(boxSize(-6)).toBe(1);
    expect(boxSize(2.5)).toBe(1);
  });
});

describe('piecesFromBoxes / splitIntoBoxes', () => {
  it('multiplies boxes out to pieces, loose pieces on top', () => {
    expect(piecesFromBoxes(10, 24)).toBe(240);
    expect(piecesFromBoxes(41, 24, 16)).toBe(1000);
  });

  // The client's own example: the same biscuit arrives as a 24 one week, a 20 the next.
  it('counts the same number of boxes differently when the box size changes', () => {
    expect(piecesFromBoxes(10, 24)).toBe(240);
    expect(piecesFromBoxes(10, 20)).toBe(200);
  });

  it('counts an item with no box piece by piece', () => {
    expect(piecesFromBoxes(37, null)).toBe(37);
  });

  it('never produces negative or fractional pieces', () => {
    expect(piecesFromBoxes(-3, 24, -1)).toBe(0);
    expect(piecesFromBoxes(2.9, 10, 1.5)).toBe(21);
  });

  it('splits pieces into whole boxes and what is left over', () => {
    expect(splitIntoBoxes(1000, 24)).toEqual({ boxes: 41, loose: 16 });
    expect(splitIntoBoxes(240, 24)).toEqual({ boxes: 10, loose: 0 });
    expect(splitIntoBoxes(5, null)).toEqual({ boxes: 5, loose: 0 });
    expect(splitIntoBoxes(0, 24)).toEqual({ boxes: 0, loose: 0 });
  });

  it('round-trips', () => {
    for (const pieces of [0, 1, 23, 24, 25, 999, 1000]) {
      const { boxes, loose } = splitIntoBoxes(pieces, 24);
      expect(piecesFromBoxes(boxes, 24, loose)).toBe(pieces);
    }
  });
});

describe('costPerPiece / boxPriceFromPieceCost', () => {
  it('divides the invoice box price into a per-piece cost', () => {
    // Pepsi on the Nahla Al Wadi invoice: 45.22 for a box of 30 cans.
    expect(costPerPiece(45.22, 30)).toBeCloseTo(1.5073, 4);
  });

  // The production bug this exists to stop: a 31 SAR box of 40 waters went in
  // as the cost of ONE bottle.
  it('makes a box of water cost what one bottle costs', () => {
    expect(costPerPiece(31, 40)).toBeCloseTo(0.775, 6);
  });

  it('is the price itself for an item with no box, and zero for no price', () => {
    expect(costPerPiece(2.5, null)).toBe(2.5);
    expect(costPerPiece(0, 24)).toBe(0);
    expect(costPerPiece(Number.NaN, 24)).toBe(0);
  });

  it('pre-fills a box price rounded to the halala', () => {
    expect(boxPriceFromPieceCost(1.98, 24)).toBe(47.52);
    expect(boxPriceFromPieceCost(1.0073, 12)).toBe(12.09);
    expect(boxPriceFromPieceCost(0, 24)).toBe(0);
  });
});

describe('describing packaging', () => {
  it('formats the size of one piece', () => {
    expect(formatPieceSize(50, 'g')).toBe('50 g');
    expect(formatPieceSize(36.8, 'g')).toBe('36.8 g');
    expect(formatPieceSize(320, 'ml')).toBe('320 ml');
    expect(formatPieceSize(null, 'g')).toBeNull();
    expect(formatPieceSize(50, null)).toBeNull();
  });

  it('reads the way the client writes it', () => {
    expect(describePackaging({ pieces_per_box: 24, piece_size: 50, piece_size_unit: 'g' })).toBe('Box of 24 × 50 g');
    expect(describePackaging({ pieces_per_box: 24, piece_size: null, piece_size_unit: null })).toBe('Box of 24');
    expect(describePackaging({ pieces_per_box: null, piece_size: 320, piece_size_unit: 'ml' })).toBe('320 ml');
  });

  it('says nothing about a box of one, or about nothing', () => {
    expect(describePackaging({ pieces_per_box: 1, piece_size: null, piece_size_unit: null })).toBeNull();
    expect(describePackaging({ pieces_per_box: null, piece_size: null, piece_size_unit: null })).toBeNull();
    expect(describePackaging(null)).toBeNull();
  });

  it('shows a piece count as boxes', () => {
    expect(describeInBoxes(1000, 24)).toBe('41 boxes + 16 pcs');
    expect(describeInBoxes(24, 24)).toBe('1 box');
    expect(describeInBoxes(25, 24)).toBe('1 box + 1 pc');
    expect(describeInBoxes(5, 24)).toBe('5 pcs');
    expect(describeInBoxes(0, 24)).toBe('0 boxes');
    expect(describeInBoxes(40, null)).toBeNull();
  });

  it('describes how a received line was counted', () => {
    expect(describeReceivedLine({ quantityReceived: 200, boxesReceived: 10, piecesPerBox: 20 })).toBe('10 boxes of 20');
    expect(describeReceivedLine({ quantityReceived: 243, boxesReceived: 10, piecesPerBox: 24 })).toBe('10 boxes of 24 + 3 pcs');
    // Received before box counting existed, or counted in pieces.
    expect(describeReceivedLine({ quantityReceived: 100, boxesReceived: null, piecesPerBox: null })).toBeNull();
    expect(describeReceivedLine({ quantityReceived: 100, boxesReceived: 100, piecesPerBox: 1 })).toBeNull();
  });
});

describe('parsePackaging', () => {
  it('stores a cleared field as "not set", never as a box of nothing', () => {
    expect(parsePackaging({ pieces_per_box: 0, piece_size: 0, piece_size_unit: 'g' })).toEqual({
      ok: true,
      value: { pieces_per_box: null, piece_size: null, piece_size_unit: null },
    });
    expect(parsePackaging({})).toEqual({
      ok: true,
      value: { pieces_per_box: null, piece_size: null, piece_size_unit: null },
    });
  });

  it('accepts a real box and size', () => {
    expect(parsePackaging({ pieces_per_box: 24, piece_size: 36.8, piece_size_unit: 'g' })).toEqual({
      ok: true,
      value: { pieces_per_box: 24, piece_size: 36.8, piece_size_unit: 'g' },
    });
  });

  it.each([
    ['a fractional box', { pieces_per_box: 2.5 }],
    ['a negative box', { pieces_per_box: -24 }],
    ['an absurd box', { pieces_per_box: 5000 }],
    ['a negative size', { piece_size: -50, piece_size_unit: 'g' }],
    ['a size with no unit', { piece_size: 50, piece_size_unit: null }],
    ['a made-up unit', { piece_size: 50, piece_size_unit: 'oz' }],
    ['NaN', { pieces_per_box: Number.NaN }],
  ])('rejects %s', (_label, input) => {
    expect(parsePackaging(input).ok).toBe(false);
  });
});

describe('checkReceivedBoxes', () => {
  it('accepts a line with no box breakdown (sent by an older client)', () => {
    expect(checkReceivedBoxes({ quantityReceived: 100 })).toBeNull();
  });

  it('accepts boxes that account for the pieces, with loose pieces on top', () => {
    expect(checkReceivedBoxes({ quantityReceived: 240, boxesReceived: 10, piecesPerBox: 24 })).toBeNull();
    expect(checkReceivedBoxes({ quantityReceived: 243, boxesReceived: 10, piecesPerBox: 24 })).toBeNull();
  });

  it.each([
    ['boxes without a box size', { quantityReceived: 240, boxesReceived: 10, piecesPerBox: null }],
    ['a box size without boxes', { quantityReceived: 240, boxesReceived: null, piecesPerBox: 24 }],
    ['a box of zero', { quantityReceived: 0, boxesReceived: 10, piecesPerBox: 0 }],
    ['negative boxes', { quantityReceived: 0, boxesReceived: -1, piecesPerBox: 24 }],
    ['boxes worth more than was received', { quantityReceived: 200, boxesReceived: 10, piecesPerBox: 24 }],
  ])('rejects %s', (_label, line) => {
    expect(checkReceivedBoxes(line)).toMatch(/./);
  });
});
