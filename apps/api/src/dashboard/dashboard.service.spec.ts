import { describe, expect, it } from 'vitest';
import { ROLES, WORK_ORDER_STATUSES } from '@datos/shared';

describe('shared contracts', () => {
  it('keeps industrial roles explicit', () => {
    expect(ROLES).toEqual(['SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'TECNICO', 'CLIENTE_VIEWER']);
  });

  it('keeps work order closure states available', () => {
    expect(WORK_ORDER_STATUSES).toContain('PENDING_EVIDENCE');
    expect(WORK_ORDER_STATUSES).toContain('SIGNED');
  });
});
