// Builds answer catalogs in content/catalogs/ from Wikidata. Run by hand, never at server start:
//   NODE_USE_ENV_PROXY=1 node scripts/catalogs.ts [id ...]
// Each entry is [name, value, fame, aliases]. Fame is how many Wikipedias have an article on it,
// which the game turns into obscurity (famous answers are common picks).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

interface Spec {
  id: string
  unit: string
  source: string
  /** SPARQL returning ?item ?itemLabel ?links ?aliases and, for numeric catalogs, ?value. */
  query: string
  /** Scale the raw value, e.g. people -> millions. */
  scale?: number
  /** Big catalogs time out as one query: run it once per part, replacing {PART}, and merge. */
  parts?: string[]
  /** Keep scientific labels (dinosaur genera are known by them). */
  keepLatin?: boolean
  /** Trailing words to drop from names, e.g. "Roquefort cheese" -> "Roquefort" (the full label stays an alias). */
  strip?: RegExp
  /** Items to leave out, as a WHERE pattern on ?item (fetched separately: a NOT EXISTS times out). */
  minus?: string
}

const ALIASES = `OPTIONAL { ?item skos:altLabel ?alias . FILTER(LANG(?alias) = "en") }`
const LABEL = `?item rdfs:label ?itemLabel . FILTER(LANG(?itemLabel) = "en")`
const GROUP = `GROUP BY ?item ?itemLabel ?links`
// Plants and fruit often carry their scientific name as the English label: prefer the common name.
const SELECT_NAMES = `SELECT ?item ?itemLabel ?links (SAMPLE(?taxon) AS ?latin) (SAMPLE(?common) AS ?commonName) (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)`
const COMMON = `OPTIONAL { ?item wdt:P225 ?taxon } OPTIONAL { ?item wdt:P1843 ?common . FILTER(LANG(?common) = "en") }`
// Name lists for Backroads prompts. Complete small sets (countries, elements, capitals,
// constellations) are already fully hand-written; these are the open-ended categories.
const names = (id: string, where: string, min: number, source: string, extra: Partial<Spec> = {}): Spec => ({
  id, unit: 'name', source, ...extra,
  query: `${SELECT_NAMES} WHERE { ${where} ?item wikibase:sitelinks ?links . FILTER(?links >= ${min}) ${LABEL} ${COMMON} ${ALIASES} } ${GROUP}`,
})

export const SPECS: Spec[] = [
  names('dog-breeds', '?item wdt:P31 wd:Q39367 .', 3, 'Wikidata dog breeds (Q39367)'),
  names('fruits', '?item wdt:P279+ wd:Q3314483 .', 5, 'Wikidata kinds of fruit (Q3314483)'),
  names('greek-gods', '?item wdt:P31/wdt:P279* wd:Q22989102 .', 4, 'Wikidata Greek deities (Q22989102)'),
  names('instruments', '?item wdt:P279+ wd:Q34379 .', 8, 'Wikidata musical instruments (Q34379)'),
  names('sports', '?item wdt:P31 wd:Q31629 .', 6, 'Wikidata types of sport (Q31629)'),
  names('cheeses', '?item wdt:P31/wdt:P279* wd:Q10943 .', 3, 'Wikidata cheeses (Q10943)', { strip: /\s+(PDO|PGI|AOC|cheese)$/i }),
  // Kinds of gemstone (ruby), not famous individual stones (the Hope Diamond).
  names('gemstones', '?item wdt:P279+ wd:Q83437 .', 3, 'Wikidata kinds of gemstone (Q83437)'),
  names('languages', '?item wdt:P31 wd:Q1288568 .', 15, 'Wikidata modern languages (Q1288568)'),
  // Birds are dinosaurs too, but nobody means a sparrow: leave the bird class out.
  names('dinosaurs', '?item wdt:P105 wd:Q34740 ; wdt:P171+ wd:Q430 .', 4,
    'Wikidata non-avian dinosaur genera (Q430)', { keepLatin: true, minus: '?item wdt:P105 wd:Q34740 ; wdt:P171+ wd:Q5113 .' }),
  names('vegetables', '?item wdt:P279+ wd:Q11004 .', 5, 'Wikidata kinds of vegetable (Q11004)'),
  names('board-games', '?item wdt:P31 wd:Q131436 .', 4, 'Wikidata board games (Q131436)'),
  names('birds', '?item wdt:P105 wd:Q7432 ; wikibase:sitelinks ?l0 . FILTER(?l0 >= 25) ?item wdt:P171+ wd:Q5113 .', 25, 'Wikidata bird species (Q5113)'),
]

