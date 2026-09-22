import { describe, it, expect } from 'vitest';
import {
  boxPriceFromPieceCost,
  boxSize,
  cartonSize,
  checkReceivedBoxes,
  costPerPiece,
  describeCartonSum,
  describeCount,
  describePackaging,
  describeReceivedLine,
  formatPieceSize,
  hasCarton,
  hasPackets,
  levelsOf,
  packetsPerCartonFromPackCode,
  parsePackaging,
  piecesFromCount,
  recordCount,
  splitCount,
} from '@/lib/packaging';

// The three shapes in the live catalogue.
const SIPP = levelsOf({ pieces_per_box: 20, packets_per_carton: 8 }); // "8*20*5GM": 8 packets of 20
const WATER = levelsOf({ pieces_per_box: 40, packets_per_carton: null }); // "40*330ML": 40 bottles, no packets
const LOOSE = levelsOf({ pieces_per_box: null, packets_per_carton: null });

describe('boxSize', () => {
  it('uses the size when there is one', () => {
    expect(boxSize(24)).toBe(24);
  });

  it('treats a missing or nonsense size as one, so callers can always multiply', () => {
    expect(boxSize(null)).toBe(1);
    expect(boxSize(undefined)).toBe(1);
    expect(boxSize(0)).toBe(1);
    expect(boxSize(-6)).toBe(1);
    expect(boxSize(2.5)).toBe(1);
  });
});

describe('levelsOf', () => {
  // The report: "1 carton × 8 packets × 20 pieces = 160".
  it('multiplies packets by pieces for the carton', () => {
    expect(cartonSize(SIPP)).toBe(160);
    expect(hasPackets(SIPP)).toBe(true);
  });

  it('makes the carton the only pack when there are no packets', () => {
    expect(cartonSize(WATER)).toBe(40);
    expect(hasCarton(WATER)).toBe(true);
    expect(hasPackets(WATER)).toBe(false);
  });

  it('has no carton for a loose item, and ignores packets of nothing', () => {
    expect(hasCarton(LOOSE)).toBe(false);
    expect(levelsOf({ pieces_per_box: null, packets_per_carton: 8 })).toEqual({ perPacket: 1, packetsPerCarton: 1 });
    expect(levelsOf(null)).toEqual({ perPacket: 1, packetsPerCarton: 1 });
  });
});

describe('piecesFromCount / splitCount', () => {
  it('multiplies cartons and packets out to pieces, loose pieces on top', () => {
    expect(piecesFromCount({ cartons: 1, packets: 0, pieces: 0 }, SIPP)).toBe(160);
    expect(piecesFromCount({ cartons: 2, packets: 3, pieces: 5 }, SIPP)).toBe(385);
    expect(piecesFromCount({ cartons: 22, pieces: 20 }, WATER)).toBe(900);
  });

  // The client's own example: the same biscuit arrives as a 24 one week, a 20 the next.
  it('counts the same cartons differently when this delivery is packed differently', () => {
    expect(piecesFromCount({ cartons: 10 }, levelsOf({ pieces_per_box: 24 }))).toBe(240);
    expect(piecesFromCount({ cartons: 10 }, levelsOf({ pieces_per_box: 20 }))).toBe(200);
  });

  it('only counts packets when the item has them', () => {
    expect(piecesFromCount({ cartons: 1, packets: 3 }, WATER)).toBe(40);
  });

  it('counts a loose item piece by piece', () => {
    expect(piecesFromCount({ cartons: 5, pieces: 37 }, LOOSE)).toBe(37);
  });

  it('never produces negative or fractional pieces', () => {
    expect(piecesFromCount({ cartons: -3, packets: -1, pieces: -1 }, SIPP)).toBe(0);
    expect(piecesFromCount({ cartons: 1.9, packets: 1.5, pieces: 2.5 }, SIPP)).toBe(182);
  });

  it('splits pieces into whole cartons, then packets, then what is left', () => {
    expect(splitCount(3384, SIPP)).toEqual({ cartons: 21, packets: 1, pieces: 4 });
    expect(splitCount(900, WATER)).toEqual({ cartons: 22, packets: 0, pieces: 20 });
    expect(splitCount(5, LOOSE)).toEqual({ cartons: 0, packets: 0, pieces: 5 });
    expect(splitCount(0, SIPP)).toEqual({ cartons: 0, packets: 0, pieces: 0 });
  });

  it('round-trips', () => {
    for (const pieces of [0, 1, 19, 20, 159, 160, 161, 999, 3384]) {
      expect(piecesFromCount(splitCount(pieces, SIPP), SIPP)).toBe(pieces);
      expect(piecesFromCount(splitCount(pieces, WATER), WATER)).toBe(pieces);
    }
  });
});

