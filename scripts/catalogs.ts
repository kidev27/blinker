// Builds answer catalogs in content/catalogs/ from Wikidata. Run by hand, never at server start:
//   NODE_USE_ENV_PROXY=1 node scripts/catalogs.ts [id ...]
// Each entry is [name, value, fame, aliases]. Fame is how many Wikipedias have an article on it,
// which the game turns into obscurity (famous answers are common picks).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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
  /** WordNet nouns under these synsets ("lemma" or "lemma.N") add names and synonyms Wikidata lacks. */
  wordnet?: string[]
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
  names('dog-breeds', '?item wdt:P31 wd:Q39367 .', 1, 'Wikidata dog breeds (Q39367) and WordNet', { wordnet: ['dog'] }),
  // Kinds of fruit, plus the plants that are the source of one (many fruits only exist as the plant).
  names('fruits', '{ ?item wdt:P279+ wd:Q3314483 } UNION { ?item wdt:P1672 ?f . ?f wdt:P279* wd:Q3314483 }', 1, 'Wikidata fruit and fruit plants, and WordNet', { wordnet: ['edible_fruit'] }),
  names('greek-gods', '?item wdt:P31/wdt:P279* wd:Q22989102 .', 1, 'Wikidata Greek deities (Q22989102) and WordNet', { wordnet: ['greek_deity'] }),
  names('instruments', '?item wdt:P279+ wd:Q34379 .', 2, 'Wikidata musical instruments (Q34379) and WordNet', { wordnet: ['musical_instrument'] }),
  names('sports', '?item wdt:P31 wd:Q31629 .', 2, 'Wikidata types of sport (Q31629)'),
  names('cheeses', '?item wdt:P31/wdt:P279* wd:Q10943 .', 1, 'Wikidata cheeses (Q10943) and WordNet', { strip: /\s+(PDO|PGI|AOC|cheese)$/i, wordnet: ['cheese'] }),
  // Kinds of gemstone (ruby), not famous individual stones (the Hope Diamond).
  names('gemstones', '?item wdt:P279+ wd:Q83437 .', 1, 'Wikidata kinds of gemstone (Q83437) and WordNet', { wordnet: ['gem.2'] }),
  names('languages', '?item wdt:P31 wd:Q1288568 .', 3, 'Wikidata modern languages (Q1288568) and WordNet', { wordnet: ['natural_language'] }),
  // Birds are dinosaurs too, but nobody means a sparrow: leave the bird class out.
  names('dinosaurs', '?item wdt:P105 wd:Q34740 ; wdt:P171+ wd:Q430 .', 1,
    'Wikidata non-avian dinosaur genera (Q430)', { keepLatin: true, minus: '?item wdt:P105 wd:Q34740 ; wdt:P171+ wd:Q5113 .' }),
  names('vegetables', '{ ?item wdt:P279+ wd:Q11004 } UNION { ?item wdt:P1672 ?f . ?f wdt:P279* wd:Q11004 }', 1, 'Wikidata vegetables and vegetable plants, and WordNet', { wordnet: ['vegetable'] }),
  names('board-games', '?item wdt:P31 wd:Q131436 .', 1, 'Wikidata board games (Q131436) and WordNet', { wordnet: ['board_game'] }),
  names('birds', '?item wdt:P105 wd:Q7432 ; wikibase:sitelinks ?l0 . FILTER(?l0 >= 8) ?item wdt:P171+ wd:Q5113 .', 8, 'Wikidata bird species (Q5113) and WordNet', { wordnet: ['bird'] }),
]

const source = (file: string) => fileURLToPath(new URL(`../content/sources/${file}`, import.meta.url))

/** Names Wikidata misses, from content/sources/<id>.txt: one "Name|alias|alias" per line. */
const extras = (id: string) =>
  existsSync(source(`${id}.txt`))
    ? readFileSync(source(`${id}.txt`), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('|').map((x) => x.trim()))
    : []

const WORDNET = fileURLToPath(new URL('../node_modules/wordnet-db/dict/', import.meta.url))
/** Latin binomials ("Acanthisitta chloris"): WordNet lists them beside the common name. */
const LATIN = /^[A-Z][a-z]+ [a-z]+$/

/**
 * WordNet, an English dictionary, as a second source: every noun under the given synsets. A synset
 * that shares a word with a catalog entry gives that entry its synonyms as aliases ("Chinese
 * gooseberry" for Kiwifruit); the rest become new entries, famous as their best-known word.
 */
