import { describe, expect, it } from 'vitest';
import { isWorkshopUiRuntimeEmergencyExitInput } from './WorkshopUiRuntimeAuthority';

describe('Workshop UI runtime authority', () => {
  it('recognizes only the host emergency chord', () => {
    expect(isWorkshopUiRuntimeEmergencyExitInput({
      type: 'keyDown',
      key: 'F12',
      control: true,
      shift: true,
      alt: false,
      meta: false,
    })).toBe(true);
    expect(isWorkshopUiRuntimeEmergencyExitInput({
      type: 'keyDown',
      key: 'F12',
      control: false,
      shift: true,
      alt: false,
      meta: false,
    })).toBe(false);
  });
});
