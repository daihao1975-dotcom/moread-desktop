#!/usr/bin/env python3
"""Collect license texts from production packages already present in the build environment."""
import json, os, pathlib, subprocess, struct
root = pathlib.Path(__file__).resolve().parents[1]
os.chdir(root)
chunks = ['MoRead third-party notices\n\nProduction JavaScript, Go modules and Go standard library.\n\nLicence elections and source offers:\n- DOMPurify is dual licensed (MPL-2.0 OR Apache-2.0); MoRead uses it under Apache-2.0.\n- elkjs is used unmodified under EPL-2.0 as part of the bundled diagram renderer. Its source code is available at https://github.com/kieler/elkjs (tag 0.9.3).\n- Other components are used unmodified under the licences reproduced below.\n']
paths = subprocess.check_output(['npm', 'ls', '--omit=dev', '--parseable', '--all'], cwd='frontend', text=True).splitlines()[1:]
def append_licenses(directory, title):
    chunks.append('\n' + '=' * 72 + '\n' + title + '\n')
    for f in sorted(directory.iterdir()):
        if f.is_file() and f.name.lower().startswith(('license', 'licence', 'copying', 'notice')):
            chunks.append(f.name + '\n' + f.read_text(errors='replace') + '\n')
for directory in sorted(set(paths)):
    d = pathlib.Path(directory)
    if not (d / 'package.json').exists():
        continue
    meta = json.loads((d / 'package.json').read_text())
    repo=meta.get('repository',{})
    source=repo.get('url','') if isinstance(repo,dict) else str(repo)
    append_licenses(d, str(meta.get('name')) + ' ' + str(meta.get('version')) + ' | ' + str(meta.get('license', 'See license below')) + '\nUpstream source: '+source)
modules = {}
for platform in ['darwin', 'windows']:
    env = dict(os.environ, GOOS=platform, CGO_ENABLED='0')
    raw = subprocess.check_output(['go', 'list', '-deps', '-json', '-tags', 'desktop,production', '.'], env=env, text=True)
    decoder = json.JSONDecoder()
    index = 0
    while index < len(raw):
        while index < len(raw) and raw[index].isspace():
            index += 1
        if index == len(raw):
            break
        package, index = decoder.raw_decode(raw, index)
        module = package.get('Module', {})
        if module and not module.get('Main'):
            modules[module['Path']] = module
for name, module in sorted(modules.items()):
    if module.get('Dir'):
        append_licenses(pathlib.Path(module['Dir']), name + ' ' + module.get('Version', ''))
fontStart = len(chunks)
chunks.append('\n'+'='*72+'\nKaTeX bundled fonts: original font metadata and SIL OFL 1.1\nOfficial license text: https://openfontlicense.org/documents/OFL.txt\nFonts are the unchanged WOFF2 files distributed with the locked KaTeX package. Corresponding TTF name records are reproduced below.\n')
for font in sorted((root/'frontend/node_modules/katex/dist/fonts').glob('*.ttf')):
    b=font.read_bytes();count=struct.unpack_from('>H',b,4)[0];tables={}
    for i in range(count):
        tag,_,offset,_=struct.unpack_from('>4sIII',b,12+i*16);tables[tag]=offset
    off=tables[b'name'];_,count,strings=struct.unpack_from('>HHH',b,off);records=set()
    for i in range(count):
        platform,encoding,language,nid,length,index=struct.unpack_from('>HHHHHH',b,off+6+i*12)
        if nid not in [0,13,14]:continue
        data=b[off+strings+index:off+strings+index+length]
        records.add((nid,data.decode('utf-16-be' if platform in [0,3] else 'latin1').replace('\\n','\n')))
    chunks.append('\n'+font.stem+' (TTF name metadata for corresponding WOFF2)\n')
    for nid,text in sorted(records):chunks.append('Name ID '+str(nid)+':\n'+text+'\n')
chunks.append('\n'+(root/'licenses/SIL-OFL-1.1.txt').read_text()+'\n')
(root/'frontend/src/font-notice.txt').write_text(''.join(chunks[fontStart:]))
goroot = pathlib.Path(subprocess.check_output(['go', 'env', 'GOROOT'], text=True).strip())
go_license = goroot / 'LICENSE'
if not go_license.exists():
    go_license = goroot.parent / 'LICENSE'
chunks.append('\nGo standard library\n' + go_license.read_text())
(root / 'THIRD_PARTY_NOTICES.txt').write_text(''.join(chunks))
print('Collected production notices:', len(''.join(chunks).encode()), 'bytes')
