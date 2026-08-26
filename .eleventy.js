module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/staticwebapp.config.json");
  eleventyConfig.addPassthroughCopy("src/manifest.webmanifest");
  // sw.js is no longer copied — it is generated from src/sw.njk so its
  // precache list can be derived rather than hand-maintained. It still lands at
  // the site root, which a service worker requires: one served from /assets/
  // could only ever control /assets/.

  return {
    htmlTemplateEngine: "njk",
    dir: {
      input: "src",
      output: "_site",
    },
  };
};
