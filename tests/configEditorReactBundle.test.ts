import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const entryId = 'virtual:config-editor-react-regression';
const resolvedEntryId = `\0${entryId}`;

const entrySource = `
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditorState, getDefaultExtensions } from '@uiw/react-codemirror';
import { yaml } from '@codemirror/lang-yaml';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { keymap } from '@codemirror/view';
import ConfigSourceEditor from '@/features/config/components/ConfigSourceEditor';

const document = 'config-version: 8\\nserver:\\n  port: 8317\\n';

export function renderConfigEditor() {
  return renderToStaticMarkup(createElement(ConfigSourceEditor, {
    value: document,
    onChange() {},
    theme: 'light',
    editable: true,
    placeholder: 'YAML configuration',
  }));
}

export function createConfigEditorState() {
  const state = EditorState.create({
    doc: document,
    extensions: [
      ...getDefaultExtensions({
        theme: 'light',
        editable: true,
        placeholder: 'YAML configuration',
      }),
      yaml(),
      search(),
      highlightSelectionMatches(),
      keymap.of(searchKeymap),
    ],
  });
  return state.doc.toString();
}
`;

test('production config editor uses the application React dispatcher', async () => {
  const previousVersion = process.env.VERSION;
  process.env.VERSION = 'config-editor-react-regression';
  try {
    const result = await build({
      root,
      configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
      logLevel: 'silent',
      plugins: [
        {
          name: 'config-editor-react-regression-entry',
          resolveId(id) {
            if (id === entryId) return resolvedEntryId;
          },
          load(id) {
            if (id === resolvedEntryId) return entrySource;
          },
        },
      ],
      build: {
        write: false,
        copyPublicDir: false,
        minify: false,
        rolldownOptions: {
          input: entryId,
          preserveEntrySignatures: 'strict',
          output: { format: 'iife', name: 'ConfigEditorReactRegression' },
        },
      },
    });
    if ('on' in result) throw new Error('Expected a production bundle, not a build watcher');
    const outputs = Array.isArray(result) ? result : [result];
    const chunks = outputs
      .flatMap((output) => output.output)
      .filter((item) => item.type === 'chunk');
    expect(chunks).toHaveLength(1);

    const markup = new Function(
      `${chunks[0].code}\nreturn ConfigEditorReactRegression.renderConfigEditor();`
    )();
    expect(markup).toContain('cm-theme-light');

    const document = new Function(
      `${chunks[0].code}\nreturn ConfigEditorReactRegression.createConfigEditorState();`
    )();
    expect(document).toBe('config-version: 8\nserver:\n  port: 8317\n');

    const reactEntries = chunks[0].moduleIds.filter((id) =>
      id.replaceAll('\\', '/').endsWith('/react/index.js')
    );
    expect(reactEntries).toHaveLength(1);

    for (const name of ['state', 'view', 'language']) {
      const entryPaths = chunks[0].moduleIds.filter((id) =>
        id.replaceAll('\\', '/').endsWith(`/@codemirror/${name}/dist/index.js`)
      );
      expect(entryPaths).toHaveLength(1);
    }
  } finally {
    if (previousVersion === undefined) delete process.env.VERSION;
    else process.env.VERSION = previousVersion;
  }
}, 30_000);