describe('recordCount', () => {
  it('stores packets and whole cartons for an item with packets', () => {
    // 2 cartons of 8 + 3 packets = 19 full packets, 16 of them in cartons.
    expect(recordCount({ cartons: 2, packets: 3, pieces: 5 }, SIPP)).toEqual({
      boxesReceived: 19, piecesPerBox: 20, cartonsReceived: 2, packetsPerCarton: 8,
    });
  });

  it('stores cartons as the pack for an item without packets', () => {
    expect(recordCount({ cartons: 22, pieces: 20 }, WATER)).toEqual({
      boxesReceived: 22, piecesPerBox: 40, cartonsReceived: null, packetsPerCarton: null,
    });
  });

  it('records nothing for a loose item', () => {
    expect(recordCount({ pieces: 30 }, LOOSE)).toEqual({
      boxesReceived: null, piecesPerBox: null, cartonsReceived: null, packetsPerCarton: null,
    });
  });

  it('always passes the server check for what it produces', () => {
    for (const [count, l] of [[{ cartons: 2, packets: 3, pieces: 5 }, SIPP], [{ cartons: 22, pieces: 20 }, WATER], [{ pieces: 30 }, LOOSE]] as const) {
      expect(checkReceivedBoxes({ quantityReceived: piecesFromCount(count, l), ...recordCount(count, l) })).toBeNull();
    }
  });
});

