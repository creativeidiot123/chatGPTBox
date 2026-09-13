import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  chooseChatGptTab,
  isNormalChatGptTab,
  sendPageContextToChatGPT,
} from '../../../src/background/normal-chatgpt-context.mjs'

test('recognizes only normal chatgpt.com tabs', () => {
  assert.equal(isNormalChatGptTab({ url: 'https://chatgpt.com/c/123' }), true)
  assert.equal(isNormalChatGptTab({ url: 'https://chat.openai.com/' }), false)
  assert.equal(isNormalChatGptTab({ url: 'https://example.com/' }), false)
  assert.equal(isNormalChatGptTab({ url: 'not a url' }), false)
})

test('prefers the most recently used ChatGPT tab in the source window', () => {
  const tabs = [
    { id: 1, windowId: 2, url: 'https://chatgpt.com/c/old', lastAccessed: 10 },
    { id: 2, windowId: 2, url: 'https://chatgpt.com/c/new', lastAccessed: 20 },
    { id: 3, windowId: 9, url: 'https://chatgpt.com/c/other', lastAccessed: 99 },
  ]

  assert.equal(chooseChatGptTab(tabs, 2).id, 2)
})

test('creates a ChatGPT tab when none exists and forwards page context', async () => {
  const calls = []
  const browser = {
    tabs: {
      async query(query) {
        calls.push(['query', query])
        return []
      },
      async sendMessage(tabId, message) {
        calls.push(['sendMessage', tabId, message])
        if (message.type === 'GET_PAGE_CONTEXT') {
          return {
            title: 'Example',
            url: 'https://example.com/page',
            selection: '',
            content: 'Useful page text',
          }
        }
        return { ok: true }
      },
      async create(options) {
        calls.push(['create', options])
        return { id: 99, windowId: 4, url: 'https://chatgpt.com/' }
      },
      async update(tabId, options) {
        calls.push(['update', tabId, options])
        return { id: tabId }
      },
    },
    windows: {
      async update(windowId, options) {
        calls.push(['windowUpdate', windowId, options])
      },
    },
  }

  const result = await sendPageContextToChatGPT(
    { id: 7, windowId: 4, url: 'https://example.com/page' },
    browser,
  )

  assert.deepEqual(result, { sourceTabId: 7, targetTabId: 99 })
  assert.ok(
    calls.some(
      ([name, tabId, message]) =>
        name === 'sendMessage' &&
        tabId === 99 &&
        message?.type === 'INSERT_CHATGPT_PAGE_CONTEXT',
    ),
  )
  assert.ok(calls.some(([name]) => name === 'create'))
})

test('refuses to use ChatGPT itself as the source page', async () => {
  await assert.rejects(
    sendPageContextToChatGPT(
      { id: 4, windowId: 1, url: 'https://chatgpt.com/c/123' },
      {
        tabs: {
          async query() {
            return []
          },
        },
      },
    ),
    /webpage you want ChatGPT to inspect/,
  )
})
