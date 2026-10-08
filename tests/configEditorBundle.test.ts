import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const entryId = 'virtual:config-editor-regression';
const resolvedEntryId = `\0${entryId}`;

// Build through the application's resolver: direct Bun imports do not apply Vite deduplication.
const entrySource = `
import { EditorState, getDefaultExtensions } from '@uiw/react-codemirror';
import { Text } from '@codemirror/state';
import { yaml } from '@codemirror/lang-yaml';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { EditorView, keymap } from '@codemirror/view';
import { Chunk } from '@codemirror/merge';

export function exerciseConfigEditor() {
  const document = 'config-version: 8\\nserver:\\n  port: 8317\\n';
  const themes = ['light', 'dark'].map((theme) => {
    const state = EditorState.create({
      doc: document,
      extensions: [
        ...getDefaultExtensions({
          theme,
          editable: false,
          placeholder: 'YAML configuration',
          basicSetup: { autocompletion: false, completionKeymap: false },
        }),
        yaml(),
        search(),
        highlightSelectionMatches(),
        keymap.of(searchKeymap),
      ],
    });
    const updated = state.update({ changes: { from: document.indexOf('8317'), to: document.indexOf('8317') + 4, insert: '8318' } }).state;
    return { theme, document: updated.doc.toString(), editable: state.facet(EditorView.editable) };
  });
  const chunks = Chunk.build(Text.of(['port: 8317']), Text.of(['port: 8318']));
  return { themes, diffCount: chunks.length };
}
`;

test('production config editor shares CodeMirror instances across YAML, UIW, search, and diff', async () => {
  const previousVersion = process.env.VERSION;
  // Avoid the config's optional Git version probe when running on Windows.
  process.env.VERSION = 'config-editor-regression';
  try {
    const result = await build({
      root,
      configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
      logLevel: 'silent',
      plugins: [
        {
          name: 'config-editor-regression-entry',
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
          output: { format: 'iife', name: 'ConfigEditorRegression' },
        },
      },
    });
    if ('on' in result) throw new Error('Expected a production bundle, not a build watcher');
    const outputs = Array.isArray(result) ? result : [result];
    const chunks = outputs
      .flatMap((output) => output.output)
      .filter((item) => item.type === 'chunk');
    expect(chunks).toHaveLength(1);

    const resultValue = new Function(
      `${chunks[0].code}\nreturn ConfigEditorRegression.exerciseConfigEditor();`
    )();
    expect(resultValue).toEqual({
      themes: ['light', 'dark'].map((theme) => ({
        theme,
        document: 'config-version: 8\nserver:\n  port: 8318\n',
        editable: false,
      })),
      diffCount: 1,
    });

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
