#!/usr/bin/env python3
"""Build data/jmdict-common.json from a jmdict-simplified "jmdict-eng-common" JSON release.

Usage: python3 tools/build_jmdict.py path/to/jmdict-eng-common-X.json

Source: https://github.com/scriptin/jmdict-simplified (JMdict by the Electronic
Dictionary Research and Development Group, CC BY-SA 4.0). See data/JMDICT-LICENSE.md.
"""
import json
from pathlib import Path
import sys

MAX_SENSES = 3
MAX_GLOSSES = 3


def forms(items):
    # A trailing * marks a form JMdict lists as common, so lookups prefer it.
    return [item['text'] + ('*' if item.get('common') else '') for item in items]


def main():
    source = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    entries = []
    for word in source['words']:
        senses = []
        for sense in word['sense']:
            glosses = [gloss['text'] for gloss in sense['gloss'] if gloss.get('lang') == 'eng'][:MAX_GLOSSES]
            if glosses:
                senses.append('; '.join(glosses))
            if len(senses) == MAX_SENSES:
                break
        if senses:
            # 1 marks words usually written in kana, preferred for kana-only lookups.
            usually_kana = int(any('uk' in sense.get('misc', []) for sense in word['sense'][:1]))
            # Everyday words have more senses and spellings; this breaks ties between homographs.
            richness = min(99, len(word['sense']) + len(word['kanji']))
            entries.append([forms(word['kanji']), forms(word['kana']), senses, usually_kana, richness])
    output = {
        'source': f"JMdict common words via jmdict-simplified {source['version']} ({source['dictDate']}), CC BY-SA 4.0",
        'entries': entries,
    }
    out = Path(__file__).resolve().parents[1] / 'data/jmdict-common.json'
    out.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{len(entries)} entries, {out.stat().st_size} bytes -> {out}')


if __name__ == '__main__':
    main()
