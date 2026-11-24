# Temporary one-off: list the Arabic segments a file still carries.
import io
import re
import sys

SEG = re.compile('[\u0600-\u06FF][\u0600-\u06FF\u061F\u060C\u061B\u066B\u066C\\s«»…:!?().\u060C\\-]*')


def strip_comments(source):
    source = re.sub(r'/\*[\s\S]*?\*/', '', source)
    return re.sub(r'(^|[^:\\])//[^\n]*', r'\1', source)


for path in sys.argv[1:]:
    source = strip_comments(io.open(path, encoding='utf-8').read())
    seen = set()
    for index, line in enumerate(source.split('\n'), 1):
        for match in SEG.finditer(line):
            text = re.sub(r'\s+', ' ', match.group(0)).strip()
            if len(re.sub('[^\u0600-\u06FF]', '', text)) < 2:
                continue
            if text in seen:
                continue
            seen.add(text)
            print('%s\t%d\t%s\t%s' % (path.split('/')[-1], index, text, line.strip()[:110]))
    print('## %s %d' % (path, len(seen)))
