// Normalize the Microsoft Xbox Cloud catalogue and visual product metadata.
// The cloud service returns stream titleIds; the Game Pass catalog supplies
// user-facing names and pictures. Keep titleId for game streaming (not productId).
export function safeCatalogImage(value) {
  if (typeof value !== 'string' || !value) return '';
  const raw = value.startsWith('//') ? 'https:' + value : value.startsWith('http://') ? 'https://' + value.slice(7) : value;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase();
    if (!(
      host.endsWith('.microsoft.com') ||
      host.endsWith('.xbox.com') || host === 'xbox.com' ||
      host.endsWith('.xboxlive.com') ||
      host.endsWith('.s-microsoft.com')
    )) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function gameCard(title, product) {
  const d = title && typeof title.details === 'object' && title.details ? title.details : {};
  const p = product && typeof product === 'object' ? product : {};
  const titleId = String(title?.titleId || title?.id || '').slice(0, 150);
  const productId = String(d.productId || '').slice(0, 40);
  // Unlike the stream titleId, details.xboxTitleId is the decimal Xbox
  // Services ID used by the achievements API.
  const candidate = String(d.xboxTitleId ?? '');
  const xboxTitleId = /^\d{1,12}$/.test(candidate) ? candidate : '';
  const name = String(p.ProductTitle || d.name || d.title || title?.title || titleId || 'Sem título').slice(0, 150);
  const tile = safeCatalogImage(p.Image_Tile?.URL || p.Image_Poster?.URL || p.Image_Hero?.URL);
  const hero = safeCatalogImage(p.Image_Hero?.URL || p.Image_Poster?.URL || p.Image_Tile?.URL);
  const genre = Array.isArray(p.LocalizedCategories) ? p.LocalizedCategories.slice(0, 2).filter(x => typeof x === 'string').join(' • ') : '';
  return {
    titleId, xboxTitleId, productId, name, tile, hero,
    description: String(p.ProductDescription || '').slice(0, 380),
    genre: genre.slice(0, 90),
    publisher: String(p.PublisherName || '').slice(0, 80),
    // A cloud entitlement may come from Game Pass or a purchase. It DOES NOT
    // prove permanent ownership. Missing entitlement information is unknown.
    accessible: typeof d.hasEntitlement === 'boolean' ? d.hasEntitlement : null,
    controller: Array.isArray(d.supportedInputTypes)
      ? d.supportedInputTypes.some(x => /controller|gamepad/i.test(String(x))) : true
  };
}
