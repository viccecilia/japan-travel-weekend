import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const app=readFileSync('src/app/App.tsx','utf8');
const styles=readFileSync('src/styles.css','utf8');

describe('passenger login auxiliary actions',()=>{
  it('keeps password recovery adjacent to the password field and creation below the main CTA',()=>{
    expect(app).toContain('className="login-forgot"');
    expect(app).toContain('className="login-create-account"');
    expect(app.indexOf('className="login-forgot"')).toBeLessThan(app.indexOf('className="login-create-account"'));
    expect(styles).toContain('.login-forgot{display:flex;justify-content:flex-end');
    expect(styles).toContain('.login-create-account{display:flex;justify-content:center');
  });
});