/** Wikidata rate-limits (429) and times out (5xx) under load: retry with backoff. */
async function sparql(query: string, attempt = 1): Promise<Record<string, { value: string }>[]> {
  const res = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      accept: 'application/sparql-results+json',
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'blinker-content-builder/1.0 (https://github.com/kidev27/blinker)',
    },
    body: new URLSearchParams({ query }),
  })
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after')) * 1000 || 15_000 * attempt))
    return sparql(query, attempt + 1)
  }
  if (!res.ok) throw new Error(`Wikidata ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return ((await res.json()) as { results: { bindings: Record<string, { value: string }>[] } }).results.bindings
}

/** Wikidata labels are often lowercase ("telephone"); names in the game start with a capital. */
const tidy = (s: string) => s.trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase())
const usable = (s: string) => s.length >= 2 && s.length <= 40 && !/^Q\d+$/.test(s) && !/[()\[\]:;/]/.test(s)

async function build(spec: Spec) {
  const rows = []
  for (const part of spec.parts ?? ['']) {
    try {
      rows.push(...(await sparql(spec.query.replace('{PART}', part))))
    } catch (e) {
      // One slow part shouldn't sink the catalog; say which part is missing.
      console.warn(`${spec.id} [${part}]: ${(e as Error).message.slice(0, 80)}`)
    }
  }
  if (spec.minus) {
    const out = new Set((await sparql(`SELECT ?item WHERE { ${spec.minus} }`)).map((r) => r.item.value))
    rows.splice(0, rows.length, ...rows.filter((r) => !out.has(r.item.value)))
  }
  const byName = new Map<string, [string, number, number, string[]]>()
  for (const r of rows) {
    const label = tidy(r.itemLabel.value)
    // "Allium sativum" -> "Garlic": a scientific-name label gives way to the common name.
    const latin = !spec.keepLatin && r.latin?.value && r.latin.value.toLowerCase() === label.toLowerCase()
    const common = r.commonName?.value ? tidy(r.commonName.value) : undefined
    let name = latin ? common : label
    if (!name) continue
    if (spec.strip) while (spec.strip.test(name)) name = name.replace(spec.strip, '')
    if (!usable(name)) continue
    const value = spec.unit === 'name' ? 0 : Number(r.value?.value) * (spec.scale ?? 1)
    if (spec.unit !== 'name' && !(Number.isFinite(value) && value > 0)) continue
    const fame = Number(r.links.value)
    const aliases = [...(latin || name !== label ? [label] : []), ...(r.aliases?.value ?? '').split('|')]
      .map((a) => a.trim()).filter((a) => usable(a) && a.toLowerCase() !== name.toLowerCase())
    const prev = byName.get(name.toLowerCase())
    // Same name twice (e.g. two mountains called Dom): keep the better known one.
    if (!prev || prev[2] < fame) byName.set(name.toLowerCase(), [name, round(value), fame, aliases.slice(0, 8)])
  }
  const entries = [...byName.values()].sort((a, b) => b[2] - a[2])
  const file = fileURLToPath(new URL(`../content/catalogs/${spec.id}.json`, import.meta.url))
  const body = entries.map((e) => JSON.stringify(e)).join(',\n')
  writeFileSync(file, `{"id":${JSON.stringify(spec.id)},"unit":${JSON.stringify(spec.unit)},"source":${JSON.stringify(spec.source)},"built":${JSON.stringify(new Date().toISOString().slice(0, 10))},"entries":[\n${body}\n]}\n`)
  console.log(`${spec.id}: ${entries.length} entries`)
}

const round = (v: number) => (v >= 100 ? Math.round(v) : Number(v.toPrecision(3)))

const only = process.argv.slice(2)
for (const spec of SPECS.filter((s) => !only.length || only.includes(s.id))) {
  try {
    await build(spec)
  } catch (e) {
    console.error(`${spec.id}: ${(e as Error).message}`)
    process.exitCode = 1
  }
}
