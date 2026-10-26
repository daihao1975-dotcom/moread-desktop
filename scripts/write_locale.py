#!/usr/bin/env python3
"""Write one language file in the key order of en.json and report missing or unknown keys."""
import json, pathlib, sys
root = pathlib.Path(__file__).resolve().parents[1] / 'frontend/src/locales'
lang, table = sys.argv[1], json.loads(sys.stdin.read())
en = json.loads((root / 'en.json').read_text())
missing = [k for k in en if k not in table]
unknown = [k for k in table if k not in en]
if missing or unknown:
    sys.exit(f'{lang}: missing {missing} unknown {unknown}')
(root / f'{lang}.json').write_text(json.dumps({k: table[k] for k in en}, ensure_ascii=False, indent=2) + '\n')
print(lang, len(table))
