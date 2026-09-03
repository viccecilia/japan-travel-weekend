import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AccessibilityLegal,CancellationLegal,CommercialTransactions,CommunityGuidelines,CompanyLegal,Privacy,TravelConditions} from '../src/website/Website';
import {legalPublication} from '../src/shared/config/legalOperations';

afterEach(cleanup);

describe('正式法律入口',()=>{
  const pages=[
    ['公司与运营主体',<CompanyLegal/>],
    ['特定商取引法相关标识',<CommercialTransactions/>],
    ['隐私政策',<Privacy/>],
    ['旅行条件',<TravelConditions/>],
    ['取消与退款政策',<CancellationLegal/>],
    ['无障碍与合理便利',<AccessibilityLegal/>],
    ['行程群聊与照片规范',<CommunityGuidelines/>],
  ] as const;

  it.each(pages)('%s 显示版本、审核状态和完整法律导航',(title,page)=>{
    render(<MemoryRouter>{page}</MemoryRouter>);
    expect(screen.getByRole('heading',{name:title})).toBeInTheDocument();
    expect(screen.getByText(`文件版本：${legalPublication.version}`)).toBeInTheDocument();
    expect(screen.getByText(/真实预订与收款保持关闭/)).toBeInTheDocument();
    expect(screen.getByRole('navigation',{name:'法律文件'}).querySelectorAll('a')).toHaveLength(8);
  });

  it('取消页使用集中配置的日本时间规则',()=>{
    render(<MemoryRouter><CancellationLegal/></MemoryRouter>);
    expect(screen.getByText(/所有时间统一按日本时间计算/)).toBeInTheDocument();
    expect(screen.getByText(/出发前2～3天：退款 50%/)).toBeInTheDocument();
  });
});
