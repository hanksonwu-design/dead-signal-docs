export const FRAGMENT_FORMS = ['物證', '聲證', '影證', '文證'];

export function fragmentLabel(label, forms = []) {
  const ordered = FRAGMENT_FORMS.filter(form => forms.includes(form));
  return ordered.length ? `${label}（${ordered.join('／')}）` : label;
}

export function readingCueGroups(items, categories) {
  return Object.keys(categories).flatMap(category => {
    const groups = new Map();
    for (const m of items.filter(m => m.category === category)) {
      const forms = FRAGMENT_FORMS.filter(form => (m.fragmentForms || []).includes(form));
      const key = forms.join('/');
      if (!groups.has(key)) groups.set(key, {category, forms, matches: []});
      groups.get(key).matches.push(m);
    }
    return [...groups.values()];
  });
}
