// Lancoli's typeface catalogue for the graphic editors (cover, wall lettering).
// The files are declared in fonts.css; a typeface is only downloaded when chosen.
//   family, weight, style: the font; stretch: the width, as a canvas keyword (ctx.fontStretch)
//   spacing: the tracking in em; upper: in capitals; line: the line height
//   LancoliFonts.css(typo, px) → the value of ctx.font; LancoliFonts.load(typo) → a promise
(() => {
    const T = (id, nom, family, weight, more = {}) => ({ id, nom, family, weight, style: 'normal', stretch: 'normal', spacing: -.04, upper: false, line: .92, ...more });
    const list = [
        { groupe: 'Titres', typos: [
            T('grotesk', 'Grasse serrée', 'Arial, "Helvetica Neue", sans-serif', 900, { spacing: -.06, upper: true, line: .9 }),
            T('grotesque', 'Grotesque à caractère', '"Bricolage Grotesque", Arial, sans-serif', 800, { stretch: 'condensed', line: .9 }),
            T('punk', 'Punk compact', '"Dela Gothic One", Arial, sans-serif', 400, { line: .95 }),
            T('elargi', 'Grotesque élargi', 'Archivo, Arial, sans-serif', 900, { stretch: 'expanded', spacing: -.05, line: .9 }),
            T('bloc', 'Bloc rond', 'Unbounded, Arial, sans-serif', 900, { spacing: -.05, line: .95 }),
            T('syne', 'Scène art', 'Syne, Arial, sans-serif', 800),
            T('large', 'Large, frontal', 'Anybody, Arial, sans-serif', 900, { stretch: 'extra-expanded', line: .9 }),
            T('etroit', 'Étroit, compressé', 'Anybody, Arial, sans-serif', 900, { stretch: 'extra-condensed', spacing: -.01, upper: true, line: .86 }),
            T('collage', 'Collage sauvage', 'Anton, Arial, sans-serif', 400, { spacing: -.005, upper: true, line: .9 }),
            T('concert', 'Affiche de concert', '"Alfa Slab One", Georgia, serif', 400, { spacing: -.03 })
        ] },
        { groupe: 'Affiche et pochoir', typos: [
            T('industriel', 'Affiche industrielle', '"Big Shoulders Display", Arial, sans-serif', 900, { spacing: -.005, upper: true, line: .84 }),
            T('pochoir', 'Pochoir', '"Big Shoulders Stencil Display", Arial, sans-serif', 900, { spacing: -.01, upper: true, line: .88 }),
            T('decoupe', 'Découpé main', '"Londrina Solid", Arial, sans-serif', 900, { spacing: -.02, upper: true, line: .9 })
        ] },
        { groupe: 'Brut', typos: [
            T('bombe', 'Bombe', '"Rubik Spray Paint", Arial, sans-serif', 400, { spacing: -.02, upper: true }),
            T('coulures', 'Coulures', '"Rubik Wet Paint", Arial, sans-serif', 400, { spacing: -.02, upper: true }),
            T('encre', 'Encre sale', '"Rubik Dirt", Arial, sans-serif', 400, { spacing: -.03 }),
            T('photocopie', 'Photocopie usée', '"Rubik Distressed", Arial, sans-serif', 400, { spacing: -.03 })
        ] },
        { groupe: 'Plume', typos: [
            T('serif', 'Serif italique', 'Georgia, "Times New Roman", serif', 400, { style: 'italic', line: 1 }),
            T('newsreader', 'Newsreader italique', 'Newsreader, Georgia, serif', 400, { style: 'italic', spacing: -.02, line: 1 }),
            T('instrument', 'Instrument Serif italique', '"Instrument Serif", Georgia, serif', 400, { style: 'italic', spacing: -.02, line: 1 }),
            T('spectral', 'Spectral italique', 'Spectral, Georgia, serif', 400, { style: 'italic', spacing: -.02, line: 1 }),
            T('fell', 'Imprimerie ancienne', '"IM Fell English", Georgia, serif', 400, { style: 'italic', spacing: -.01, line: 1 }),
            T('pica', 'Imprimerie, Pica', '"IM Fell DW Pica", Georgia, serif', 400, { style: 'italic', spacing: -.01, line: 1 })
        ] },
        { groupe: 'Machine à écrire', typos: [
            T('mono', 'Machine à écrire', 'ui-monospace, "Courier New", monospace', 700, { spacing: 0, upper: true, line: 1.05 }),
            T('elite', 'Special Elite', '"Special Elite", "Courier New", monospace', 400, { spacing: 0, line: 1.05 }),
            T('courier', 'Courier Prime italique', '"Courier Prime", "Courier New", monospace', 400, { style: 'italic', spacing: 0, line: 1.05 }),
            T('spacemono', 'Space Mono', '"Space Mono", ui-monospace, monospace', 400, { spacing: 0, line: 1.05 }),
            T('jetbrains', 'JetBrains Mono italique', '"JetBrains Mono", ui-monospace, monospace', 400, { style: 'italic', spacing: -.02, line: 1.05 }),
            T('plex', 'IBM Plex Mono italique', '"IBM Plex Mono", ui-monospace, monospace', 400, { style: 'italic', spacing: -.02, line: 1.05 }),
            T('dmmono', 'DM Mono italique', '"DM Mono", ui-monospace, monospace', 400, { style: 'italic', spacing: -.02, line: 1.05 })
        ] }
    ];
    const byId = new Map(list.flatMap((g) => g.typos).map((f) => [f.id, f]));
    const css = (f, px) => `${f.style === 'italic' ? 'italic ' : ''}${f.weight} ${px}px ${f.family}`;
    window.LancoliFonts = {
        groups: list,
        get: (id) => byId.get(id),
        css,
        load: (f) => (document.fonts ? document.fonts.load(css(f, 40)) : Promise.resolve()),
        // fills a <select>: one optgroup per typeface family
        fill(select, selected) {
            select.textContent = '';
            for (const g of list) {
                const og = document.createElement('optgroup');
                og.label = g.groupe;
                for (const f of g.typos) og.append(new Option(f.nom, f.id, false, f.id === selected));
                select.append(og);
            }
        }
    };
})();
