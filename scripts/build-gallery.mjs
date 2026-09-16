import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'collagemakernew';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCeriZNhPE5BrlxoPjBwbrWhq9NRI9LW9g';
const SITE_URL = 'https://tryelori.com';
const APP_STORE_URL = 'https://apps.apple.com/us/app/elori-photo-carousel-maker/id6759309696';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GALLERY_DIR = path.join(ROOT, 'gallery');
const PDFTOCAIRO_BIN = process.env.PDFTOCAIRO_BIN || 'pdftocairo';
const execFileAsync = promisify(execFile);

const html = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const slugify = (value) => String(value || 'template')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 64) || 'template';

const validHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch {
    return '';
  }
};

function decodeValue(value = {}) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return undefined;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

async function fetchCollection(collectionId) {
  const documents = [];
  let pageToken = '';

  do {
    const endpoint = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}`,
    );
    endpoint.searchParams.set('pageSize', '1000');
    endpoint.searchParams.set('key', API_KEY);
    if (pageToken) endpoint.searchParams.set('pageToken', pageToken);

    const response = await fetch(endpoint, { headers: { accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Firestore ${collectionId} request failed (${response.status}): ${await response.text()}`);
    }

    const payload = await response.json();
    for (const document of payload.documents || []) {
      documents.push({
        id: document.name.split('/').pop(),
        ...decodeFields(document.fields),
      });
    }
    pageToken = payload.nextPageToken || '';
  } while (pageToken);

  return documents;
}

const byContentOrder = (left, right) => {
  const order = (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0);
  if (order !== 0) return order;
  const date = String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
  return date || left.name.localeCompare(right.name);
};

function sanitizeTemplate(record) {
  const name = String(record.name || '').trim();
  const category = String(record.category || 'Popular').trim() || 'Popular';
  const keywords = Array.isArray(record.keywords)
    ? [...new Set(record.keywords.map((item) => String(item).trim()).filter(Boolean))]
    : [];
  const pages = Array.isArray(record.pages) ? record.pages.length : 0;
  const route = `${slugify(name)}--${record.id}`;

  return {
    id: record.id,
    name: name || 'Untitled template',
    category,
    keywords,
    thumbnail: validHttpUrl(record.thumbnailImageURL),
    isPaid: record.isPaid === true,
    sortOrder: Number(record.sortOrder) || 0,
    pageCount: Math.max(pages, 1),
    updatedAt: record.updatedAt || record.createdAt || null,
    route,
    url: `/gallery/template/${route}/`,
  };
}

function sanitizeBanner(record) {
  const route = `${slugify(record.name || record.title)}--${record.id}`;
  return {
    id: record.id,
    name: String(record.name || record.title || '').trim() || 'Featured collection',
    subheader: String(record.subheader || record.subtitle || '').trim(),
    thumbnail: validHttpUrl(record.thumbnailURL || record.imageURL),
    titlePDF: validHttpUrl(record.titlePDFURL),
    color: /^#[0-9a-f]{6}$/i.test(record.color || '') ? record.color : '#303628',
    sortOrder: Number(record.sortOrder) || 0,
    itemCount: Array.isArray(record.items) ? record.items.length : 0,
    items: Array.isArray(record.items)
      ? record.items.filter((item) => item && typeof item.id === 'string' && typeof item.type === 'string')
      : [],
    route,
    url: `/gallery/collection/${route}/`,
  };
}

