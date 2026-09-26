import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {MemoryRouter,Route,Routes,useLocation} from 'react-router-dom';
import {AppProvider} from '../src/app/store';
import {PassengerPageHeader} from '../src/app/PassengerPageHeader';

const Location=()=>{const location=useLocation();return <p>{location.pathname}</p>};
afterEach(()=>{cleanup();history.replaceState(null,'')});

describe('PassengerPageHeader',()=>{
  it('uses its parent-tab fallback for a direct secondary-page entry',()=>{
    history.replaceState({idx:0},'');
    render(<MemoryRouter initialEntries={['/app/ambassador']}><AppProvider><Routes><Route path="/app/ambassador" element={<PassengerPageHeader backTo="/app/profile"/>}/><Route path="/app/profile" element={<Location/>}/></Routes></AppProvider></MemoryRouter>);
    fireEvent.click(screen.getByRole('button',{name:'返回'}));
    expect(screen.getByText('/app/profile')).toBeTruthy();
  });
  it('keeps the touch target semantic and locale aware',()=>{
    render(<MemoryRouter><AppProvider><PassengerPageHeader backTo="/app/profile"/></AppProvider></MemoryRouter>);
    expect(screen.getByRole('button',{name:'返回'})).toBeTruthy();
  });
});
