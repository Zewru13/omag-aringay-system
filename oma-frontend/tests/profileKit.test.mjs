import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The pieces every profile screen is drawn with (staff, farmer, fisherfolk, organization): one hero, one card, one field.
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const kit = read('src/components/Profile/ProfileKit.jsx')
for (const name of ['ProfileHero', 'InfoCard', 'FieldItem', 'SectionTitle', 'AvatarBox', 'withChipIcons']) {
  ok(new RegExp(`export (function|const) ${name}\\b`).test(kit), `${name} is part of the kit`)
}
ok(/accent = '#1B4D2E'/.test(kit) && /soft = '#EBF5EE'/.test(kit), 'the hero and the cards are green by default and take another colour (the fisheries blue)')
ok(/backgroundColor: accent/.test(kit), 'the band takes the accent')
ok(/actions &&/.test(kit) && /sm:mt-\[46px\]/.test(kit), 'the action icons sit below the band')
ok(/relative px-5 pb-5/.test(kit), 'the avatar is painted over the band')
ok(/aria-label="Upload a new photo"/.test(kit), 'an avatar can carry the camera button')
for (const tone of ['blue', 'green', 'purple', 'amber', 'orange', 'rose', 'slate']) ok(new RegExp(`${tone}:`).test(kit), `the ${tone} chip colour`)

ok(/summary \?\? countText/.test(read('src/components/UI/ViewSection.jsx')), 'a View card can show a line instead of a count')

// every profile draws with it
for (const file of ['src/pages/Farmers/FarmerProfileParts.jsx', 'src/pages/Profile/ProfilePage.jsx', 'src/pages/Fisheries/FisherfolkDetailPage.jsx', 'src/pages/Organizations/OrganizationDetailPage.jsx']) {
  ok(/components\/Profile\/ProfileKit\.jsx/.test(read(file)), `${file} uses the shared kit`)
}

console.log(`profileKit: ${n} checks passed`)
