import Browser from 'webextension-polyfill'

const CHATGPT_HOME = 'https://chatgpt.com/'
const MAX_SEND_ATTEMPTS = 24
const SEND_RETRY_DELAY_MS = 250

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function isNormalChatGptTab(tab) {
  if (!tab?.url) return false
  try {
    const url = new URL(tab.url)
    return url.protocol === 'https:' && url.hostname === 'chatgpt.com'
  } catch {
    return false
  }
}

export function chooseChatGptTab(tabs, sourceWindowId) {
  const candidates = (tabs || []).filter(isNormalChatGptTab)
  if (!candidates.length) return null

  const sameWindow = candidates.filter((tab) => tab.windowId === sourceWindowId)
  const pool = sameWindow.length ? sameWindow : candidates

  return [...pool].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0]
}

async function getSourceTab(sourceTab, browser) {
  if (sourceTab?.id != null) return sourceTab

  const tabs = await browser.tabs.query({ active: true, currentWindow: true })
  return tabs?.[0] || null
}

async function sendMessageWithRetry(browser, tabId, message) {
  let lastError
  for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
    try {
      return await browser.tabs.sendMessage(tabId, message)
    } catch (error) {
      lastError = error
      if (attempt < MAX_SEND_ATTEMPTS - 1) await sleep(SEND_RETRY_DELAY_MS)
    }
  }
  throw lastError || new Error('Unable to reach the ChatGPT tab.')
}

export async function sendPageContextToChatGPT(sourceTab, browser = Browser) {
  const source = await getSourceTab(sourceTab, browser)
  if (!source?.id) throw new Error('No active source tab is available.')

  if (isNormalChatGptTab(source)) {
    throw new Error('Run page context from the webpage you want ChatGPT to inspect.')
  }

  const context = await browser.tabs.sendMessage(source.id, {
    type: 'GET_PAGE_CONTEXT',
  })

  if (!context?.url || (!context.content && !context.selection)) {
    throw new Error('The source page did not provide usable context.')
  }

  const tabs = await browser.tabs.query({})
  let target = chooseChatGptTab(tabs, source.windowId)

  if (!target) {
    target = await browser.tabs.create({
      url: CHATGPT_HOME,
      active: false,
    })
  }

  if (!target?.id) throw new Error('Unable to open a ChatGPT tab.')

  const result = await sendMessageWithRetry(browser, target.id, {
    type: 'INSERT_CHATGPT_PAGE_CONTEXT',
    data: context,
  })

  if (!result?.ok) {
    throw new Error(result?.error || 'ChatGPT did not accept the page context.')
  }

  await browser.tabs.update(target.id, { active: true })
  if (target.windowId != null && browser.windows?.update) {
    await browser.windows.update(target.windowId, { focused: true }).catch(() => {})
  }

  return {
    sourceTabId: source.id,
    targetTabId: target.id,
  }
}
