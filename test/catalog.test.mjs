import test from 'node:test';
import assert from 'node:assert/strict';
import { gameCard, safeCatalogImage } from '../src/catalog.mjs';

test('Xbox streaming uses the titleId but displays official store art and title', () => {
 const game=gameCard({titleId:'FORZAHORIZON5',details:{productId:'9NKX70BBCDRN',hasEntitlement:true}},
  {ProductTitle:'Forza Horizon 5',Image_Tile:{URL:'//store-images.s-microsoft.com/image/example'},PublisherName:'Xbox'});
 assert.equal(game.titleId,'FORZAHORIZON5');
 assert.equal(game.name,'Forza Horizon 5');
 assert.equal(game.tile,'https://store-images.s-microsoft.com/image/example');
 assert.equal(game.productId,'9NKX70BBCDRN');
 assert.equal(game.accessible,true);
});

test('Missing catalog metadata keeps Xbox original title without fake artwork', () => {
 const card=gameCard({titleId:'GEARS5',details:{productId:'9P4KMR76PLLQ',hasEntitlement:false}}, null);
 assert.equal(card.name,'GEARS5');assert.equal(card.tile,'');assert.equal(card.accessible,false);
});

test('Only known secure Microsoft image hosts are accepted', () => {
 assert.equal(safeCatalogImage('javascript:alert(1)'),'');
 assert.equal(safeCatalogImage('https://evil.example/cover.jpg'),'');
 assert.equal(safeCatalogImage('https://xbox.com.evil.example/cover.jpg'),'');
 assert.ok(safeCatalogImage('http://assets.play.xbox.com/image.png').startsWith('https://'));
});
