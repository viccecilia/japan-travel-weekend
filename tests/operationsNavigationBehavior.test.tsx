import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,describe,expect,it} from 'vitest';
import {OperationsLayout} from '../src/app/operations/OperationsLayout';
import {AppProvider} from '../src/app/store';

const renderLayout=(path:string)=>render(<MemoryRouter initialEntries={[path]}><AppProvider services={null}><OperationsLayout><p>业务内容</p></OperationsLayout></AppProvider></MemoryRouter>);
afterEach(cleanup);

describe('V10 运营后台分组导航',()=>{
  it('直接打开子页面时展开父组并唯一高亮当前页面',()=>{
    renderLayout('/app/operations/departures?panel=pricing');
    expect(screen.getByRole('button',{name:/产品与班次/})).toHaveAttribute('aria-expanded','true');
    expect(screen.getByRole('link',{name:'价格与销售时间'})).toHaveAttribute('aria-current','page');
    expect(screen.getAllByRole('link').filter(link=>link.getAttribute('aria-current')==='page')).toHaveLength(1);
    expect(screen.getByText('运营后台 / 产品与班次 / 价格与销售时间')).toBeInTheDocument();
  });

  it('折叠组可展开且游客预览保持新标签',()=>{
    renderLayout('/app/operations');
    const marketing=screen.getByRole('button',{name:/素材与营销/});
    expect(marketing).toHaveAttribute('aria-expanded','false');
    fireEvent.click(marketing);
    expect(screen.getByRole('link',{name:'首页推荐'})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:/预览游客端/})).toHaveAttribute('target','_blank');
  });

  it('订单与退款使用同一路由时仍只高亮当前入口',()=>{
    renderLayout('/app/operations/orders?afterSale=refund_pending');
    expect(screen.getByRole('link',{name:'取消退款'})).toHaveAttribute('aria-current','page');
    expect(screen.getByRole('link',{name:'全部订单'})).not.toHaveAttribute('aria-current');
    expect(screen.getAllByRole('link').filter(link=>link.getAttribute('aria-current')==='page')).toHaveLength(1);
    expect(screen.getByText('运营后台 / 订单与售后 / 取消退款')).toBeInTheDocument();
  });
});