async function renderCollectionTitle(collection, outputDirectory) {
  if (!collection.titlePDF) return collection;

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'elori-collection-title-'));
  const pdfPath = path.join(temporaryDirectory, `${collection.id}.pdf`);
  const outputPrefix = path.join(outputDirectory, collection.id);

  try {
    const response = await fetch(collection.titlePDF);
    if (!response.ok) throw new Error(`download failed (${response.status})`);
    await writeFile(pdfPath, Buffer.from(await response.arrayBuffer()));
    await execFileAsync(PDFTOCAIRO_BIN, [
      '-png',
      '-singlefile',
      '-transp',
      '-scale-to',
      '1600',
      pdfPath,
      outputPrefix,
    ]);
    return {
      ...collection,
      titleArtwork: `/gallery/assets/collection-titles/${collection.id}.png`,
    };
  } catch (error) {
    console.warn(`Could not render PDF title for ${collection.name}: ${error.message}`);
    return collection;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function sanitizeLibraryItem(record, type) {
  const name = String(record.name || '').trim() || `Elori ${type}`;
  const route = `${slugify(name)}--${record.id}`;
  const item = {
    id: record.id,
    type,
    name,
    image: validHttpUrl(record.imageURL),
    isPaid: record.isPaid === true,
    category: String(record.category || '').trim(),
    keywords: Array.isArray(record.keywords)
      ? [...new Set(record.keywords.map((keyword) => String(keyword).trim()).filter(Boolean))]
      : [],
    attribution: String(record.attribution || '').trim(),
    imageType: String(record.imageType || '').trim(),
    createdAt: record.createdAt || null,
    route,
    url: `/gallery/content/${type}/${route}/`,
  };

  if (type !== 'frame') return item;

  const rawAreas = Array.isArray(record.replaceableAreas) && record.replaceableAreas.length
    ? record.replaceableAreas
    : record.replaceableArea ? [record.replaceableArea] : [];
  return {
    ...item,
    placeholderBehindContent: record.placeholderBehindContent !== false,
    frameAreas: rawAreas.map((area) => ({
      x: Number(area.x) || 0,
      y: Number(area.y) || 0,
      width: Number(area.width) || 0,
      height: Number(area.height) || 0,
      rotation: Number(area.rotation) || 0,
      sampleImage: validHttpUrl(area.sampleImageURL || record.sampleImageURL),
    })).filter((area) => area.width > 0 && area.height > 0 && area.sampleImage),
  };
}

function pageShell({ title, description, canonical, body, image = `${SITE_URL}/assets/opengraph.png`, jsonLd = null, bodyClass = 'gallery-page', bodyStyle = '' }) {
  const structuredData = jsonLd
    ? `\n    <script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll('<', '\\u003c')}</script>`
    : '';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="apple-itunes-app" content="app-id=6759309696" />
    <title>${html(title)}</title>
    <meta name="description" content="${html(description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${html(canonical)}" />
    <meta name="theme-color" content="#181c14" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Elori" />
    <meta property="og:title" content="${html(title)}" />
    <meta property="og:description" content="${html(description)}" />
    <meta property="og:url" content="${html(canonical)}" />
    <meta property="og:image" content="${html(image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${html(title)}" />
    <meta name="twitter:description" content="${html(description)}" />
    <meta name="twitter:image" content="${html(image)}" />
    <link rel="icon" href="/assets/favicon.ico" sizes="any" />
    <link rel="icon" href="/assets/favicon.png" type="image/png" sizes="32x32" />
    <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/gallery/gallery.css" />${structuredData}
  </head>
  <body class="${html(bodyClass)}"${bodyStyle ? ` style="${html(bodyStyle)}"` : ''}>
    ${body}
  </body>
</html>
`;
}

function siteHeader(extraClass = '') {
  return `<header class="gallery-header${extraClass ? ` ${html(extraClass)}` : ''}">
      <a class="gallery-brand" href="/" aria-label="Elori home">Elori</a>
      <nav aria-label="Main navigation">
        <a aria-current="page" href="/gallery/">Gallery</a>
        <a class="header-app-link" href="${APP_STORE_URL}" target="_blank" rel="noopener">Get the app</a>
      </nav>
    </header>`;
}

function siteFooter() {
  return `<footer class="gallery-footer">
      <a class="gallery-brand" href="/">Elori</a>
      <div><a href="/faq/">FAQ</a><a href="/privacy-policy/">Privacy</a><a href="/terms-of-use/">Terms</a></div>
    </footer>`;
}

function templateCard(template) {
  const badges = [
    template.pageCount > 1 ? `<span class="template-badge template-pages">${template.pageCount} pages</span>` : '',
  ].filter(Boolean).join('');
  const media = template.thumbnail
    ? `<img src="${html(template.thumbnail)}" alt="${html(template.name)} collage template preview" loading="lazy" width="540" height="720" />`
    : '<span class="template-fallback" aria-hidden="true"></span>';

  return `<a class="template-card${template.pageCount > 1 ? ' is-multipage' : ''}" href="${html(template.url)}">
          <span class="template-art"><span class="template-media">${media}</span>${badges}</span>
          <span class="template-name">${html(template.name)}</span>
        </a>`;
}

function bannerCard(banner, index) {
  const media = banner.thumbnail
    ? `<img src="${html(banner.thumbnail)}" alt="${html(banner.name)} collection" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} width="900" height="900" />`
    : '';
  return `<a class="collection-card" href="${html(banner.url)}" style="--collection-color:${html(banner.color)}" aria-label="Explore the ${html(banner.name)} collection">
          ${media}
          <span class="collection-shade"></span>
          <div class="collection-copy">
            ${banner.titleArtwork
              ? `<img class="collection-title-art" src="${html(banner.titleArtwork)}" alt="${html(banner.name)}" />`
              : `<h2>${html(banner.name)}</h2>`}
            ${banner.subheader ? `<p>${html(banner.subheader)}</p>` : ''}
          </div>
        </a>`;
}

function galleryPage(templates, banners) {
  const grouped = new Map();
  for (const template of templates) {
    if (!grouped.has(template.category)) grouped.set(template.category, []);
    grouped.get(template.category).push(template);
  }
  const categories = [...grouped.keys()].sort((left, right) => {
    if (left.toLowerCase() === 'popular') return -1;
    if (right.toLowerCase() === 'popular') return 1;
    return 0;
  });

  const bannerMarkup = banners.length
    ? `<section class="featured" aria-label="Featured collections">
        <div class="collection-row">${banners.map(bannerCard).join('')}</div>
      </section>`
    : '';

  const categoryMarkup = categories.map((category) => `<section class="template-section" aria-labelledby="category-${slugify(category)}">
        <div class="template-section-heading"><h2 id="category-${slugify(category)}">${html(category)}</h2></div>
        <div class="template-row">${grouped.get(category).map(templateCard).join('')}</div>
      </section>`).join('');

  const description = 'Explore Elori photo collage templates, from scrapbook stories and travel layouts to minimal photo carousels.';
  return pageShell({
    title: 'Photo Collage Template Gallery — Elori',
    description,
    canonical: `${SITE_URL}/gallery/`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Elori Template Gallery',
      description,
      url: `${SITE_URL}/gallery/`,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: templates.length,
        itemListElement: templates.map((template, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: template.name,
          url: `${SITE_URL}${template.url}`,
        })),
      },
    },
    body: `${siteHeader()}<main class="gallery-main">${bannerMarkup}${categoryMarkup}</main>${siteFooter()}`,
  });
}

function detailPage(template, related) {
  const keywordMarkup = template.keywords.length
    ? `<ul class="keyword-list" aria-label="Template keywords">${template.keywords.map((keyword) => `<li>${html(keyword)}</li>`).join('')}</ul>`
    : '';
  const relatedMarkup = related.length
    ? `<section class="related" aria-labelledby="related-title"><div class="template-section-heading"><h2 id="related-title">More in ${html(template.category)}</h2><a href="/gallery/#category-${slugify(template.category)}">View gallery</a></div><div class="template-row">${related.map(templateCard).join('')}</div></section>`
    : '';
  const description = `${template.name} is a ${template.category.toLowerCase()} photo collage template for Elori${template.keywords.length ? ` featuring ${template.keywords.slice(0, 4).join(', ')}` : ''}.`;
  const image = template.thumbnail || `${SITE_URL}/assets/opengraph.png`;
  const preview = template.thumbnail
    ? `<img src="${html(template.thumbnail)}" alt="${html(template.name)} collage template preview" width="540" height="720" fetchpriority="high" />`
    : '<span class="detail-fallback" aria-hidden="true"></span>';

  return pageShell({
    title: `${template.name} Photo Collage Template — Elori`,
    description,
    canonical: `${SITE_URL}${template.url}`,
    image,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: template.name,
      description,
      image: template.thumbnail || undefined,
      keywords: template.keywords.join(', '),
      genre: template.category,
      url: `${SITE_URL}${template.url}`,
      isPartOf: { '@type': 'WebSite', name: 'Elori', url: SITE_URL },
    },
    body: `${siteHeader()}<main class="detail-main">
      <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/gallery/">Gallery</a><span aria-hidden="true">/</span><span>${html(template.category)}</span></nav>
      <article class="template-detail">
        <div class="detail-preview${template.pageCount > 1 ? ' is-multipage' : ''}"><span class="detail-preview-media">${preview}</span></div>
        <div class="detail-copy">
          <h1>${html(template.name)}</h1>
          <p class="detail-description">Turn your photos into a continuous, aesthetic story with this ${html(template.category.toLowerCase())} collage template.</p>
          <dl class="template-meta"><div><dt>Pages</dt><dd>${template.pageCount}</dd></div><div><dt>Access</dt><dd>${template.isPaid ? 'Elori Pro' : 'Free'}</dd></div></dl>
          ${keywordMarkup}
          <a class="use-template-button" href="${APP_STORE_URL}" target="_blank" rel="noopener">Use this template in Elori</a>
        </div>
      </article>
      ${relatedMarkup}
    </main>${siteFooter()}`,
  });
}

function collectionItemCard(item) {
  const protectedPremium = item.isPaid && item.type !== 'template';
  const protectionAttributes = protectedPremium
    ? ' class="collection-item-art premium-content-protected" oncontextmenu="return false"'
    : ' class="collection-item-art"';
  let media = item.image
    ? `<img src="${html(item.image)}" alt="${html(item.name)} ${html(item.type)} preview" loading="lazy" />`
    : '<span class="collection-item-fallback" aria-hidden="true"></span>';

  if (item.type === 'frame' && item.image) {
    const areas = (item.frameAreas || []).map((area) => `<span class="frame-sample" style="left:${area.x * 100}%;top:${area.y * 100}%;width:${area.width * 100}%;height:${area.height * 100}%;transform:rotate(${area.rotation}deg);z-index:${item.placeholderBehindContent ? 1 : 3}"><img src="${html(area.sampleImage)}" alt="" loading="lazy" /></span>`).join('');
    media = `<span class="frame-preview">${areas}<img class="frame-overlay" src="${html(item.image)}" alt="${html(item.name)} frame preview" loading="lazy" /></span>`;
  }
  const body = `<span${protectionAttributes}>${media}</span>
          <span class="collection-item-name">${html(item.name)}</span>`;

  if (item.url) {
    return `<a class="collection-item-card collection-item-${html(item.type)}" href="${html(item.url)}">${body}</a>`;
  }
  return `<article class="collection-item-card">${body}</article>`;
}

function detailFramePreview(item) {
  const areas = (item.frameAreas || []).map((area) => `<span class="frame-sample" style="left:${area.x * 100}%;top:${area.y * 100}%;width:${area.width * 100}%;height:${area.height * 100}%;transform:rotate(${area.rotation}deg);z-index:${item.placeholderBehindContent ? 1 : 3}"><img src="${html(area.sampleImage)}" alt="" /></span>`).join('');
  return `<span class="frame-preview">${areas}<img class="frame-overlay" src="${html(item.image)}" alt="${html(item.name)} frame preview" /></span>`;
}

function contentDetailPage(item, related) {
  const typeLabels = { object: 'Sticker', background: 'Background', frame: 'Frame' };
  const typeLabel = typeLabels[item.type] || 'Content';
  const description = `${item.name} is ${item.isPaid ? 'a premium' : 'a free'} ${typeLabel.toLowerCase()} available in Elori${item.category ? ` in the ${item.category} category` : ''}.`;
  const preview = item.type === 'frame'
    ? detailFramePreview(item)
    : item.image
      ? `<img src="${html(item.image)}" alt="${html(item.name)} ${typeLabel.toLowerCase()} preview" fetchpriority="high" />`
      : '<span class="detail-fallback" aria-hidden="true"></span>';
  const metadata = [
    ['Type', typeLabel],
    item.category ? ['Category', item.category] : null,
    ['Access', item.isPaid ? 'Elori Pro' : 'Free'],
    item.imageType ? ['Format', item.imageType.toUpperCase()] : null,
    item.type === 'frame' ? ['Placeholders', String(item.frameAreas?.length || 0)] : null,
  ].filter(Boolean);
  const keywordMarkup = item.keywords.length
    ? `<ul class="keyword-list" aria-label="Content keywords">${item.keywords.map((keyword) => `<li>${html(keyword)}</li>`).join('')}</ul>`
    : '';
  const attributionMarkup = item.attribution
    ? `<p class="content-attribution"><span>Attribution</span>${html(item.attribution)}</p>`
    : '';
  const relatedMarkup = related.length
    ? `<section class="related content-related" aria-labelledby="related-content-title"><div class="template-section-heading"><h2 id="related-content-title">More ${typeLabel.toLowerCase()}s</h2><a href="/gallery/">View gallery</a></div><div class="collection-item-grid">${related.map(collectionItemCard).join('')}</div></section>`
    : '';

  return pageShell({
    title: `${item.name} ${typeLabel} — Elori`,
    description,
    canonical: `${SITE_URL}${item.url}`,
    image: item.image || `${SITE_URL}/assets/opengraph.png`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: item.name,
      description,
      image: item.image || undefined,
      keywords: item.keywords.join(', '),
      genre: item.category || typeLabel,
      url: `${SITE_URL}${item.url}`,
      isPartOf: { '@type': 'WebSite', name: 'Elori', url: SITE_URL },
    },
    body: `${siteHeader()}<main class="detail-main content-detail-main">
      <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/gallery/">Gallery</a><span aria-hidden="true">/</span><span>${html(typeLabel)}s</span></nav>
      <article class="template-detail content-detail">
        <div class="detail-preview content-preview content-preview-${html(item.type)}${item.isPaid ? ' premium-content-protected' : ''}"${item.isPaid ? ' oncontextmenu="return false"' : ''}><span class="detail-preview-media">${preview}</span></div>
        <div class="detail-copy">
          <h1>${html(item.name)}</h1>
          <p class="detail-description">${html(description)}</p>
          <dl class="template-meta content-meta">${metadata.map(([label, value]) => `<div><dt>${html(label)}</dt><dd>${html(value)}</dd></div>`).join('')}</dl>
          ${keywordMarkup}
          ${attributionMarkup}
          <a class="use-template-button" href="${APP_STORE_URL}" target="_blank" rel="noopener">Use in Elori</a>
        </div>
      </article>
      ${relatedMarkup}
    </main>${siteFooter()}`,
  });
}

function collectionPage(collection, items) {
  const description = collection.subheader
    || `Explore the ${collection.name} creative collection in Elori.`;
  const heroImage = collection.thumbnail || `${SITE_URL}/assets/opengraph.png`;
  const contentSections = [
    { type: 'object', title: 'Stickers' },
    { type: 'template', title: 'Templates' },
    { type: 'background', title: 'Backgrounds' },
    { type: 'frame', title: 'Frames' },
  ].map((section) => ({
    ...section,
    items: items.filter((item) => item.type === section.type),
  })).filter((section) => section.items.length > 0);
  const showSectionHeadings = contentSections.length > 1;
  const itemsMarkup = items.length
    ? `<section class="collection-contents" aria-label="Collection contents">
        ${contentSections.map((section) => `<section class="collection-content-section"${showSectionHeadings ? ` aria-labelledby="collection-section-${section.type}"` : ''}>
          ${showSectionHeadings ? `<div class="template-section-heading"><h2 id="collection-section-${section.type}">${section.title}</h2></div>` : ''}
          <div class="collection-item-grid">${section.items.map(collectionItemCard).join('')}</div>
        </section>`).join('')}
      </section>`
    : '';

  return pageShell({
    title: `${collection.name} Creative Collection — Elori`,
    description,
    canonical: `${SITE_URL}${collection.url}`,
    image: heroImage,
    bodyClass: 'gallery-page collection-page',
    bodyStyle: `--collection-page-bg:${collection.color}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${collection.name} — Elori`,
      description,
      image: collection.thumbnail || undefined,
      url: `${SITE_URL}${collection.url}`,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: items.length,
        itemListElement: items.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          ...(item.url ? { url: `${SITE_URL}${item.url}` } : {}),
        })),
      },
    },
    body: `${siteHeader('collection-header')}<main class="detail-main collection-detail-main">
      <section class="collection-hero" style="--collection-color:${html(collection.color)}">
        ${collection.thumbnail ? `<img src="${html(collection.thumbnail)}" alt="${html(collection.name)} collection" width="900" height="900" fetchpriority="high" />` : ''}
        <span class="collection-shade"></span>
        <div class="collection-hero-copy">
          ${collection.titleArtwork
            ? `<img class="collection-hero-title" src="${html(collection.titleArtwork)}" alt="${html(collection.name)}" />`
            : `<h1>${html(collection.name)}</h1>`}
          ${collection.subheader ? `<p>${html(collection.subheader)}</p>` : ''}
        </div>
      </section>
      ${itemsMarkup}
      <aside class="collection-cta"><h2>Use the complete ${html(collection.name)} collection in Elori.</h2><a class="use-template-button" href="${APP_STORE_URL}" target="_blank" rel="noopener">Open Elori on the App Store</a></aside>
    </main>${siteFooter()}`,
  });
}

function sitemap(templates, collections, contentItems = []) {
  const staticPaths = ['/', '/gallery/', '/faq/', '/privacy-policy/', '/terms-of-use/'];
  const urls = [
    ...staticPaths.map((item) => ({ loc: `${SITE_URL}${item}` })),
    ...templates.map((template) => ({
      loc: `${SITE_URL}${template.url}`,
      lastmod: template.updatedAt ? String(template.updatedAt).slice(0, 10) : '',
      image: template.thumbnail,
    })),
    ...collections.map((collection) => ({
      loc: `${SITE_URL}${collection.url}`,
      image: collection.thumbnail,
    })),
    ...contentItems.map((item) => ({
      loc: `${SITE_URL}${item.url}`,
      image: item.image,
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map((item) => `  <url>
    <loc>${html(item.loc)}</loc>${item.lastmod ? `\n    <lastmod>${html(item.lastmod)}</lastmod>` : ''}${item.image ? `\n    <image:image><image:loc>${html(item.image)}</image:loc></image:image>` : ''}
  </url>`).join('\n')}
</urlset>
`;
}

