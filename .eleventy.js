module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/staticwebapp.config.json");
  eleventyConfig.addPassthroughCopy("src/manifest.webmanifest");
  // Must land at the site root: a service worker can only control URLs at or
  // below its own path, so /assets/sw.js could never control the pages.
  eleventyConfig.addPassthroughCopy("src/sw.js");

  return {
    htmlTemplateEngine: "njk",
    dir: {
      input: "src",
      output: "_site",
    },
  };
};
