/**
 * @file Small DOM helpers.
 */

/**
 * @param {string} selector - CSS selector.
 * @param {ParentNode} [root=document] - Search root.
 * @returns {HTMLElement} First match (throws when missing, which is a programming error).
 */
export function $(selector, root = document) {
  const node = root.querySelector(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return /** @type {HTMLElement} */ (node);
}

/**
 * @param {string} selector - CSS selector.
 * @param {ParentNode} [root=document] - Search root.
 * @returns {HTMLElement[]} All matches.
 */
export function $$(selector, root = document) {
  return /** @type {HTMLElement[]} */ ([...root.querySelectorAll(selector)]);
}

/**
 * @typedef {object} ElementOptions
 * @property {string} [className]
 * @property {string} [text] - Text content.
 * @property {Record<string, string | boolean | number | null | undefined>} [attrs] - Attributes; false/null/undefined are skipped.
 * @property {Record<string, string>} [dataset]
 * @property {Record<string, EventListener>} [on] - Event listeners.
 */

/**
 * Creates an element.
 * @param {string} tag - Tag name.
 * @param {ElementOptions} [options] - Element setup.
 * @param {(Node | string | null | undefined | false)[] | Node | string} [children] - Child nodes.
 * @returns {HTMLElement} The element.
 */
export function h(tag, { className, text, attrs, dataset, on } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  for (const [name, value] of Object.entries(attrs || {})) {
    if (value === false || value == null) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
  Object.assign(node.dataset, dataset);
  for (const [event, listener] of Object.entries(on || {})) node.addEventListener(event, listener);
  for (const child of [].concat(children)) if (child || child === 0) node.append(child);
  return node;
}

/**
 * Replaces the options of a select element and restores its value.
 * @param {HTMLSelectElement} select - Select to fill.
 * @param {{ value: string, label: string }[]} options - Options in order.
 * @param {string} value - Value to select.
 * @returns {void}
 */
export function setOptions(select, options, value) {
  const signature = options.map((o) => `${o.value}\u0000${o.label}`).join('\u0001');
  if (select.dataset.signature !== signature) {
    select.replaceChildren(...options.map((o) => h('option', { text: o.label, attrs: { value: o.value } })));
    select.dataset.signature = signature;
  }
  if (document.activeElement !== select) select.value = value;
}
