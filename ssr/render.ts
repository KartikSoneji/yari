import fs from "fs";
import path from "path";
import { renderToString } from "react-dom/server";

import { ALWAYS_ALLOW_ROBOTS, BUILD_OUT_ROOT } from "../libs/env";

const { DEFAULT_LOCALE } = require("../libs/constants");

const dirname = __dirname;

// When there are multiple options for a given language, this gives the
// preferred locale for that language (language => preferred locale).
const PREFERRED_LOCALE = {
  pt: "pt-PT",
  zh: "zh-CN",
};

function htmlEscape(s) {
  if (!s) {
    return s;
  }
  return s
    .replace(/&/gim, "&amp;")
    .replace(/"/gim, "&quot;")
    .replace(/</gim, "&lt;")
    .replace(/>/gim, "&gt;")
    .replace(/'/gim, "&apos;");
}

function getHrefLang(locale, otherLocales) {
  // In most cases, just return the language code, removing the country
  // code if present (so, for example, 'en-US' becomes 'en').
  const hreflang = locale.split("-")[0];

  // Suppose the locale is one that is ambiguous, we need to fall back on a
  // a preferred one. For example, if the document is available in 'zh-CN' and
  // in 'zh-TW', we need to output something like this:
  //   <link rel=alternate hreflang=zh href=...>
  //   <link rel=alternate hreflang=zh-TW href=...>
  //
  // But other bother if both ambigious locale-to-hreflang are present.
  const preferred = PREFERRED_LOCALE[hreflang];
  if (preferred) {
    // e.g. `preferred===zh-CN` if hreflang was `zh`
    if (locale !== preferred) {
      // e.g. `locale===zh-TW`
      if (otherLocales.includes(preferred)) {
        // If the more preferred one was there, use the locale + region format.
        return locale;
      }
    }
  }
  return hreflang;
}

const lazy = (creator) => {
  let res;
  let processed = false;
  return (...args) => {
    if (processed) return res;
    res = creator.apply(this, ...args);
    processed = true;
    return res;
  };
};

const clientBuildRoot = path.resolve(dirname, "../../client/build");

const readBuildHTML = lazy(() => {
  let html = fs.readFileSync(path.join(clientBuildRoot, "index.html"), "utf-8");
  if (!html.includes('<div id="root"></div>')) {
    throw new Error(
      'The render depends on being able to inject into <div id="root"></div>'
    );
  }
  const scripts: string[] = [];
  const gaScriptPathName = getGAScriptPathName();
  if (gaScriptPathName) {
    scripts.push(`<script src="${gaScriptPathName}" defer=""></script>`);
  }

  html = html.replace('<meta name="SSR_SCRIPTS"/>', () => scripts.join(""));
  return html;
});

const getGAScriptPathName = lazy((relPath = "/static/js/ga.js") => {
  // Return the relative path if there exists a `BUILD_ROOT/static/js/ga.js`.
  // If the file doesn't exist, return falsy.
  // Remember, unless explicitly set, the BUILD_OUT_ROOT defaults to a path
  // based on `dirname` but that's wrong when compared as a source and as
  // a webpack built asset. So we need to remove the `/ssr/` portion of the path.
  let root = BUILD_OUT_ROOT;
  if (!fs.existsSync(root)) {
    root = root
      .split(path.sep)
      .filter((x) => x !== "ssr")
      .join(path.sep);
  }
  const filePath = relPath.split("/").slice(1).join(path.sep);
  if (fs.existsSync(path.join(root, filePath))) {
    return relPath;
  }
  return null;
});

const extractWebFontURLs = lazy(() => {
  const urls: string[] = [];
  const manifest = JSON.parse(
    fs.readFileSync(path.join(clientBuildRoot, "asset-manifest.json"), "utf-8")
  );
  for (const entrypoint of manifest.entrypoints) {
    if (!entrypoint.endsWith(".css")) continue;
    const css = fs.readFileSync(
      path.join(clientBuildRoot, entrypoint),
      "utf-8"
    );
    const generator = extractCSSURLs(
      css,
      (url) => url.endsWith(".woff2") && /Bold/i.test(url)
    );
    urls.push(...generator);
  }
  return urls;
});

function* extractCSSURLs(css, filterFunction) {
  for (const match of css.matchAll(/url\((.*?)\)/g)) {
    const url = match[1];
    if (filterFunction(url)) {
      yield url;
    }
  }
}

interface HydrationData {
  doc?: any;
  pageNotFound?: boolean;
  hyData?: any;
  pageTitle?: any;
  possibleLocales?: any;
  locale?: any;
  noIndexing?: any;
}

export default function render(
  renderApp,
  {
    doc = null,
    pageNotFound = false,
    hyData = null,
    pageTitle = null,
    possibleLocales = null,
    locale = null,
    noIndexing = null,
  }: HydrationData = {}
) {
  const buildHtml = readBuildHTML();
  const webfontURLs = extractWebFontURLs();
  const rendered = renderToString(renderApp);

  let canonicalURL = "https://developer.mozilla.org";

  let pageDescription = "";
  let escapedPageTitle = htmlEscape(pageTitle);

  const hydrationData: HydrationData = {};
  const translations: string[] = [];
  if (pageNotFound) {
    escapedPageTitle = `🤷🏽‍♀️ Page not found | ${escapedPageTitle}`;
    hydrationData.pageNotFound = true;
  } else if (hyData) {
    hydrationData.hyData = hyData;
  } else if (doc) {
    // Use the doc's title instead
    escapedPageTitle = htmlEscape(doc.pageTitle);
    canonicalURL += doc.mdn_url;

    if (doc.summary) {
      pageDescription = htmlEscape(doc.summary);
    }

    hydrationData.doc = doc;

    if (doc.other_translations) {
      const allOtherLocales = doc.other_translations.map((t) => t.locale);
      // Note, we also always include "self" as a locale. That's why we concat
      // this doc's locale plus doc.other_translations.
      const thisLocale = {
        locale: doc.locale,
        title: doc.title,
        url: doc.mdn_url,
      };
      for (const translation of [...doc.other_translations, thisLocale]) {
        const translationURL = doc.mdn_url.replace(
          `/${doc.locale}/`,
          () => `/${translation.locale}/`
        );
        // The locale used in `<link rel="alternate">` needs to be the ISO-639-1
        // code. For example, it's "en", not "en-US". And it's "sv" not "sv-SE".
        // See https://developers.google.com/search/docs/advanced/crawling/localized-versions?hl=en&visit_id=637411409912568511-3980844248&rd=1#language-codes
        translations.push(
          `<link rel="alternate" title=${htmlEscape(
            translation.title
          )} href="https://developer.mozilla.org${translationURL}" hreflang="${getHrefLang(
            translation.locale,
            allOtherLocales
          )}"/>`
        );
      }
    }
  }

  if (possibleLocales) {
    hydrationData.possibleLocales = possibleLocales;
  }

  const titleTag = `<title>${escapedPageTitle || "MDN Web Docs"}</title>`;
  const webfontTags = webfontURLs
    .map(
      (url) =>
        `<link rel="preload" as="font" type="font/woff2" href="${url}" crossorigin>`
    )
    .join("");

  const og = new Map([
    ["title", escapedPageTitle],
    ["url", canonicalURL],
    ["locale", locale || (doc && doc.locale) || "en-US"],
  ]);

  if (pageDescription) {
    og.set("description", pageDescription);
  }

  const root = `<div id="root">${rendered}</div><script type="application/json" id="hydration">${
    // https://html.spec.whatwg.org/multipage/scripting.html#restrictions-for-contents-of-script-elements
    JSON.stringify(hydrationData).replace(
      /<(?=!--|\/?script)/gi,
      String.raw`\u003c`
    )
  }</script>`;

  const robotsContent =
    !ALWAYS_ALLOW_ROBOTS ||
    (doc && doc.noIndexing) ||
    pageNotFound ||
    noIndexing
      ? "noindex, nofollow"
      : "index, follow";
  const robotsMeta = `<meta name="robots" content="${robotsContent}">`;
  const ssr_data = [...translations, ...webfontTags, robotsMeta];
  let html = buildHtml;
  html = html.replace(
    '<html lang="en"',
    () => `<html lang="${locale || DEFAULT_LOCALE}"`
  );
  html = html.replace(
    /<meta property="og:([^"]*)" content="([^"]*)"\/>/g,
    (_, typ, content) => {
      return `<meta property="og:${typ}" content="${og.get(typ) || content}"/>`;
    }
  );
  if (pageDescription) {
    html = html.replace(/<meta name="description" content="[^"]*"\/>/g, () => {
      return `<meta name="description" content="${pageDescription}"/>`;
    });
  }
  html = html.replace("<title>MDN Web Docs</title>", () => `${titleTag}`);

  if (!pageNotFound) {
    html = html.replace(
      '<link rel="canonical" href="https://developer.mozilla.org"/>',
      () => `<link rel="canonical" href="${canonicalURL}"/>`
    );
  }

  html = html.replace('<meta name="SSR_DATA"/>', () => ssr_data.join(""));
  html = html.replace('<div id="root"></div>', () => root);
  return html;
}