describe('costPerPiece / boxPriceFromPieceCost', () => {
  it('divides the invoice carton price into a per-piece cost', () => {
    // Pepsi on the Nahla Al Wadi invoice: 45.22 for a carton of 30 cans.
    expect(costPerPiece(45.22, 30)).toBeCloseTo(1.5073, 4);
    expect(costPerPiece(49.6, cartonSize(SIPP))).toBeCloseTo(0.31, 6);
  });

  // The production bug this exists to stop: a 31 SAR carton of 40 waters went
  // in as the cost of ONE bottle.
  it('makes a carton of water cost what one bottle costs', () => {
    expect(costPerPiece(31, 40)).toBeCloseTo(0.775, 6);
  });

  it('is the price itself for a loose item, and zero for no price', () => {
    expect(costPerPiece(2.5, null)).toBe(2.5);
    expect(costPerPiece(0, 24)).toBe(0);
    expect(costPerPiece(Number.NaN, 24)).toBe(0);
  });

  it('pre-fills a carton price rounded to the halala', () => {
    expect(boxPriceFromPieceCost(1.98, 24)).toBe(47.52);
    expect(boxPriceFromPieceCost(0.31, 160)).toBe(49.6);
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

  it('reads in the order the client writes his pack codes', () => {
    expect(describePackaging({ pieces_per_box: 20, packets_per_carton: 8, piece_size: 5, piece_size_unit: 'g' })).toBe('Carton of 8 packets × 20 × 5 g');
    expect(describePackaging({ pieces_per_box: 24, piece_size: 50, piece_size_unit: 'g' })).toBe('Carton of 24 × 50 g');
    expect(describePackaging({ pieces_per_box: 24, piece_size: null, piece_size_unit: null })).toBe('Carton of 24');
    expect(describePackaging({ pieces_per_box: null, piece_size: 320, piece_size_unit: 'ml' })).toBe('320 ml');
  });

  it('says nothing about a pack of one, or about nothing', () => {
    expect(describePackaging({ pieces_per_box: 1, piece_size: null, piece_size_unit: null })).toBeNull();
    expect(describePackaging({ pieces_per_box: null, piece_size: null, piece_size_unit: null })).toBeNull();
    expect(describePackaging(null)).toBeNull();
  });

  it('spells out the multiplication', () => {
    expect(describeCartonSum(SIPP)).toBe('1 carton = 8 packets × 20 = 160 pcs');
    expect(describeCartonSum(WATER)).toBe('1 carton = 40 pcs');
    expect(describeCartonSum(LOOSE)).toBeNull();
  });

  it('shows a piece count as cartons, packets and pieces', () => {
    expect(describeCount(3384, SIPP)).toBe('21 cartons + 1 packet + 4 pcs');
    expect(describeCount(160, SIPP)).toBe('1 carton');
    expect(describeCount(1000, levelsOf({ pieces_per_box: 24 }))).toBe('41 cartons + 16 pcs');
    expect(describeCount(5, WATER)).toBe('5 pcs');
    expect(describeCount(0, WATER)).toBe('0 cartons');
    expect(describeCount(40, LOOSE)).toBeNull();
  });

  it('describes how a received line was counted', () => {
    expect(describeReceivedLine({ quantityReceived: 385, boxesReceived: 19, piecesPerBox: 20, cartonsReceived: 2, packetsPerCarton: 8 })).toBe('2 cartons of 8 × 20 + 3 packets + 5 pcs');
    expect(describeReceivedLine({ quantityReceived: 60, boxesReceived: 3, piecesPerBox: 20, cartonsReceived: 0, packetsPerCarton: 8 })).toBe('3 packets');
    expect(describeReceivedLine({ quantityReceived: 200, boxesReceived: 10, piecesPerBox: 20 })).toBe('10 cartons of 20');
    expect(describeReceivedLine({ quantityReceived: 243, boxesReceived: 10, piecesPerBox: 24 })).toBe('10 cartons of 24 + 3 pcs');
    // Received before counting existed, or counted in pieces.
    expect(describeReceivedLine({ quantityReceived: 100, boxesReceived: null, piecesPerBox: null })).toBeNull();
    expect(describeReceivedLine({ quantityReceived: 100, boxesReceived: 100, piecesPerBox: 1 })).toBeNull();
  });
});

describe('packetsPerCartonFromPackCode', () => {
  // Every shape of pack code in the live catalogue on 2026-09-22.
  it.each([
    ['8*20*5GM', 20, 8],        // SIPP GREEN — the reported item
    ['10*24*50GM', 24, 10],     // TWIX
    ['25G*14*6', 14, 6],        // LAYS writes the size first
    ['25GM*16*6', 16, 6],       // DORITOS
    ['12*12*36.8GM', 12, 12],   // OREO: both counts agree
    ['32*12*36GM', 12, 32],     // BISKREM
  ])('reads %s with packets of %i as %i packets', (code, perPacket, expected) => {
    expect(packetsPerCartonFromPackCode(code, perPacket)).toBe(expected);
  });

  it.each([
    ['30*240ML', 30],           // one count: the carton holds cans directly
    ['45X1', 45],               // "45 × 1"
    ['12*30/40G', 12],          // PRINGLES: 30/40 is a size
    ['12', 12],
    ['12*20*45GM', null],       // SNICKERS: no packet saved to anchor on
    ['12*20*45GM', 24],         // …or one that matches neither count
    [null, 20],
  ])('does not guess from %s with packets of %s', (code, perPacket) => {
    expect(packetsPerCartonFromPackCode(code, perPacket)).toBeNull();
  });
});

describe('parsePackaging', () => {
  it('stores a cleared field as "not set", never as a pack of nothing', () => {
    const empty = { ok: true, value: { pieces_per_box: null, packets_per_carton: null, piece_size: null, piece_size_unit: null } };
    expect(parsePackaging({ pieces_per_box: 0, packets_per_carton: 0, piece_size: 0, piece_size_unit: 'g' })).toEqual(empty);
    expect(parsePackaging({})).toEqual(empty);
  });

  it('accepts a real carton, packet and size', () => {
    expect(parsePackaging({ pieces_per_box: 20, packets_per_carton: 8, piece_size: 36.8, piece_size_unit: 'g' })).toEqual({
      ok: true,
      value: { pieces_per_box: 20, packets_per_carton: 8, piece_size: 36.8, piece_size_unit: 'g' },
    });
  });

  it('stores a carton of one packet as no packet level', () => {
    expect(parsePackaging({ pieces_per_box: 24, packets_per_carton: 1 })).toMatchObject({ ok: true, value: { packets_per_carton: null } });
  });

  it.each([
    ['a fractional pack', { pieces_per_box: 2.5 }],
    ['a negative pack', { pieces_per_box: -24 }],
    ['an absurd pack', { pieces_per_box: 5000 }],
    ['fractional packets', { pieces_per_box: 20, packets_per_carton: 2.5 }],
    ['absurd packets', { pieces_per_box: 20, packets_per_carton: 5000 }],
    ['packets with no packet size', { packets_per_carton: 8 }],
    ['packets of one piece', { pieces_per_box: 1, packets_per_carton: 8 }],
    ['a negative size', { piece_size: -50, piece_size_unit: 'g' }],
    ['a size with no unit', { piece_size: 50, piece_size_unit: null }],
    ['a made-up unit', { piece_size: 50, piece_size_unit: 'oz' }],
    ['NaN', { pieces_per_box: Number.NaN }],
  ])('rejects %s', (_label, input) => {
    expect(parsePackaging(input).ok).toBe(false);
  });
});

describe('checkReceivedBoxes', () => {
  it('accepts a line with no breakdown (a loose item, or an older client)', () => {
    expect(checkReceivedBoxes({ quantityReceived: 100 })).toBeNull();
  });

  it('accepts packs that account for the pieces, with loose pieces on top', () => {
    expect(checkReceivedBoxes({ quantityReceived: 240, boxesReceived: 10, piecesPerBox: 24 })).toBeNull();
    expect(checkReceivedBoxes({ quantityReceived: 243, boxesReceived: 10, piecesPerBox: 24 })).toBeNull();
    expect(checkReceivedBoxes({ quantityReceived: 385, boxesReceived: 19, piecesPerBox: 20, cartonsReceived: 2, packetsPerCarton: 8 })).toBeNull();
  });

  it.each([
    ['packs without a pack size', { quantityReceived: 240, boxesReceived: 10, piecesPerBox: null }],
    ['a pack size without packs', { quantityReceived: 240, boxesReceived: null, piecesPerBox: 24 }],
    ['a pack of zero', { quantityReceived: 0, boxesReceived: 10, piecesPerBox: 0 }],
    ['negative packs', { quantityReceived: 0, boxesReceived: -1, piecesPerBox: 24 }],
    ['packs worth more than was received', { quantityReceived: 200, boxesReceived: 10, piecesPerBox: 24 }],
    ['cartons with no packets under them', { quantityReceived: 160, cartonsReceived: 1, packetsPerCarton: 8 }],
    ['cartons without packets per carton', { quantityReceived: 160, boxesReceived: 8, piecesPerBox: 20, cartonsReceived: 1, packetsPerCarton: null }],
    ['cartons worth more packets than were received', { quantityReceived: 160, boxesReceived: 8, piecesPerBox: 20, cartonsReceived: 2, packetsPerCarton: 8 }],
    ['a carton of zero packets', { quantityReceived: 160, boxesReceived: 8, piecesPerBox: 20, cartonsReceived: 1, packetsPerCarton: 0 }],
    ['negative cartons', { quantityReceived: 160, boxesReceived: 8, piecesPerBox: 20, cartonsReceived: -1, packetsPerCarton: 8 }],
  ])('rejects %s', (_label, line) => {
    expect(checkReceivedBoxes(line)).toMatch(/./);
  });
});
