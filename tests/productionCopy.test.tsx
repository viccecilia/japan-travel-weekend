import {cleanup,render} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {AppHome,BoardingPass,Login,Orders,PaymentResult} from '../src/app/AppDemo';
import {TripRoom} from '../src/app/TripRoom';
import {AppProvider} from '../src/app/store';
import {appConfig} from '../src/shared/config/businessRules';

afterEach(cleanup);

const cases=[
  ['/app-demo',<AppHome/>],
  ['/app-demo/login',<Login/>],
  ['/app-demo/orders',<Orders/>],
  ['/app-demo/my-trip/room',<TripRoom/>],
  ['/app-demo/payment-result',<PaymentResult/>],
  ['/app-demo/boarding-pass/missing',<BoardingPass/>],
] as const;

describe('production 用户可见文案',()=>{
  it.each(cases)('%s 不显示开发或 Demo 标签',(path,component)=>{
    expect(appConfig.runtimeMode).toBe('production');
    const view=render(<MemoryRouter initialEntries={[path]}><AppProvider><Routes><Route path="*" element={component}/></Routes></AppProvider></MemoryRouter>);
    expect(view.container.textContent).not.toMatch(/开发种子|开发模拟|Demo/);
  });
});
