import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {TravelShareCampaign} from '../src/app/TravelShareCampaign';
import {AppProvider} from '../src/app/store';
import {validBoostPost} from '../src/app/boostPost';
afterEach(cleanup);
function setup(fail=false){
  const submitShareLink=vi.fn(async()=>{if(fail)throw new Error('network');return {ok:true,error:null}});
  const services={loadSellableDepartures:async()=>({data:[],error:null}),currentUser:async()=>null,onAuthStateChange:()=>()=>{},
    loadOwnShareCampaign:async()=>({campaign:{id:'campaign'},orders:[{id:'order'}],submissions:[],error:null}),submitShareLink};
  render(<MemoryRouter><AppProvider services={services as never}><TravelShareCampaign/></AppProvider></MemoryRouter>);
  return submitShareLink;
}
describe('Travelers Boost 三项前提及失败恢复',()=>{
  it('分别关闭链接、@确认、授权均不能提交；仅全部成立才能发送',async()=>{
    const submit=setup();
    const button=await screen.findByRole('button',{name:'提交推广助力候选'});
    const mentioned=screen.getByRole('checkbox',{name:/我已在这篇/});
    const consent=screen.getByRole('checkbox',{name:/我授权 JTW/});
    const link=screen.getByLabelText('公开帖子链接');
    expect(button).toBeDisabled();
    fireEvent.change(link,{target:{value:'https://www.tiktok.com/@tester/video/123'}});
    fireEvent.click(consent);expect(button).toBeDisabled();
    fireEvent.click(mentioned);expect(button).toBeEnabled();
    fireEvent.click(consent);expect(button).toBeDisabled();
    fireEvent.click(consent);fireEvent.change(link,{target:{value:'https://evil.test/'}});
    expect(button).toBeDisabled();expect(submit).not.toHaveBeenCalled();
    fireEvent.change(link,{target:{value:'https://www.tiktok.com/@tester/video/123'}});
    fireEvent.change(screen.getByLabelText('关联本人订单'),{target:{value:'order'}});
    fireEvent.change(screen.getByLabelText('本人平台账号'),{target:{value:'tester'}});
    fireEvent.click(button);
    await waitFor(()=>expect(submit).toHaveBeenCalledWith(expect.objectContaining({mentionConfirmed:true,authorized:true,authorizationVersion:'share-link-limited-v2'})));
    expect(await screen.findByText(/已提交推广助力候选/)).toBeVisible();
    expect(consent).not.toBeChecked();
  });
  it('网络失败保留链接与授权输入且恢复按钮',async()=>{
    const submit=setup(true);const button=await screen.findByRole('button',{name:'提交推广助力候选'});
    fireEvent.change(screen.getByLabelText('关联本人订单'),{target:{value:'order'}});
    fireEvent.change(screen.getByLabelText('本人平台账号'),{target:{value:'tester'}});
    fireEvent.change(screen.getByLabelText('公开帖子链接'),{target:{value:'https://www.tiktok.com/@tester/video/123'}});
    for(const checkbox of screen.getAllByRole('checkbox'))fireEvent.click(checkbox);
    fireEvent.click(button);
    await waitFor(()=>expect(submit).toHaveBeenCalledOnce());
    expect(await screen.findByText(/网络异常，输入已保留/)).toBeVisible();
    expect(screen.getByLabelText('公开帖子链接')).toHaveValue('https://www.tiktok.com/@tester/video/123');
    expect(button).toBeEnabled();
  });
  it('拒绝伪域名、账号主页、协议和平台不符链接',()=>{
    expect(validBoostPost('instagram','https://www.instagram.com/reel/ABC_123/')).toBe(true);
    for(const url of ['http://instagram.com/p/a','https://instagram.com.evil.test/p/a','https://instagram.com/user','https://user@instagram.com/p/a','https://www.tiktok.com/@tester/video/123'])expect(validBoostPost('instagram',url)).toBe(false);
  });
});
