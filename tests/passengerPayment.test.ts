import {describe, expect, it} from 'vitest';
import {passengerPaymentCopy, paymentState} from '../src/shared/i18n/passengerPayment';
import {passengerLocales} from '../src/shared/i18n/passengerLocale';

describe('passenger payment result copy', () => {
  it.each([
    ['paid', false, 'paid'],
    ['confirmed', false, 'paid'],
    ['payment_review', false, 'review'],
    ['refunded', false, 'refunded'],
    ['cancelled', false, 'cancelled'],
    ['expired', false, 'cancelled'],
    ['pending_manual_review', false, 'pending'],
    ['pending_payment', false, 'pending'],
    [undefined, true, 'pending'],
    [undefined, false, 'confirming'],
  ] as const)('maps %s to %s', (status, manual, expected) => {
    expect(paymentState(status, manual)).toBe(expected);
  });

  it('has complete copy for every passenger locale and payment state', () => {
    for (const locale of passengerLocales) {
      const copy = passengerPaymentCopy[locale.code];
      expect(copy.eyebrow).toBeTruthy();
      expect(copy.viewOrder).toBeTruthy();
      for (const state of ['paid', 'review', 'refunded', 'cancelled', 'pending', 'confirming'] as const) {
        expect(copy.states[state].title).toBeTruthy();
        expect(copy.states[state].description).toBeTruthy();
        expect(copy.states[state].label).toBeTruthy();
      }
    }
  });
});
