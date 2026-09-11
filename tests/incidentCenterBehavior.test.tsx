import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AppProvider} from '../src/app/store';
import {IncidentCenter} from '../src/app/operations/IncidentCenter';
import type {ProductionBrowserServices} from '../src/shared/backend/productionServices';
afterEach(()=>cleanup());

describe('运行异常独立详情',()=>{
 it('把班次和车辆组筛选实际传给数据查询，并提供返回运行详情',async()=>{
  const listIncidents=vi.fn(async()=>({data:[],error:null}));
  const services={operations:{listIncidents},loadSellableDepartures:async()=>({data:[],error:null}),onAuthStateChange:()=>()=>{},currentUser:async()=>null} as unknown as ProductionBrowserServices;
  render(<MemoryRouter initialEntries={['/app/operations/incidents?date=2026-09-11&departure=dep-1&vehicleGroup=vg-2']}><AppProvider services={services}><IncidentCenter/></AppProvider></MemoryRouter>);
  await waitFor(()=>expect(listIncidents).toHaveBeenCalledWith({departureId:'dep-1',vehicleGroupId:'vg-2'}));
  expect(screen.getByText('班次：dep-1 · 车辆组：vg-2')).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'返回运行详情'})).toHaveAttribute('href','/app/operations/run?date=2026-09-11&departure=dep-1');
 });
});
