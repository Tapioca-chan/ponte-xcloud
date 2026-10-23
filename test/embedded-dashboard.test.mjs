import test from 'node:test';
import assert from 'node:assert/strict';
import {mountEmbeddedDashboard} from '../src/embedded-dashboard.mjs';

test('embedded Xbox dashboard initializes all real login and playback controls', () => {
  const elements = new Map();
  class FakeElement {
    constructor(id) { this._id = id; this.onclick = null; this.disabled = false; this.hidden = false; this.textContent = ''; elements.set(id, this); }
    get id() { return this._id; }
    set id(newId) { elements.delete(this._id); this._id = newId; elements.set(newId, this); }
    set innerHTML(source) {
      for (const match of source.matchAll(/\bid="([^"]+)"/g)) new FakeElement(match[1]);
    }
    addEventListener() {}
  }
  new FakeElement('tv');
  for (const id of ['play', 'sound', 'fullscreen', 'stop']) new FakeElement(id);
  const handlers = Object.fromEntries(['play', 'sound', 'fullscreen', 'stop'].map(id => [id, () => {}]));
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = {
    getElementById(id) { return elements.get(id) || null; }
  };
  globalThis.window = { addEventListener() {} };
  try {
    const dashboard = mountEmbeddedDashboard({
      api: async () => { throw new Error('No live Microsoft call permitted by tests'); },
      QRCode: { toCanvas: async () => {} },
      status: () => {},
      notifyParent: () => {},
      handlers
    });
    assert.ok(dashboard);
    for (const id of ['login','verify','titles','play','sound','fullscreen','stop','code','games']) {
      assert.ok(elements.has(id), 'canonical player element '+id+' must exist');
      assert.equal(elements.has('embed-'+id), false, 'temporary ID should have been normalized');
    }
    for (const id of ['login','verify','titles','play','sound','fullscreen','stop']) {
      assert.equal(typeof elements.get(id).onclick, 'function', id+' must have an event handler');
    }
    // All game hub/favorite buttons must exist and be wired to REAL
    // stream handlers, not decorative mock buttons.
    for(const id of ['xb-hub-close','xb-hub-play','xb-hub-favorite','xb-filter-favorites']){
      assert.ok(elements.has(id),id+' must render');
      assert.equal(typeof elements.get(id).onclick,'function',id+' must have an action');
    }
    dashboard.ready();
    assert.equal(elements.get('login').disabled, false);
    assert.match(elements.get('xb-login-feedback').textContent, /Autorize/);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});


test('console-selected game survives Xbox login screen without inventing entitlement', () => {
 const elements = new Map();
 class FakeElement {
  constructor(id){this._id=id;this.onclick=null;this.disabled=false;this.hidden=false;this.textContent='';elements.set(id,this);}
  get id(){return this._id}
  set id(next){elements.delete(this._id);this._id=next;elements.set(next,this);}
  set innerHTML(markup){for(const match of markup.matchAll(/\bid="([^"]+)"/g))new FakeElement(match[1]);}
  addEventListener(){}
 }
 new FakeElement('tv');
 for(const id of ['play','sound','fullscreen','stop'])new FakeElement(id);
 const oldDocument=globalThis.document, oldWindow=globalThis.window, oldLocation=globalThis.location;
 globalThis.document={getElementById:(id)=>elements.get(id)||null};
 globalThis.window={addEventListener(){}};
 globalThis.location={search:'?embed=xbridge&game=Fortnite'};
 try{
  const instance=mountEmbeddedDashboard({
   api:async()=>{throw Error('No Xbox request during dashboard mount')},
   QRCode:{toCanvas:async()=>{}},status:()=>{},notifyParent:()=>{},
   handlers:{play(){},sound(){},fullscreen(){},stop(){}}
  });
  assert.ok(instance);
  assert.equal(elements.get('xb-requested-game').hidden,false);
  assert.match(elements.get('xb-requested-game').textContent,/Fortnite/);
  assert.equal(elements.get('xb-requested-game').textContent,'JOGO SELECIONADO NO CONSOLE: Fortnite');
  assert.equal(elements.get('play').disabled,false); // Original stream control retained.
 }finally{
  if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
  if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;
 }
});
