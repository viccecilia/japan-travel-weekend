import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {AppProvider,useApp} from '../src/app/store';

afterEach(()=>{cleanup();localStorage.clear();document.documentElement.lang='en'});

function LocaleSwitch(){
  const {state,setUi}=useApp();
  return <button onClick={()=>setUi({...state.ui,locale:'vi'})}>switch</button>;
}

describe('passenger document language',()=>{
  it('keeps the html lang attribute aligned with the selected app locale',async()=>{
    render(<AppProvider><LocaleSwitch/></AppProvider>);
    await waitFor(()=>expect(document.documentElement.lang).toBe('zh-CN'));
    fireEvent.click(screen.getByRole('button',{name:'switch'}));
    await waitFor(()=>expect(document.documentElement.lang).toBe('vi'));
  });
});
