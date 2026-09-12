import{describe,expect,it}from'vitest';
import{composePassengerDisplayName,splitPassengerDisplayName}from'../src/app/passengerDisplayName';

describe('passenger display-name salutation',()=>{
  it('composes the selected salutation without an extra space',()=>{
    expect(composePassengerDisplayName(' 无敌小强 ','先生')).toBe('无敌小强先生');
    expect(composePassengerDisplayName('山田 花子','女士')).toBe('山田 花子女士');
  });
  it('restores the name and selection from a saved display name',()=>{
    expect(splitPassengerDisplayName('无敌小强先生')).toEqual({name:'无敌小强',salutation:'先生'});
    expect(splitPassengerDisplayName('山田 花子女士')).toEqual({name:'山田 花子',salutation:'女士'});
    expect(splitPassengerDisplayName('旧显示名')).toEqual({name:'旧显示名',salutation:''});
  });
});
