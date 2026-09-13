import { getCoreContentText } from '../utils/get-core-content-text.mjs'

export const MAX_PAGE_CONTEXT_CHARS = 30000
export const MAX_SELECTION_CONTEXT_CHARS = 8000

export function trimContextText(text, maxChars) {
  const normalized = String(text || '').trim()
  if (normalized.length <= maxChars) return normalized

  const headLength = Math.floor(maxChars * 0.7)
  const tailLength = maxChars - headLength
  const omitted = normalized.length - maxChars

  return (
    normalized.slice(0, headLength) +
    `\n\n[... ${omitted} characters omitted ...]\n\n` +
    normalized.slice(-tailLength)
  )
}

export function getCurrentPageContext() {
  const selection = trimContextText(
    window.getSelection()?.toString() || '',
    MAX_SELECTION_CONTEXT_CHARS,
  )
  const content = trimContextText(getCoreContentText(), MAX_PAGE_CONTEXT_CHARS)

  return {
    title: document.title || '',
    url: location.href,
    selection,
    content,
  }
}

export function buildChatGptContextDraft(context, existingDraft = '') {
  const sections = [
    '[Browser page context]',
    `Title: ${context?.title || 'Untitled page'}`,
    `URL: ${context?.url || ''}`,
  ]

  if (context?.selection) {
    sections.push('', 'Selected text:', context.selection)
  }

  if (context?.content) {
    sections.push('', 'Page content:', context.content)
  }

  sections.push('[/Browser page context]')

  const existing = String(existingDraft || '').trim()
  return existing ? `${sections.join('\n')}\n\n${existing}` : `${sections.join('\n')}\n\n`
}

export function findChatGptComposer(root = document) {
  const selectors = [
    '#prompt-textarea',
    '[data-testid="prompt-textarea"]',
    'textarea[placeholder*="Message"]',
    'textarea',
    '[contenteditable="true"][data-lexical-editor="true"]',
    '[contenteditable="true"]',
  ]

  for (const selector of selectors) {
    const element = root.querySelector(selector)
    if (element) return element
  }
  return null
}

export function getComposerText(composer) {
  if (!composer) return ''
  if ('value' in composer && typeof composer.value === 'string') return composer.value
  return composer.innerText || composer.textContent || ''
}

function setFormControlValue(element, value) {
  const prototype =
    element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  descriptor?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function setContentEditableValue(element, value) {
  element.focus()

  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(element)
  selection?.removeAllRanges()
  selection?.addRange(range)

  let inserted = false
  try {
    inserted = Boolean(document.execCommand?.('insertText', false, value))
  } catch {
    inserted = false
  }

  if (!inserted) {
    element.textContent = value
    element.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: value,
      }),
    )
  }
}

export function setComposerText(composer, value) {
  if (!composer) return false

  composer.focus()
  if ('value' in composer && typeof composer.value === 'string') {
    setFormControlValue(composer, value)
  } else if (composer.isContentEditable || composer.getAttribute('contenteditable') === 'true') {
    setContentEditableValue(composer, value)
  } else {
    return false
  }

  composer.focus()
  return true
}

async function waitForComposer(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const composer = findChatGptComposer()
    if (composer) return composer
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return null
}

export async function insertPageContextIntoChatGPT(context) {
  if (location.hostname !== 'chatgpt.com') {
    return { ok: false, error: 'This tab is not chatgpt.com.' }
  }

  const composer = await waitForComposer()
  if (!composer) {
    return { ok: false, error: 'Could not find the ChatGPT composer.' }
  }

  const draft = buildChatGptContextDraft(context, getComposerText(composer))
  if (!setComposerText(composer, draft)) {
    return { ok: false, error: 'Could not update the ChatGPT composer.' }
  }

  return { ok: true }
}