async function main() {
  const [rawTemplates, rawBanners, rawObjects, rawBackgrounds, rawFrames] = await Promise.all([
    fetchCollection('templates'),
    fetchCollection('contentCollections'),
    fetchCollection('objects'),
    fetchCollection('backgrounds'),
    fetchCollection('frames'),
  ]);
  const templates = rawTemplates.filter((item) => item.isActive !== false).map(sanitizeTemplate).sort(byContentOrder);
  const banners = rawBanners.filter((item) => item.isActive !== false).map(sanitizeBanner).sort(byContentOrder);
  const libraryItems = [
    ...templates.map((template) => ({ ...template, type: 'template', image: template.thumbnail })),
    ...rawObjects.filter((item) => item.isActive !== false).map((item) => sanitizeLibraryItem(item, 'object')),
    ...rawBackgrounds.filter((item) => item.isActive !== false).map((item) => sanitizeLibraryItem(item, 'background')),
    ...rawFrames.filter((item) => item.isActive !== false).map((item) => sanitizeLibraryItem(item, 'frame')),
  ];
  const contentItems = libraryItems.filter((item) => item.type !== 'template');
  const libraryByKey = new Map(libraryItems.map((item) => [`${item.type}:${item.id}`, item]));

  await rm(GALLERY_DIR, { recursive: true, force: true });
  await Promise.all([
    mkdir(path.join(GALLERY_DIR, 'template'), { recursive: true }),
    mkdir(path.join(GALLERY_DIR, 'collection'), { recursive: true }),
    ...['object', 'background', 'frame'].map((type) => (
      mkdir(path.join(GALLERY_DIR, 'content', type), { recursive: true })
    )),
    mkdir(path.join(GALLERY_DIR, 'assets', 'collection-titles'), { recursive: true }),
  ]);

  const renderedBanners = await Promise.all(banners.map((banner) => (
    renderCollectionTitle(banner, path.join(GALLERY_DIR, 'assets', 'collection-titles'))
  )));

  const css = await readFile(path.join(ROOT, 'src', 'gallery.css'), 'utf8');
  await Promise.all([
    writeFile(path.join(GALLERY_DIR, 'gallery.css'), css),
    writeFile(path.join(GALLERY_DIR, 'index.html'), galleryPage(templates, renderedBanners)),
    writeFile(path.join(ROOT, 'sitemap.xml'), sitemap(templates, renderedBanners, contentItems)),
  ]);

  await Promise.all(templates.map(async (template) => {
    const related = templates
      .filter((candidate) => candidate.id !== template.id && candidate.category === template.category)
      .slice(0, 8);
    const directory = path.join(GALLERY_DIR, 'template', template.route);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.html'), detailPage(template, related));
  }));

  await Promise.all(renderedBanners.map(async (banner) => {
    const items = banner.items
      .map((reference) => libraryByKey.get(`${reference.type}:${reference.id}`))
      .filter(Boolean);
    const directory = path.join(GALLERY_DIR, 'collection', banner.route);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.html'), collectionPage(banner, items));
  }));

  await Promise.all(contentItems.map(async (item) => {
    const related = contentItems
      .filter((candidate) => candidate.id !== item.id && candidate.type === item.type)
      .slice(0, 5);
    const directory = path.join(GALLERY_DIR, 'content', item.type, item.route);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'index.html'), contentDetailPage(item, related));
  }));

  console.log(`Generated ${templates.length} template pages, ${contentItems.length} content pages, ${banners.length} collection pages, and sitemap.xml.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
