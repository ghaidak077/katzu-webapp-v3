# Temporary one-off: move a screen's Arabic literals into the dictionary.
#
# Two shapes are handled automatically, because they are the only two that can be
# rewritten without guessing at context:
#   1. a quoted string literal  'AR' / "AR"   -> t('key')  (attributes get braces)
#   2. a JSX text node          >AR<          -> >{t('key')}<
# Anything else (an interpolation, a template literal, a sentence split round a
# variable) is listed as "missing" and gets an explicit `manual` pair instead.
import io
import json
import re
import sys

spec = json.load(io.open(sys.argv[1], encoding='utf-8'))
path = spec['file']
src = io.open(path, encoding='utf-8').read()

for pair in spec.get('manual', []):
    old, new = pair[0], pair[1]
    allow_multiple = len(pair) > 2 and pair[2]
    if src.count(old) != 1 and not allow_multiple:
        print('MANUAL CHECK', src.count(old), old[:60])
    src = src.replace(old, new)

if spec.get('imports'):
    anchor = spec['imports_after']
    assert src.count(anchor) == 1, ('imports anchor', src.count(anchor))
    src = src.replace(anchor, anchor + '\n' + spec['imports'], 1)

if spec.get('anchor'):
    anchor = spec['anchor']
    assert src.count(anchor) == 1, ('anchor', src.count(anchor))
    src = src.replace(anchor, anchor + '\n' + spec['hook'], 1)

missing = []
for entry in spec['entries']:
    ar, key = entry['ar'], entry['key']
    if entry.get('table_only'):
        continue
    call = "t('%s')" % key
    if entry.get('vars'):
        call = "t('%s', %s)" % (key, entry['vars'])
    done = False
    attr = '="' + ar + '"'
    if attr in src:
        src = src.replace(attr, '={' + call + '}')
        done = True
    for quote in ("'", '"'):
        literal = quote + ar + quote
        if literal in src and not done:
            src = src.replace(literal, call)
            done = True
    # A JSX text node: `>text<` with no braces or tags inside it.
    pattern = re.compile(r'>(\s*)' + re.escape(ar) + r'(\s*)<')
    if pattern.search(src):
        src = pattern.sub(lambda m: '>' + m.group(1) + '{' + call + '}' + m.group(2) + '<', src)
        done = True
    if not done:
        missing.append(key)

src = re.sub(r"(\s[a-zA-Z-]+)=t\(", r"\1={t(", src)
io.open(path, 'w', encoding='utf-8').write(src)

TABLES = {
    'ar': ('src/lib/i18n/strings/ar.ts', '} as const;'),
    'en': ('src/lib/i18n/strings/en.ts', '};'),
    'id': ('src/lib/i18n/strings/id.ts', '};'),
}

for lang, (table_path, closing) in TABLES.items():
    text = io.open(table_path, encoding='utf-8').read()
    body = ''
    for entry in spec['entries']:
        value = entry[lang].replace('\\', '\\\\').replace("'", "\\'")
        body += "  '%s': '%s',\n" % (entry['key'], value)
    idx = text.rfind('\n' + closing)
    text = text[:idx] + '\n' + body.rstrip('\n') + text[idx:]
    io.open(table_path, 'w', encoding='utf-8').write(text)

print('migrated', len(spec['entries']), 'entries; missing:', missing)
