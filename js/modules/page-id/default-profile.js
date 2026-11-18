export function createLuxrajProfile() {
  return {
    version: 1,
    title: "Luxraj Blog",
    sourceRoot: "site",
    seoAttribute: "data-luxraj-seo",
    pageIdMetaName: "luxraj:page-id",
    pageIdPlaceholder: "{{PAGE_ID}}",
    rules: [
      { id: "home", label: "Homepage", match: "site/index.html", template: "site-home-00" },
      { id: "site-pages", label: "Site pages", match: "site/pages/{page}.html", template: "site-{page}-00" },
      { id: "main-landings", label: "Main landings", match: "site/categories/{category}/*-index.html", template: "main-landing-{category}-00" },
      { id: "sub-landings", label: "Sub-landings", match: "site/categories/{category}/{topic}/*-index.html", template: "sub-landing-{category}-{topic}-00" },
      { id: "articles", label: "Articles", match: "site/categories/{category}/{topic}/articles/{page}.html", template: "article-{category}-{topic}-{nn}",
        numbering: { start: 1, width: 2, step: 1, scope: "topic" } }
    ]
  };
}

export function cloneProfile(profile) {
  return JSON.parse(JSON.stringify(profile));
}
