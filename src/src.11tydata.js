// Directory data file for every page in src/. Eleventy applies it to all
// templates in the folder, so the mechanical front matter each page used to
// repeat — layout, permalink, currentPage and the two auth redirects — is
// stated once here instead of nine times.
//
// A .js data file rather than .json because `index` needs special-casing:
// Eleventy gives it an empty fileSlug, which would otherwise yield a permalink
// of ".html" and a currentPage of "".
//
// Note the split. `layout` and `logoutRedirect` are plain defaults, which a
// page can override in its own front matter through normal data merging.
// The eleventyComputed keys are derived unconditionally and must NOT be set on
// a page: reading `data.permalink` from inside the function that computes
// `permalink` is a self-reference, which Eleventy rejects as circular.

const HOME_SLUG = 'home';

// "" for src/index.html, otherwise the filename without its extension.
const slugOf = (data) => data.page.fileSlug || '';

module.exports = {
  layout: 'base.html',

  // Sign-out goes home. list.html overrides this to stay put, since it is
  // readable signed out.
  logoutRedirect: '/',

  eleventyComputed: {
    // Flat URLs (/list.html), not Eleventy's default directory style
    // (/list/index.html) — every internal link, the auth route table in
    // staticwebapp.config.json and the service worker's precache list are all
    // written against the flat form.
    // `rawPermalink` is the escape hatch for non-page templates — sw.njk sets
    // it to sw.js. It has to be a differently named key: reading `permalink`
    // here would be a self-reference, which Eleventy rejects as circular.
    permalink: (data) => {
      if (data.rawPermalink) return data.rawPermalink;
      const slug = slugOf(data);
      return slug ? `${slug}.html` : 'index.html';
    },

    // Drives the aria-current="page" markers in the nav.
    currentPage: (data) => slugOf(data) || HOME_SLUG,

    // Where the header's sign-in links return to: the page you were on.
    loginRedirect: (data) => {
      const slug = slugOf(data);
      return slug ? `/${slug}.html` : '/';
    }
  }
};
