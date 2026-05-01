const fs = require("fs");

const extraTag = "Ani's Plugins";
const reposMeta = JSON.parse(fs.readFileSync("./meta.json", "utf8"));
const final = [];

function normalizeRepoManifest(repo, url) {
  if (Array.isArray(repo)) {
    return repo;
  }

  if (repo && typeof repo === "object" && typeof repo.InternalName === "string") {
    return [repo];
  }

  throw new Error(`Expected ${url} to contain a plugin object or plugin array`);
}

async function recoverPlugin(internalName) {
  if (!fs.existsSync("./repo.json")) {
    console.error("!!! Tried to recover plugin when repo isn't generated");
    process.exit(1);
  }

  const oldRepo = JSON.parse(fs.readFileSync("./repo.json", "utf8"));
  const plugin = oldRepo.find((x) => x.InternalName === internalName);
  if (!plugin) {
    console.error(`!!! ${plugin} not found in old repo`);
    process.exit(1);
  }

  final.push(plugin);
  console.log(`Recovered ${internalName} from last manifest`);
}

async function doRepo(url, plugins) {
  console.log(`Fetching ${url}...`);
  const sourceUrl = new URL(url);
  const rawGithubMatch = sourceUrl.hostname === "raw.githubusercontent.com"
    ? sourceUrl.pathname.match(/^\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/)
    : null;
  const fetchUrl = rawGithubMatch
    ? new URL(`https://api.github.com/repos/${rawGithubMatch[1]}/${rawGithubMatch[2]}/contents/${rawGithubMatch[4]}?ref=${rawGithubMatch[3]}`)
    : sourceUrl;

  const res = await fetch(fetchUrl, {
    headers: {
      "accept": "application/vnd.github.raw+json",
      "cache-control": "no-cache",
      "pragma": "no-cache",
      "user-agent": "AnisPlugins/1.0.0",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }

  const repo = normalizeRepoManifest(await res.json(), url);

  for (const internalName of plugins) {
    const plugin = repo.find((x) => x.InternalName === internalName);
    if (!plugin) {
      console.warn(`!!! ${plugin} not found in ${url}`);
      recoverPlugin(internalName);
      continue;
    }

    // Inject our custom tag
    const tags = plugin.Tags || [];
    tags.push(extraTag);
    plugin.Tags = tags;

    final.push(plugin);
  }
}

async function main() {
  for (const meta of reposMeta) {
    try {
      await doRepo(meta.repo, meta.plugins);
    } catch (e) {
      console.error(`!!! Failed to fetch ${meta.repo}`);
      console.error(e);
      for (const plugin of meta.plugins) {
        recoverPlugin(plugin);
      }
    }
  }

  fs.writeFileSync("./repo.json", JSON.stringify(final, null, 2));
  console.log(`Wrote ${final.length} plugins to repo.json.`);
}

main();
