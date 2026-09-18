import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.js';
const gif = GIFEncoder();
let previous;
function encode(frame, delay) {
 const palette = quantize(frame.pixels, 256);
 const index = applyPalette(frame.pixels, palette);
 gif.writeFrame(index, frame.width, frame.height, {palette, delay: Math.max(20, delay), repeat: 0});
}
self.onmessage = ({data}) => {
 try {
  if(data.type === 'frame') {
   if(previous) encode(previous, data.time - previous.time);
   previous = data;
   self.postMessage({type:'ready'});
  } else if(data.type === 'finish') {
   if(previous) encode(previous, data.time - previous.time);
   gif.finish();
   const bytes = gif.bytes();
   self.postMessage({type:'done', bytes}, [bytes.buffer]);
  }
 } catch(error) { self.postMessage({type:'error', message:error.message}); }
};
