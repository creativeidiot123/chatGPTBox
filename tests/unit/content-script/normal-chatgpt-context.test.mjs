import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildChatGptContextDraft,
  trimContextText,
} from '../../../src/content-script/normal-chatgpt-context.mjs'

test('keeps short context unchanged', () => {
  assert.equal(trimContextText('  hello world  ', 100), 'hello world')
})

test('trims oversized context while preserving both ends', () => {
  const input = 'A'.repeat(80) + 'B'.repeat(80)
  const output = trimContextText(input, 100)

  assert.match(output, /^A+/)
  assert.match(output, /B+$/)
  assert.match(output, /characters omitted/)
})

test('builds page context before an existing unsent draft', () => {
  const draft = buildChatGptContextDraft(
    {
      title: 'Example title',
      url: 'https://example.com/',
      selection: 'important selection',
      content: 'page text',
    },
    'what does this mean?',
  )

  assert.match(draft, /^\[Browser page context\]/)
  assert.match(draft, /Selected text:\nimportant selection/)
  assert.match(draft, /Page content:\npage text/)
  assert.match(draft, /\[\/Browser page context\]\n\nwhat does this mean\?$/)
})

test('omits the selected-text section when nothing is selected', () => {
  const draft = buildChatGptContextDraft({
    title: 'Example',
    url: 'https://example.com/',
    selection: '',
    content: 'page text',
  })

  assert.equal(draft.includes('Selected text:'), false)
})
