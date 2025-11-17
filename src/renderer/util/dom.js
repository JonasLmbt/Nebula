// renderer/util/dom.js
// Small utility helpers for safe DOM interaction.

/**
 * Query selector shorthand.
 */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

/**
 * Query selector all shorthand (returns array).
 */
export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Add event listener shorthand.
 */
export function on(el, event, handler, options) {
  if (!el) return;
  el.addEventListener(event, handler, options);
}

/**
 * Add event listener that runs only once.
 */
export function listenOnce(el, event, handler) {
  if (!el) return;
  const wrapper = (e) => {
    el.removeEventListener(event, wrapper);
    handler(e);
  };
  el.addEventListener(event, wrapper);
}

/**
 * Toggle a class on an element.
 */
export function toggleClass(el, cls, force) {
  if (!el) return;
  el.classList.toggle(cls, force);
}

/**
 * Ensure a class is added.
 */
export function addClass(el, cls) {
  if (el && !el.classList.contains(cls)) {
    el.classList.add(cls);
  }
}

/**
 * Ensure a class is removed.
 */
export function removeClass(el, cls) {
  if (el && el.classList.contains(cls)) {
    el.classList.remove(cls);
  }
}

/**
 * Create an element with optional attributes and children.
 */
export function create(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "style") {
      Object.assign(el.style, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.substring(2), value);
    } else {
      el.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (typeof child === "string") {
      el.appendChild(document.createTextNode(child));
    } else if (child) {
      el.appendChild(child);
    }
  }
  return el;
}
