import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/nodes/DrawingBoardNode.tsx', 'utf8');

test('drawing board shape tools ignore non-primary mouse buttons', () => {
  assert.match(source, /if \(event\.button !== 0\) \{[\s\S]*actionRef\.current = null[\s\S]*cutoutDragRef\.current = null[\s\S]*return;\s*\}/);
});

test('drawing board renders rotated shapes and removes click-sized shape ghosts', () => {
  assert.match(source, /function isDegenerateShapeElement\(el: BoardElement\)/);
  assert.match(source, /action\.type === 'shape' && el\.id === action\.id && isDegenerateShapeElement\(el\)/);
  assert.match(source, /ctx\.translate\(center\.x, center\.y\);[\s\S]*ctx\.rotate\(\(rotation \* Math\.PI\) \/ 180\);[\s\S]*drawArrowHead\(ctx, start, end, el\.size\)/);
});

test('drawing board owns undo redo while focused without stealing text input undo', () => {
  assert.match(source, /const historyRef = useRef<BoardLayer\[\]\[\]>\(\[\]\)/);
  assert.match(source, /function isUndoShortcutEvent/);
  assert.match(source, /function isRedoShortcutEvent/);
  assert.match(source, /!isEditableEventTarget\(event\.target\)[\s\S]*undoBoardHistory\(\)/);
});

test('drawing board exposes selected text editing controls', () => {
  assert.match(source, /const selectedTextElement = selectedElement\?\.element\.kind === 'text' \? selectedElement\.element : null/);
  assert.match(source, /<Type size=\{12\} \/> 选中文字/);
  assert.match(source, /onChange=\{\(e\) => updateSelectedTextElement\(\{ text: e\.target\.value \}\)\}/);
  assert.match(source, /const \[selectedTextEditorOpen, setSelectedTextEditorOpen\] = useState\(false\)/);
  assert.match(source, /title="放大编辑文字"/);
  assert.match(source, /const renderSelectedTextEditor = \(\) => \{/);
  assert.match(source, /className="t8-input nodrag nowheel min-h-0 flex-1 resize-none/);
});

test('drawing board tool shortcuts stay scoped to board editing', () => {
  assert.match(source, /const TOOL_SHORTCUTS: Array<\{ tool: BoardTool; shortcut: string; key: string; shiftKey\?: boolean \}> = \[/);
  assert.match(source, /\{ tool: 'select', shortcut: 'S', key: 's' \}/);
  assert.match(source, /\{ tool: 'text', shortcut: 'T', key: 't' \}/);
  assert.match(source, /\{ tool: 'eraser', shortcut: 'E', key: 'e' \}/);
  assert.match(source, /\{ tool: 'pen', shortcut: 'B', key: 'b' \}/);
  assert.match(source, /\{ tool: 'arrow', shortcut: 'A', key: 'a' \}/);
  assert.match(source, /\{ tool: 'cutout-pen', shortcut: 'P', key: 'p' \}/);
  assert.match(source, /\{ tool: 'cutout-lasso', shortcut: 'L', key: 'l' \}/);
  assert.match(source, /\{ tool: 'circle', shortcut: 'R', key: 'r' \}/);
  assert.match(source, /\{ tool: 'rect', shortcut: 'Shift\+S', key: 's', shiftKey: true \}/);
  assert.match(source, /function toolFromShortcutEvent/);
  assert.match(source, /if \(event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey\) return null/);
  assert.match(source, /!isEditableEventTarget\(event\.target\)[\s\S]*toolFromShortcutEvent\(event\)[\s\S]*applyTool\(shortcutTool\)/);
  assert.match(source, /if \(!selected \|\| selectedTextEditorOpen\) return/);
});

test('drawing board exposes in-node shortcut help and hover shortcut hints', () => {
  assert.match(source, /const \[shortcutHelpOpen, setShortcutHelpOpen\] = useState\(false\)/);
  assert.match(source, /const renderShortcutHelp = \(\) => \(/);
  assert.match(source, /仅在画板被选中，且焦点不在输入框、文字编辑框或下拉框时生效/);
  assert.match(source, /title="画板快捷键"/);
  assert.match(source, /<HelpCircle size=\{14\} \/>/);
  assert.match(source, /title=\{`\$\{TOOL_LABEL\[value\]\}\$\{shortcut \? ` \(\$\{shortcut\}\)` : ''\}`\}/);
});
