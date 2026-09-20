import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {Discover} from '../src/app/Discover';
import {AppShell,AppTrips} from '../src/app/App';
import {DiscoverManager} from '../src/app/operations/DiscoverManager';
import {initialDiscoverHeroes,visibleDiscoverHeroes,discoverText} from '../src/shared/discover';
import {trips} from '../src/shared/data/trips';
const mock=vi.hoisted(()=>{
 const list=vi.fn(),save=vi.fn(),remove=vi.fn();
 return {list,save,remove,services:{operations:{listDiscoverHeroes:list,listProducts:async()=>({data:[],error:null}),saveDiscoverHero:save,deleteDiscoverHero:remove}}};
});
vi.mock('../src/app/store',()=>({
 useApp:()=>({state:{ui:{locale:'zh-CN'}},catalogRevision:1,setUi:vi.fn(),services:mock.services}),
 useOptionalApp:()=>({state:{ui:{locale:'zh-CN'}},setUi:vi.fn()}),
}));
vi.mock('../src/shared/data/repository',async()=>{const {trips}=await import('../src/shared/data/trips');return {travelRepository:{listTrips:()=>trips,getTrip:(slug:string)=>trips.find(t=>t.slug===slug)}}});
afterEach(()=>{cleanup();vi.restoreAllMocks()});
beforeEach(()=>{mock.list.mockResolvedValue({data:initialDiscoverHeroes,error:null});mock.save.mockReset();mock.remove.mockReset()});
const mount=()=>render(<MemoryRouter><Routes><Route path="/" element={<Discover/>}/><Route path="/app/trips" element={<p>CATALOG</p>}/></Routes></MemoryRouter>);
describe('Discover public interactions',()=>{
 it('keeps the same title node on touch and leaves the shell free of idle state',async()=>{
  render(<MemoryRouter><AppShell nav><Discover/></AppShell></MemoryRouter>);
  await screen.findByText('这个秋天，别只在照片里见过京都。');
  const title=document.querySelector('.discover-title');
  fireEvent.pointerDown(document.querySelector('.discover-hero')!,{clientX:150,clientY:300});
  fireEvent.pointerUp(document.querySelector('.discover-hero')!,{clientX:150,clientY:300});
  expect(document.querySelector('.discover-title')).toBe(title);
  expect(document.querySelector('.app-frame')).not.toHaveAttribute('data-awake');
  expect(screen.getByText('SEASONAL VLOG')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'下一屏'}));
  expect(screen.getByText('ROUTE STORY')).toBeVisible();
  expect(document.querySelector('.discover-title')).toBe(title);
 });
 it('Soul has real video/poster and no commercial CTA or prices; route buttons select the correct product',async()=>{
  mount();
  await screen.findByText('这个秋天，别只在照片里见过京都。');
  expect(screen.queryByRole('link',{name:'查看旅程 →'})).not.toBeInTheDocument();
  expect(document.querySelector('video')).toHaveAttribute('poster','/media/discover/autumn-soul.jpg');
  expect(document.querySelector('video')).toHaveAttribute('playsinline');
  fireEvent.click(screen.getByRole('button',{name:'下一屏'}));
  expect(screen.getByRole('link',{name:'查看旅程 →'})).toHaveAttribute('href','/app/trips/amanohashidate-ine');
  fireEvent.click(screen.getByRole('button',{name:'下一屏'}));
  expect(screen.getByRole('link',{name:'查看旅程 →'})).toHaveAttribute('href','/app/trips/miyama-katsuoji-arashiyama');
  fireEvent.click(screen.getByRole('button',{name:'上一屏'}));
  expect(document.querySelector('video')).toHaveAttribute('src','/media/discover/amanohashidate-ine.mp4');
 });
 it('empty successful response does not resurrect disabled initial videos',async()=>{
  mock.list.mockResolvedValue({data:[],error:null});mount();
  await screen.findByText('暂无发现内容');expect(document.querySelector('video')).toBeNull();
 });
 it('poster remains on playback error and vertical control opens routes',async()=>{
  mount();await screen.findByText('这个秋天，别只在照片里见过京都。');
  fireEvent.error(document.querySelector('video')!);
  expect(document.querySelector('video')).toBeNull();
  expect(document.querySelector('.discover-film img')).toHaveAttribute('src','/media/discover/autumn-soul.jpg');
  fireEvent.click(screen.getByRole('link',{name:'精选线路'}));
  expect(screen.getByText('CATALOG')).toBeInTheDocument();
 });
 it('uses dynamic count, sorting, language fallback and excludes unavailable bound products',()=>{
  expect(visibleDiscoverHeroes([...initialDiscoverHeroes,{...initialDiscoverHeroes[0],id:'four',sort_order:4}],trips)).toHaveLength(4);
  expect(visibleDiscoverHeroes(initialDiscoverHeroes,[])).toHaveLength(1);
  expect(discoverText(initialDiscoverHeroes[0],'es').title).toContain('京都的秋天');
 });
 it.each([['/app','发现'],['/app/trips/amanohashidate-ine','精选线路'],['/app/booking/amanohashidate-ine','精选线路'],['/app/vip-charter','精选线路'],['/app/orders/one','订单'],['/app/messages','消息'],['/app/profile','我的']])('unique navigation at %s',(path,label)=>{
  render(<MemoryRouter initialEntries={[path]}><AppShell nav>Page</AppShell></MemoryRouter>);
  expect(document.querySelectorAll('.bottom-nav [aria-current=page]')).toHaveLength(1);
  expect(document.querySelector('.bottom-nav [aria-current=page]')).toHaveTextContent(label);
 });
 it('catalogue cards are whole links; VIP and group flows are retained below grid',()=>{
  render(<MemoryRouter><AppTrips/></MemoryRouter>);
  const cards=document.querySelectorAll('.discover-route-card');
  expect(cards).toHaveLength(trips.length);
  expect(cards[0].tagName).toBe('A');
  expect(cards[0].querySelector('a,button')).toBeNull();
  expect(screen.getByRole('link',{name:/VIP 专属包车/})).toHaveAttribute('href','/app/vip-charter');
 });
});
describe('Discover maintenance',()=>{
 it('confirmed deletion removes only the selected saved Hero and clears the editor',async()=>{
  mock.list.mockResolvedValue({data:initialDiscoverHeroes.map(h=>({...h,version:3})),error:null});
  mock.remove.mockResolvedValue({error:null});
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
  render(<MemoryRouter><DiscoverManager/></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:/这一生/}));
  fireEvent.click(screen.getByRole('button',{name:'删除此视频'}));
  await screen.findByText('已删除');
  expect(confirm).toHaveBeenCalledWith('确定删除这个 Discover 视频吗？删除后游客端将不再显示。');
  expect(mock.remove).toHaveBeenCalledExactlyOnceWith(initialDiscoverHeroes[0].id,3);
  expect(screen.queryByRole('button',{name:/这一生/})).not.toBeInTheDocument();
  expect(screen.queryByLabelText('标题')).not.toBeInTheDocument();
  expect(document.querySelectorAll('.discover-manager-list>button')).toHaveLength(2);
 });
 it('cancel does not delete; failed request retains the list and unsaved input and permits retry',async()=>{
  mock.list.mockResolvedValue({data:[{...initialDiscoverHeroes[0],version:2}],error:null});
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  mock.remove.mockResolvedValue({error:'版本冲突'});
  render(<MemoryRouter><DiscoverManager/></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:/这一生/}));
  fireEvent.change(screen.getByLabelText('标题'),{target:{value:'保留输入'}});
  fireEvent.click(screen.getByRole('button',{name:'删除此视频'}));
  expect(mock.remove).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button',{name:'删除此视频'}));
  await screen.findByText(/版本冲突.*删除失败/);
  expect(screen.getByLabelText('标题')).toHaveValue('保留输入');
  expect(screen.getByRole('button',{name:/这一生/})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'删除此视频'})).toBeEnabled();
 });
 it('save failure preserves typed content and only retries with the same stable id/version',async()=>{
  mock.save.mockResolvedValue({data:null,error:'version conflict'});
  render(<MemoryRouter><DiscoverManager/></MemoryRouter>);
  const card=await screen.findByRole('button',{name:/这一生/});fireEvent.click(card);
  fireEvent.change(screen.getByLabelText('标题'),{target:{value:'修改后标题'}});
  fireEvent.click(screen.getByRole('button',{name:'保存内容'}));
  await screen.findByText(/输入已保留/);
  expect(screen.getByLabelText('标题')).toHaveValue('修改后标题');
  expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({id:initialDiscoverHeroes[0].id,version:0}));
 });
 it('backend unavailable is explicit and cannot report a fake save',async()=>{
  mock.list.mockResolvedValue({data:[],error:'migration missing'});
  render(<MemoryRouter><DiscoverManager/></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:/这一生/}));
  expect(screen.getByRole('button',{name:'保存内容'})).toBeDisabled();
  expect(screen.getByText(/初始内容参考/)).toBeInTheDocument();
  await waitFor(()=>expect(mock.save).not.toHaveBeenCalled());
 });
});
