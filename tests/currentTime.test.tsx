import {act,cleanup,render,renderHook,screen} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {useCurrentTime} from '../src/app/useCurrentTime';
import {tokyoDateKey} from '../src/app/homeUpcomingDepartures';
import {HomeDatePicker} from '../src/app/HomeDatePicker';

afterEach(()=>{cleanup();vi.useRealTimers()});
describe('foreground and Tokyo midnight clock',()=>{
  it('renders selected-language weekdays even if browser ICU falls back',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-19T12:00:00Z'));
    render(<HomeDatePicker locale="ne" date="2026-09-19" onChange={()=>{}}/>);
    expect(screen.getByRole('button',{name:/शनि\s*19/})).toHaveAttribute('aria-pressed','true');
    expect(screen.queryByText('周六')).toBeNull();
  });
  it('updates across Tokyo midnight and stops its interval on unmount',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-19T14:59:50Z'));
    const hook=renderHook(()=>useCurrentTime());
    expect(tokyoDateKey(new Date(hook.result.current))).toBe('2026-09-19');
    act(()=>vi.advanceTimersByTime(30_000));
    expect(tokyoDateKey(new Date(hook.result.current))).toBe('2026-09-20');
    hook.unmount();expect(vi.getTimerCount()).toBe(0);
  });
  it('resamples on focus after a suspended tab resumes',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-19T14:59:50Z'));
    const hook=renderHook(()=>useCurrentTime());
    vi.setSystemTime(new Date('2026-09-20T02:00:00Z'));
    act(()=>window.dispatchEvent(new Event('focus')));
    expect(hook.result.current).toBe(Date.now());
  });
});
