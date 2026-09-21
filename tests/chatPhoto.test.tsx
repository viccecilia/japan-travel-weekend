import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {ChatPhotoUpload} from '../src/app/ChatPhoto';
import {SupabaseTripRoomRepository} from '../src/shared/integrations/supabaseProduction';
afterEach(cleanup);
describe('private chat photo delivery',()=>{
 it('uploads to the reserved private path and only then finalizes the same message',async()=>{
  const upload=vi.fn().mockResolvedValue({error:null}),from=vi.fn(()=>({upload}));
  const rpc=vi.fn().mockResolvedValueOnce({data:'room/message/image',error:null}).mockResolvedValueOnce({data:'message',error:null});
  const repo=new SupabaseTripRoomRepository({rpc,storage:{from}} as never),file=new File(['bytes'],'test.png',{type:'image/png'});
  expect(await repo.sendPhoto('room','message',file)).toBe(true);
  expect(from).toHaveBeenCalledWith('trip-chat-media');
  expect(upload).toHaveBeenCalledWith('room/message/image',file,{contentType:'image/png',upsert:false});
  expect(rpc).toHaveBeenLastCalledWith('publish_trip_room_photo',{p_message:'message'});
 });
 it('does not upload when room authorization fails',async()=>{
  const from=vi.fn(),rpc=vi.fn().mockResolvedValue({data:null,error:{message:'frozen'}});
  expect(await new SupabaseTripRoomRepository({rpc,storage:{from}} as never).sendPhoto('room','message',new File(['a'],'photo.png',{type:'image/png'}))).toBe(false);
  expect(from).not.toHaveBeenCalled();
 });
 it('retains selection after failure and retries one stable message ID',async()=>{
  const sendPhoto=vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),sent=vi.fn();
  render(<ChatPhotoUpload repository={{sendPhoto} as unknown as SupabaseTripRoomRepository} locale="en" roomId="room" disabled={false} onSent={sent}/>);
  const input=screen.getByLabelText('Add photo',{selector:'input'});
  fireEvent.change(input,{target:{files:[new File(['a'],'photo.png',{type:'image/png'})]}});
  fireEvent.click(screen.getByRole('button',{name:'Send photo'}));
  await screen.findByRole('alert');expect(sent).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Retry'}));
  await waitFor(()=>expect(sent).toHaveBeenCalledTimes(1));
  expect(sendPhoto.mock.calls[1][1]).toBe(sendPhoto.mock.calls[0][1]);
 });
 it('rejects videos and oversized images before any upload',()=>{
  const sendPhoto=vi.fn();render(<ChatPhotoUpload repository={{sendPhoto} as unknown as SupabaseTripRoomRepository} locale="en" roomId="room" disabled={false} onSent={()=>{}}/>);
  fireEvent.change(screen.getByLabelText('Add photo',{selector:'input'}),{target:{files:[new File(['video'],'test.mp4',{type:'video/mp4'})]}});
  expect(screen.getByRole('alert')).toHaveTextContent('Maximum 5MB');expect(sendPhoto).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Remove'}));
  const large=new File(['a'],'large.png',{type:'image/png'});Object.defineProperty(large,'size',{value:5242881});
  fireEvent.change(screen.getByLabelText('Add photo',{selector:'input'}),{target:{files:[large]}});
  expect(screen.getByRole('alert')).toBeVisible();expect(sendPhoto).not.toHaveBeenCalled();
 });
});
