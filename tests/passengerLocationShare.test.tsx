import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {PassengerLocationShare} from '../src/app/PassengerLocationShare';
import type {SupabaseTripRoomRepository} from '../src/shared/integrations/supabaseProduction';
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
const repository=()=>({loadPassengerLocations:vi.fn().mockResolvedValue([]),publishOwnLocationShare:vi.fn().mockResolvedValue(true),stopOwnLocationShare:vi.fn().mockResolvedValue(true)});
describe('explicit passenger location sharing',()=>{
 it('does not publish browser coordinates before confirmation',async()=>{
  const repo=repository();
  vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:(success:PositionCallback)=>success({coords:{latitude:34.7,longitude:135.5,accuracy:8},timestamp:Date.now()} as GeolocationPosition)}});
  render(<PassengerLocationShare repository={repo as unknown as SupabaseTripRoomRepository} groupId="group" locale="en"/>);
  await waitFor(()=>expect(repo.loadPassengerLocations).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button',{name:'Send current location'}));
  expect(screen.getByRole('dialog')).toHaveTextContent('15 minutes');expect(repo.publishOwnLocationShare).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole('button',{name:'Send current location'})[1]);
  await waitFor(()=>expect(repo.publishOwnLocationShare).toHaveBeenCalledWith('group',expect.objectContaining({latitude:34.7,longitude:135.5})));
 });
 it('location refusal never creates sharing or attendance',async()=>{
  const repo=repository();vi.stubGlobal('navigator',{geolocation:{getCurrentPosition:(_success:PositionCallback,fail:PositionErrorCallback)=>fail({code:1} as GeolocationPositionError)}});
  render(<PassengerLocationShare repository={repo as unknown as SupabaseTripRoomRepository} groupId="group" locale="en"/>);
  await act(async()=>{});fireEvent.click(screen.getByRole('button',{name:'Send current location'}));
  expect(screen.getByRole('alert')).toHaveTextContent('failed');expect(repo.publishOwnLocationShare).not.toHaveBeenCalled();
 });
 it('frozen/closed rooms disable the location action',async()=>{
  const repo=repository();render(<PassengerLocationShare repository={repo as unknown as SupabaseTripRoomRepository} groupId="group" locale="en" disabled/>);
  await act(async()=>{});expect(screen.getByRole('button',{name:'Send current location'})).toBeDisabled();
 });
 it('restores existing share after refresh and can stop it',async()=>{
  const repo=repository();repo.loadPassengerLocations.mockResolvedValueOnce([{id:'share',sampled_at:new Date().toISOString()}]);
  render(<PassengerLocationShare repository={repo as unknown as SupabaseTripRoomRepository} groupId="group" locale="en"/>);
  await act(async()=>{});fireEvent.click(screen.getByRole('button',{name:'Send current location'}));
  fireEvent.click(screen.getByRole('button',{name:'Stop sharing'}));
  await waitFor(()=>expect(repo.stopOwnLocationShare).toHaveBeenCalledWith('group'));
 });
});
