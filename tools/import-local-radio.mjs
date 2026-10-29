// Import the supplied Local Radio archive's data without executing its server or UI.
// Usage: node tools/import-local-radio.mjs path/to/extracted/ets2-local-radio-master
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { resolve, join } from 'node:path'
import vm from 'node:vm'
const source = resolve(process.argv[2] ?? '.local-radio-source/ets2-local-radio-master')
const target = resolve('ui/public/local-radio')
mkdirSync(target, { recursive: true })
const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } })
for (const file of ['cities/cities-ets2.js', 'stations/stations-europe.js']) {
  vm.runInContext(readFileSync(join(source, 'web', file), 'utf8'), context, { timeout: 5000 })
}
const data = vm.runInContext('JSON.stringify({cities, countries: country_properties, properties: city_properties, stations})', context)
writeFileSync(join(target, 'europe.json'), data)
cpSync(join(source, 'web/stations/images-europe'), join(target, 'stations/images-europe'), { recursive: true })
cpSync(join(source, 'web/lib/audio/whitestatic.mp3'), join(target, 'static.mp3'))
cpSync(join(source, 'LICENSE.md'), join(target, 'LICENSE.md'))
writeFileSync(join(target, 'NOTICE.md'), `# Local Radio\n\nData, station artwork and static audio imported from the user-supplied ets2-local-radio-master.zip.\nOriginal project: https://github.com/Koenvh1/ets2-local-radio\nContributors include Koen van Haren, Marcus and the station/map contributors listed in the original README.\nCovered by the Mozilla Public License 2.0 (LICENSE.md).\n\nThe WestPlay integration replaces the desktop server and web UI; reception logic is adapted in ui/src/cabin/apps/localRadio/reception.ts.\n`)
console.log(`Imported ${context.cities.length} transmitters and ${Object.values(context.stations).reduce((n, rows) => n + rows.length, 0)} stations.`)
