import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {ProfileInvite} from '../src/app/ProfileInvite';
const load=vi.hoisted(()=>vi.fn());
vi.mock('../src/app/store',()=>({useApp:()=>({services:{loadOwnReferralSummary:load}})}));
afterEach(()=>{cleanup();vi.restoreAllMocks()});
describe('profile referral entry',()=>{
 it('uses the existing referral code, copies the canonical registration link and generates a QR',async()=>{
  load.mockResolvedValue({code:'TEST+REF'});
  const copy=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});
  render(<MemoryRouter><ProfileInvite/></MemoryRouter>);
  const details=document.querySelector('details')!;details.open=true;fireEvent(details,new Event('toggle'));
  const input=await screen.findByLabelText('专属推荐链接');
  expect(input).toHaveValue(window.location.origin+'/app/create-account?ref=TEST%2BREF');
  fireEvent.click(screen.getByRole('button',{name:'复制链接'}));
  await screen.findByText('链接已复制 ✓');expect(copy).toHaveBeenCalledWith(window.location.origin+'/app/create-account?ref=TEST%2BREF');
  fireEvent.click(screen.getByRole('button',{name:'二维码'}));
  expect(await screen.findByAltText('JTW 专属推荐二维码')).toHaveAttribute('src',expect.stringContaining('data:image/png'));
 });
 it('does not invent a code when the existing service fails and permits retry',async()=>{
  load.mockResolvedValue(null);
  render(<MemoryRouter><ProfileInvite/></MemoryRouter>);
  document.querySelector('details')!.open=true;fireEvent(document.querySelector('details')!,new Event('toggle'));
  await screen.findByText('推荐信息暂时无法读取，请重试');
  expect(screen.queryByRole('button',{name:'复制链接'})).toBeNull();
  load.mockResolvedValue({code:'REAL'});
  fireEvent.click(screen.getByRole('button',{name:'重新读取推荐信息'}));
  await waitFor(()=>expect(screen.getByLabelText('专属推荐链接')).toHaveValue(window.location.origin+'/app/create-account?ref=REAL'));
 });
});
