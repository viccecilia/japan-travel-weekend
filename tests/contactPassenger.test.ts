import {describe,expect,it,vi} from 'vitest';
import {contactPassenger} from '../src/shared/services/contactPassenger';
describe('temporary passenger contact',()=>{
 it('fetches on request and opens only the validated telephone URI',async()=>{
  const dial=vi.fn(),load=vi.fn().mockResolvedValue({phone:'+81 (90) 0000-0000'});
  expect(await contactPassenger(load,dial)).toBe(true);
  expect(load).toHaveBeenCalledTimes(1);expect(dial).toHaveBeenCalledWith('tel:+819000000000');
 });
 it.each([null,{phone:'javascript:alert(1)'},{phone:''}])('does not dial unavailable or unsafe contact',async value=>{
  const dial=vi.fn();expect(await contactPassenger(async()=>value,dial)).toBe(false);expect(dial).not.toHaveBeenCalled();
 });
 it('keeps permission/network failures retryable',async()=>{
  const dial=vi.fn();expect(await contactPassenger(async()=>{throw Error('denied')},dial)).toBe(false);expect(dial).not.toHaveBeenCalled();
 });
});
