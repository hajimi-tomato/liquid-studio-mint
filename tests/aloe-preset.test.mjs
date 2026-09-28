import test from 'node:test';
import assert from 'node:assert/strict';
import {aloeField,ALOE_SETTINGS} from '../dist/aloe-preset.js';
test('aloe rubbing covers the image continuously without isolated sparse rings',()=>{const w=320,h=240,f=aloeField(w,h);let painted=0;for(let i=0;i<f.length;i+=4)if(f[i]>12)painted++;assert.ok(painted/(w*h)>.65);assert.equal(ALOE_SETTINGS.saturation,0);assert.equal(ALOE_SETTINGS.hue,0);});
