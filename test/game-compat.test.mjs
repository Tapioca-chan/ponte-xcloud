import test from 'node:test';
import assert from 'node:assert/strict';
import {needsXboxDialogCompatibility} from '../src/game-compat.mjs';

test('the Xbox system-dialog compatibility experiment is limited to Metro Exodus',()=>{
 assert.equal(needsXboxDialogCompatibility('Metro Exodus'),true);
 assert.equal(needsXboxDialogCompatibility('METRO EXODUS Gold Edition'),true);
 assert.equal(needsXboxDialogCompatibility('Marvel Rivals'),false);
 assert.equal(needsXboxDialogCompatibility('Metro 2033 Redux'),false);
 assert.equal(needsXboxDialogCompatibility('Other game'),false);
 assert.equal(needsXboxDialogCompatibility(undefined),false);
});
