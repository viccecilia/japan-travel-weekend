import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {VehicleInspectionPlaceholder} from '../src/app/VehicleInspectionPlaceholder';
afterEach(cleanup);
it('is clearly unavailable and creates neither a blocking action nor a false inspection result',()=>{
  render(<VehicleInspectionPlaceholder/>);
  expect(screen.getByRole('region',{name:'车辆 / 出库检查'})).toHaveTextContent('不影响查看任务');
  expect(screen.getByText(/这里不记录或表示/)).toBeVisible();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
});
