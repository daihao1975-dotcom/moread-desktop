import { t } from './i18n.js';
import { slug } from './render.js';

// Keep first launch lightweight; the complete example remains available in the sidebar/menu.
export const welcome = () => `# ${t('welcome.title')}

${t('welcome.intro')}

- ${t('welcome.keys')}
- ${t('welcome.views')}
- ${t('welcome.help')}
- ${t('welcome.sample')}

${t('side.footer')}
`;

// Mermaid labels are quoted so translated text never changes the diagram syntax.
const label = key => '"' + t(key).replace(/"/g, "'") + '"';

export const sample = () => `# ${t('welcome.title')}

> ${t('sample.lead')}

## ${t('sample.startH')}

${t('sample.startP')}

- [x] ${t('sample.task1')}
- [x] ${t('sample.task2')}
- [ ] ${t('sample.task3')}

> [!TIP]
> ${t('sample.tip')}

## ${t('sample.textH')}

${t('sample.textP')}

*[HTML]: ${t('sample.abbr')}

${t('sample.term')}
: ${t('sample.termDef')}

${t('sample.footnoteP')}[^note]

[^note]: ${t('sample.footnote')}

## ${t('sample.tableH')}

| ${t('sample.colView')} | ${t('sample.colUse')} | ${t('sample.colKey')} |
| :--- | :--- | :---: |
| ${t('mode.read')} | ${t('sample.useRead')} | ⌘/Ctrl + 1 |
| ${t('mode.source')} | ${t('sample.useSource')} | ⌘/Ctrl + 2 |
| ${t('mode.split')} | ${t('sample.useSplit')} | ⌘/Ctrl + 3 |

\`\`\`javascript
const greeting = '${t('sample.greeting').replace(/'/g, "\\'")}';
function read(markdown) {
  return { content: markdown, offline: true };
}
console.log(greeting);
\`\`\`

## ${t('sample.mathH')}

${t('sample.mathP')}

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

$$
\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}
\\begin{pmatrix} x \\\\ y \\end{pmatrix}
= \\begin{pmatrix} ax+by \\\\ cx+dy \\end{pmatrix}
$$

## ${t('sample.diagramH')}

\`\`\`mermaid
flowchart LR
    A[${label('sample.flowOpen')}] --> B{${label('sample.flowChoose')}}
    B --> C[${label('sample.flowRead')}]
    B --> D[${label('sample.flowEdit')}]
    D --> E[${label('sample.flowSave')}]
\`\`\`

\`\`\`mermaid
sequenceDiagram
    participant R as ${t('sample.seqReader').replace(/[:;#\n]/g, ' ')}
    participant M as ${t('sample.seqApp').replace(/[:;#\n]/g, ' ')}
    R->>M: ${t('sample.seqOpen').replace(/[;#\n]/g, ' ')}
    M-->>R: ${t('sample.seqShow').replace(/[;#\n]/g, ' ')}
    R->>M: ${t('sample.seqSave').replace(/[;#\n]/g, ' ')}
    M-->>R: ${t('sample.seqWrite').replace(/[;#\n]/g, ' ')}
\`\`\`

## ${t('sample.moreH')}

<details><summary>${t('sample.summary')}</summary><p>${t('sample.details')}</p></details>

${t('sample.hr')}

---

${t('sample.images')}

[${t('sample.back')}](#${encodeURIComponent(slug(t('welcome.title')))}) · [${t('sample.reference')}](https://commonmark.org/help/)

> ${t('sample.end')}
`;