async function addWordnet(roots: string[], byName: Map<string, [string, number, number, string[]]>) {
  const words = new Map<string, string[]>()
  const kids = new Map<string, string[]>()
  for (const line of readFileSync(WORDNET + 'data.noun', 'latin1').split('\n')) {
    if (!line || line.startsWith(' ')) continue
    const f = line.split(' ')
    const n = parseInt(f[3], 16)
    words.set(f[0], Array.from({ length: n }, (_, i) => f[4 + 2 * i].replace(/_/g, ' ').replace(/\(.*\)$/, '')))
    let i = 4 + 2 * n
    const pointers = Number(f[i++])
    for (let p = 0; p < pointers; p++, i += 4)
      if ((f[i] === '~' || f[i] === '~i') && f[i + 2] === 'n') kids.set(f[0], [...(kids.get(f[0]) ?? []), f[i + 1]])
  }
  const index = new Map(readFileSync(WORDNET + 'index.noun', 'latin1').split('\n').filter((l) => l && !l.startsWith(' ')).map((l) => {
    const f = l.split(' ')
    return [f[0], f.slice(6 + Number(f[3]))] as const // lemma -> synset offsets, most common sense first
  }))
  const seen = new Set<string>()
  const todo = roots.map((r) => { const [lemma, sense = '1'] = r.split('.'); return index.get(lemma)![Number(sense) - 1] })
  while (todo.length) for (const k of kids.get(todo.pop()!) ?? []) if (!seen.has(k)) seen.add(k), todo.push(k)
  const owner = new Map<string, string>() // any name or alias -> entry key
  for (const [k, e] of byName) for (const x of [e[0], ...e[3]]) owner.set(same(x), k)
  const fresh: string[][] = []
  for (const off of seen) {
    const names = words.get(off)!.filter((w) => usable(w) && !/\d/.test(w))
    const common = names.filter((w) => !LATIN.test(w) || names.length === 1)
    if (!common.length) continue
    const hit = common.map((w) => owner.get(same(w))).find(Boolean)
    if (hit) {
      const e = byName.get(hit)!
      e[3] = [...new Set([...e[3], ...common.filter((w) => w.toLowerCase() !== e[0].toLowerCase())])].slice(0, 12)
    } else fresh.push(common.map(tidy))
  }
  // Each new entry is named after its best-known word ("Kiwi", not "Chinese gooseberry").
  const fame = await fameOf(fresh.flat())
  for (const words of fresh) {
    const f = (w: string) => fame.get(w.toLowerCase()) ?? 0
    const [name, ...aliases] = [...words].sort((a, b) => f(b) - f(a))
    if (!byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), [name, 0, Math.max(1, f(name)), aliases])
  }
}

/** Fame (Wikipedias with an article) of things known only by name: the best known item with that label. */
async function fameOf(names: string[]) {
  const out = new Map<string, number>()
  for (let i = 0; i < names.length; i += 80) {
    // Wikidata labels vary in case ("Common ostrich", "Common Ostrich", "ostrich"): ask for each spelling.
    const spellings = (n: string) => [n, n.toLowerCase(), tidy(n.toLowerCase()), n.toLowerCase().replace(/\b\p{Ll}/gu, (c) => c.toUpperCase())]
    const values = [...new Set(names.slice(i, i + 80).flatMap(spellings))].map((n) => `${JSON.stringify(n)}@en`).join(' ')
    for (const r of await sparql(`SELECT ?n (MAX(?links) AS ?fame) WHERE { VALUES ?n { ${values} } ?item rdfs:label|wdt:P1843 ?n ; wikibase:sitelinks ?links . } GROUP BY ?n`)) {
      const k = r.n.value.toLowerCase()
      out.set(k, Math.max(out.get(k) ?? 0, Number(r.fame.value)))
    }
  }
  return out
}

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
/** Same name for merging: "Kiwi fruit" = "Kiwifruit". */
const same = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
/** Up to 12 aliases, shortest first (USA, US before U.S. of America), in a stable order build to build. */
const keep = (aliases: string[]) => [...new Set(aliases)].sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, 12)
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
    if (!prev || prev[2] < fame) byName.set(name.toLowerCase(), [name, round(value), fame, keep(aliases)])
  }
  // Extras: fame from Wikidata by name, 1 if it has no article anywhere.
  const more = extras(spec.id).map((n) => n.filter(Boolean))
  const fame = more.length ? await fameOf(more.map((n) => n[0])) : new Map()
  for (const [name, ...aliases] of more) if (!byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), [name, 0, fame.get(name.toLowerCase()) ?? 1, aliases])
  if (spec.wordnet?.length) await addWordnet(spec.wordnet, byName)
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
