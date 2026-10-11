import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {CastleBackdrop} from './CastleBackdrop.js';
import {validRoomMasonry} from './RoomMasonryPreview.js';
describe('compiled room masonry preview',()=>{
 it('shows tread and handrail geometry for either stair direction within the room clip',()=>{
  for(const [from,to] of [[{x:144,y:704},{x:864,y:512}],[{x:864,y:704},{x:144,y:512}]]){
   const markup=renderToStaticMarkup(createElement(CastleBackdrop,{roomId:'room_002',width:1024,height:1536,tileSize:32,background:null,stairFlights:[{from:from!,to:to!,thickness:32}]}));
   expect(markup.match(/data-stair-tread=/g)).toHaveLength(32);
   expect(markup).toContain('data-stair-handrail="0"');
   expect(markup).toContain('overflow="hidden"');
  }
 });
 it('preserves the middle doorway gap rather than repainting the complete wall',()=>{
  const masonryRects=[{name:'ShellLeftUpper',x:0,y:0,width:32,height:576},{name:'ShellLeftSegment_1',x:0,y:704,width:32,height:768}];
  const markup=renderToStaticMarkup(createElement(CastleBackdrop,{roomId:'room_002',width:1024,height:1536,tileSize:32,background:null,masonryRects}));
  expect(markup).toContain('overflow="hidden"');
  expect(markup).toContain('data-masonry-body="ShellLeftUpper"');
  expect(markup).toContain('y="704" width="32" height="768"');
  expect(markup).not.toContain('height="1536" fill="#090c14"');
 });
 it('rejects out-of-room or nonfinite solids from project data',()=>{
  const valid={name:'MasonryRoof_0',x:0,y:0,width:768,height:384};
  expect(validRoomMasonry([valid],1024,768)).toBe(true);
  for(const invalid of [{...valid,width:1025},{...valid,y:-1},{...valid,height:NaN}])expect(validRoomMasonry([invalid],1024,768)).toBe(false);
 });
});
