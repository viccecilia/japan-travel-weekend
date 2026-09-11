import {afterEach,describe,expect,it,vi} from 'vitest';
import {installServiceWorkerUpdateChecks} from '../src/shared/pwaUpdate';

afterEach(()=>vi.useRealTimers());

describe('PWA update checks',()=>{
  it('checks again on focus, online and the configured interval',async()=>{
    vi.useFakeTimers();
    const update=vi.fn(async()=>undefined);
    const stop=installServiceWorkerUpdateChecks({update},1000);
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(update).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(update).toHaveBeenCalledTimes(3);
  });

  it('does not check while the document is hidden',()=>{
    const update=vi.fn(async()=>undefined);
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    const stop=installServiceWorkerUpdateChecks({update},1000);
    window.dispatchEvent(new Event('focus'));
    expect(update).not.toHaveBeenCalled();
    stop();
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
  });
});
